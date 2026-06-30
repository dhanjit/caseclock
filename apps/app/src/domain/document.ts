/**
 * Connected document repository (REQUIREMENTS §7). A case-wise register of letters
 * / reports / orders — number, date, subject, direction, links — fed by on-demand
 * import (index file, filename convention, PDF/Word text, OCR, local LLM) or manual
 * entry. Every machine-extracted entry is a DRAFT until the officer confirms it
 * (never written as verified truth). Optional originals live in the encrypted
 * sidecar (blobRef); index-only pointers carry none.
 */

import type { DbClient } from "@/db/types";
import { BlobStore } from "@/db/blob-store";
import { blobRefCount } from "@/db/blob-refs";
import { newId } from "@/lib/id";

/** Where a document's fields came from (drives the confidence/draft treatment). */
export type DocumentSource = "manual" | "index" | "filename" | "pdftext" | "ocr" | "llm";

export type DocumentStatus = "draft" | "confirmed";

export type DocumentDirection = "in" | "out";

export const DOCUMENT_SOURCE_LABEL: Record<DocumentSource, string> = {
  manual: "Manual",
  index: "Index file",
  filename: "Filename",
  pdftext: "PDF/Word text",
  ocr: "OCR (scan)",
  llm: "Local AI (draft)",
};

export interface DocumentRecord {
  id: string;
  caseId: string;
  letterNo: string | null;
  dateOnDoc: string | null; // ISO date on the document
  type: string | null; // e.g. "FSL report", "LOC", "sanction order"
  subject: string | null;
  direction: DocumentDirection | null;
  forwardingDate: string | null;
  status: DocumentStatus;
  source: DocumentSource;
  confidence: number | null; // 0..1 for extracted fields (null for manual)
  linkedAccusedId: string | null;
  linkedEvidenceId: string | null;
  fileName: string | null;
  mime: string | null;
  blobRef: string | null; // sidecar original (null for index-only pointers)
  createdAt: number;
}

/** Draft fields proposed by an extractor, before the officer confirms + saves. */
export interface DocumentDraft {
  letterNo?: string | null;
  dateOnDoc?: string | null;
  type?: string | null;
  subject?: string | null;
  direction?: DocumentDirection | null;
  forwardingDate?: string | null;
  source: DocumentSource;
  confidence?: number | null;
  linkedAccusedId?: string | null;
  linkedEvidenceId?: string | null;
  fileName?: string | null;
  mime?: string | null;
  /** The original bytes to stash in the sidecar on save (optional). */
  original?: Uint8Array | null;
}

type DocumentRow = {
  id: string;
  case_id: string;
  letter_no: string | null;
  date_on_doc: string | null;
  type: string | null;
  subject: string | null;
  direction: string | null;
  forwarding_date: string | null;
  status: string;
  source: string;
  confidence: number | null;
  linked_accused_id: string | null;
  linked_evidence_id: string | null;
  file_name: string | null;
  mime: string | null;
  blob_ref: string | null;
  created_at: number;
};

function toRecord(r: DocumentRow): DocumentRecord {
  return {
    id: r.id,
    caseId: r.case_id,
    letterNo: r.letter_no,
    dateOnDoc: r.date_on_doc,
    type: r.type,
    subject: r.subject,
    direction: (r.direction as DocumentDirection | null) ?? null,
    forwardingDate: r.forwarding_date,
    status: (r.status as DocumentStatus) ?? "draft",
    source: (r.source as DocumentSource) ?? "manual",
    confidence: r.confidence,
    linkedAccusedId: r.linked_accused_id,
    linkedEvidenceId: r.linked_evidence_id,
    fileName: r.file_name,
    mime: r.mime,
    blobRef: r.blob_ref,
    createdAt: r.created_at,
  };
}

const COLS =
  "id, case_id, letter_no, date_on_doc, type, subject, direction, forwarding_date, status, source, confidence, linked_accused_id, linked_evidence_id, file_name, mime, blob_ref, created_at";

export class DocumentRepository {
  private readonly blobs: BlobStore;

  constructor(private readonly client: DbClient, blobs?: BlobStore) {
    this.blobs = blobs ?? new BlobStore(client);
  }

  async listForCase(caseId: string): Promise<DocumentRecord[]> {
    const rows = await this.client.query<DocumentRow>(
      `SELECT ${COLS} FROM documents WHERE case_id = ? ORDER BY COALESCE(date_on_doc, '') DESC, created_at DESC`,
      [caseId],
    );
    return rows.map(toRecord);
  }

  /**
   * Confirm + save many drafts in ONE transaction. Each draft's original (if any)
   * is written to the sidecar first; rows are inserted as `confirmed` (the officer
   * accepted them in the import UI). Returns nothing — caller reloads.
   */
  async addConfirmed(caseId: string, drafts: DocumentDraft[], now: number = Date.now()): Promise<void> {
    if (drafts.length === 0) return;
    const statements = [];
    for (const d of drafts) {
      const blobRef = d.original ? await this.blobs.put(d.original) : null;
      statements.push({
        sql: `INSERT INTO documents (${COLS}) VALUES (${COLS.split(",").map(() => "?").join(", ")})`,
        bind: [
          newId("doc"),
          caseId,
          d.letterNo ?? null,
          d.dateOnDoc ?? null,
          d.type ?? null,
          d.subject ?? null,
          d.direction ?? null,
          d.forwardingDate ?? null,
          "confirmed",
          d.source,
          d.confidence ?? null,
          d.linkedAccusedId ?? null,
          d.linkedEvidenceId ?? null,
          d.fileName ?? null,
          d.mime ?? null,
          blobRef,
          now,
        ],
      });
    }
    await this.client.execMany(statements);
  }

  /** Add a single manual entry. */
  async addManual(caseId: string, draft: DocumentDraft): Promise<void> {
    await this.addConfirmed(caseId, [{ ...draft, source: "manual" }]);
  }

  async update(id: string, patch: Partial<Omit<DocumentRecord, "id" | "caseId" | "createdAt">>): Promise<void> {
    const map: Record<string, string> = {
      letterNo: "letter_no",
      dateOnDoc: "date_on_doc",
      type: "type",
      subject: "subject",
      direction: "direction",
      forwardingDate: "forwarding_date",
      status: "status",
      source: "source",
      confidence: "confidence",
      linkedAccusedId: "linked_accused_id",
      linkedEvidenceId: "linked_evidence_id",
      fileName: "file_name",
      mime: "mime",
      blobRef: "blob_ref",
    };
    const sets: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const [k, col] of Object.entries(map)) {
      if (k in patch) {
        sets.push(`${col} = ?`);
        binds.push((patch as Record<string, string | number | null>)[k] ?? null);
      }
    }
    if (sets.length === 0) return;
    await this.client.exec(`UPDATE documents SET ${sets.join(", ")} WHERE id = ?`, [...binds, id]);
  }

  async remove(id: string): Promise<void> {
    const rows = await this.client.query<{ blob_ref: string | null }>(
      "SELECT blob_ref FROM documents WHERE id = ?",
      [id],
    );
    await this.client.exec("DELETE FROM documents WHERE id = ?", [id]);
    // GC only when NO table (documents OR attachments) still references the blob.
    const ref = rows[0]?.blob_ref;
    if (ref && (await blobRefCount(this.client, ref)) === 0) await this.blobs.remove(ref);
  }

  async getOriginal(blobRef: string): Promise<Uint8Array | null> {
    return this.blobs.get(blobRef);
  }
}
