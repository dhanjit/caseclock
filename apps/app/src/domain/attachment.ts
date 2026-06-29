/**
 * Image attachments (REQUIREMENTS §10) — per-case photos tagged to an accused,
 * the place of occurrence, an evidence/exhibit, or a document. Powers the gallery
 * and the mind-map node thumbnails.
 *
 * Storage split (perf, see db/blob-store.ts): the small THUMBNAIL lives in-vault
 * as a BLOB column (fast grid render, included in the .ccbak backup); the full
 * ORIGINAL lives in the encrypted OPFS sidecar, referenced by `blobRef`.
 */

import type { DbClient } from "@/db/types";
import { BlobStore } from "@/db/blob-store";
import { newId } from "@/lib/id";

export type AttachmentKind = "accused" | "place" | "evidence" | "doc" | "other";

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  accused: "Accused",
  place: "Place of occurrence",
  evidence: "Evidence / exhibit",
  doc: "Document",
  other: "Other",
};

/** Attachment metadata (no image bytes). */
export interface AttachmentMeta {
  id: string;
  caseId: string;
  kind: AttachmentKind;
  refId: string | null; // linked person/evidence/doc id (null for place/other)
  mime: string;
  caption: string | null;
  blobRef: string; // sidecar original (plaintext SHA-256)
  createdAt: number;
}

/** Metadata + the in-vault thumbnail bytes (for grid / mind-map rendering). */
export interface AttachmentThumb extends AttachmentMeta {
  thumb: Uint8Array;
}

/** Input for a new attachment: caller supplies the downscaled thumb + the original. */
export interface NewAttachment {
  caseId: string;
  kind: AttachmentKind;
  refId?: string | null;
  mime: string;
  caption?: string | null;
  thumb: Uint8Array;
  original: Uint8Array;
}

// A type alias (not interface) so it satisfies the DbRow index-signature constraint.
type AttachmentRow = {
  id: string;
  case_id: string;
  kind: string;
  ref_id: string | null;
  mime: string;
  caption: string | null;
  thumb: Uint8Array;
  blob_ref: string;
  created_at: number;
};

function toThumb(r: AttachmentRow): AttachmentThumb {
  return {
    id: r.id,
    caseId: r.case_id,
    kind: r.kind as AttachmentKind,
    refId: r.ref_id,
    mime: r.mime,
    caption: r.caption,
    blobRef: r.blob_ref,
    createdAt: r.created_at,
    thumb: r.thumb,
  };
}

const COLS = "id, case_id, kind, ref_id, mime, caption, thumb, blob_ref, created_at";

export class AttachmentRepository {
  private readonly blobs: BlobStore;

  // BlobStore is injectable so tests can supply an in-memory backend (no OPFS).
  constructor(private readonly client: DbClient, blobs?: BlobStore) {
    this.blobs = blobs ?? new BlobStore(client);
  }

  async listForCase(caseId: string): Promise<AttachmentThumb[]> {
    const rows = await this.client.query<AttachmentRow>(
      `SELECT ${COLS} FROM attachments WHERE case_id = ? ORDER BY created_at DESC`,
      [caseId],
    );
    return rows.map(toThumb);
  }

  /**
   * Add many images in ONE transaction (a single vault reseal). Each original is
   * written to the sidecar first (content-addressed, so re-adding the same photo
   * is free); then all metadata rows commit together.
   */
  async addMany(items: NewAttachment[], now: number = Date.now()): Promise<void> {
    if (items.length === 0) return;
    const statements = [];
    for (const it of items) {
      const blobRef = await this.blobs.put(it.original);
      statements.push({
        sql: `INSERT INTO attachments (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          newId("att"),
          it.caseId,
          it.kind,
          it.refId ?? null,
          it.mime,
          it.caption ?? null,
          it.thumb,
          blobRef,
          now,
        ],
      });
    }
    await this.client.execMany(statements);
  }

  async remove(id: string): Promise<void> {
    const rows = await this.client.query<{ blob_ref: string }>(
      "SELECT blob_ref FROM attachments WHERE id = ?",
      [id],
    );
    await this.client.exec("DELETE FROM attachments WHERE id = ?", [id]);
    // GC the sidecar original only when no other attachment references it (dedup).
    if (rows.length) {
      const others = await this.client.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM attachments WHERE blob_ref = ?",
        [rows[0].blob_ref],
      );
      if ((others[0]?.n ?? 0) === 0) await this.blobs.remove(rows[0].blob_ref);
    }
  }

  /** Re-tag / re-caption an attachment in place. */
  async update(id: string, patch: { kind?: AttachmentKind; refId?: string | null; caption?: string | null }): Promise<void> {
    const sets: string[] = [];
    const binds: (string | null)[] = [];
    if (patch.kind !== undefined) {
      sets.push("kind = ?");
      binds.push(patch.kind);
    }
    if (patch.refId !== undefined) {
      sets.push("ref_id = ?");
      binds.push(patch.refId);
    }
    if (patch.caption !== undefined) {
      sets.push("caption = ?");
      binds.push(patch.caption);
    }
    if (sets.length === 0) return;
    await this.client.exec(`UPDATE attachments SET ${sets.join(", ")} WHERE id = ?`, [...binds, id]);
  }

  /** Fetch + decrypt the full-resolution original (for the lightbox). */
  async getOriginal(blobRef: string): Promise<Uint8Array | null> {
    return this.blobs.get(blobRef);
  }
}
