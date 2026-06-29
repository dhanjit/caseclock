/**
 * Case repository (PLAN §3, M2). Persists a case + its people + hearings as one
 * aggregate (JSON in the encrypted DB), with a few denormalized columns for list
 * queries. The rules engine (M3) consumes the aggregate's parts.
 */

import type { DbClient } from "@/db/types";
import { BlobStore } from "@/db/blob-store";
import { blobRefCount } from "@/db/blob-refs";
import type {
  CaseRecord,
  EvidenceRecord,
  HearingRecord,
  PersonRecord,
  ProcessRequestRecord,
  SupervisionEntryRecord,
  TaskRecord,
} from "./types";

export interface CaseAggregate {
  case: CaseRecord;
  persons: PersonRecord[];
  hearings: HearingRecord[];
  supervisionEntries: SupervisionEntryRecord[];
  tasks: TaskRecord[];
  evidence?: EvidenceRecord[]; // §5 / heading 9 — added in Phase 3 (optional for old records)
  processRequests?: ProcessRequestRecord[]; // §6 Process & Requests tracker (V3 — optional for old records)
}

export class CaseRepository {
  private readonly blobs: BlobStore;
  // BlobStore is injectable so tests can supply an in-memory backend (no OPFS).
  constructor(private readonly db: DbClient, blobs?: BlobStore) {
    this.blobs = blobs ?? new BlobStore(db);
  }

  async save(agg: CaseAggregate, now: number = Date.now()): Promise<void> {
    const c = agg.case;
    await this.db.exec(
      `INSERT INTO cases (id, fir_number, uapa, status, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         fir_number = excluded.fir_number,
         uapa       = excluded.uapa,
         status     = excluded.status,
         data       = excluded.data,
         updated_at = excluded.updated_at`,
      [c.id, c.firNumber, c.uapaFlag ? 1 : 0, c.status, JSON.stringify(agg), now],
    );
  }

  async get(id: string): Promise<CaseAggregate | null> {
    const rows = await this.db.query<{ data: string }>("SELECT data FROM cases WHERE id = ?", [id]);
    return rows.length ? (JSON.parse(rows[0].data) as CaseAggregate) : null;
  }

  async list(): Promise<CaseAggregate[]> {
    const rows = await this.db.query<{ data: string }>("SELECT data FROM cases ORDER BY updated_at DESC");
    return rows.map((r) => JSON.parse(r.data) as CaseAggregate);
  }

  async remove(id: string): Promise<void> {
    // Collect the sidecar blob_refs of this case's child rows BEFORE deleting them
    // (there are no SQL cascades here — see §10/§7 storage). Then delete the case
    // and ALL its children atomically (one reseal), and GC any sidecar original no
    // longer referenced by any table — so a deleted case leaves nothing on device
    // (data-minimisation / retention).
    let refs: string[] = [];
    try {
      const rows = await this.db.query<{ blob_ref: string }>(
        `SELECT blob_ref FROM attachments WHERE case_id = ? AND blob_ref IS NOT NULL
         UNION SELECT blob_ref FROM documents WHERE case_id = ? AND blob_ref IS NOT NULL`,
        [id, id],
      );
      refs = rows.map((r) => r.blob_ref);
    } catch {
      // attachments/documents tables may not exist on an older schema — nothing to collect.
    }
    await this.db.execMany([
      { sql: "DELETE FROM attachments WHERE case_id = ?", bind: [id] },
      { sql: "DELETE FROM documents WHERE case_id = ?", bind: [id] },
      { sql: "DELETE FROM cases WHERE id = ?", bind: [id] },
    ]);
    for (const ref of refs) {
      if ((await blobRefCount(this.db, ref)) === 0) await this.blobs.remove(ref);
    }
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM cases");
    return rows[0]?.n ?? 0;
  }
}
