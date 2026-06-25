/**
 * Case repository (PLAN §3, M2). Persists a case + its people + hearings as one
 * aggregate (JSON in the encrypted DB), with a few denormalized columns for list
 * queries. The rules engine (M3) consumes the aggregate's parts.
 */

import type { DbClient } from "@/db/types";
import type {
  CaseRecord,
  EvidenceRecord,
  HearingRecord,
  PersonRecord,
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
}

export class CaseRepository {
  constructor(private readonly db: DbClient) {}

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
    await this.db.exec("DELETE FROM cases WHERE id = ?", [id]);
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM cases");
    return rows[0]?.n ?? 0;
  }
}
