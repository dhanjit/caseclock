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
  ChargesheetRecord,
  CommsRequestRecord,
  CustodyMovementRecord,
  EvidenceRecord,
  HearingRecord,
  PersonRecord,
  PlanEntry,
  ProcessRequestRecord,
  ProgressEntry,
  SupervisionEntryRecord,
  TaskRecord,
  TowerDumpRecord,
} from "./types";

export interface CaseAggregate {
  case: CaseRecord;
  persons: PersonRecord[];
  hearings: HearingRecord[];
  supervisionEntries: SupervisionEntryRecord[];
  tasks: TaskRecord[];
  evidence?: EvidenceRecord[]; // §5 / heading 9 — added in Phase 3 (optional for old records)
  processRequests?: ProcessRequestRecord[]; // §6 Process & Requests tracker (V3 — optional for old records)
  chargesheets?: ChargesheetRecord[]; // V4-DELTA N1 — chargesheet register (optional for old records)
  commsRequests?: CommsRequestRecord[]; // V4-DELTA N3 — CDR/IPDR/IMEI registers
  towerDumps?: TowerDumpRecord[]; // V4-DELTA N3 — tower-dump register
  custodyMovements?: CustodyMovementRecord[]; // V4-DELTA N2 — chain-of-custody ledger
  progressLog?: ProgressEntry[]; // T3 — heading-8 dated+tagged log
  planLog?: PlanEntry[]; // T3 — heading-13 dated action points
}

/** True once any chargesheet is on the register (V6 `csFiled`) — falls back to the
 * legacy case-level date for aggregates saved before the register existed. */
export function chargesheetFiled(agg: Pick<CaseAggregate, "case" | "chargesheets">): boolean {
  return (agg.chargesheets ?? []).length > 0 || !!agg.case.chargesheetFiledDate;
}

/**
 * Normalize an aggregate read from the vault (V4-DELTA §6 migrations, JSON-level).
 *
 * ONE-TIME legacy migrations — gated on `legacyMigrated` and stamped after running,
 * so an officer's later CLEAR of a migrated value is never silently resurrected
 * (review finding):
 *  - legacy `dgOrderDate` copies onto `dgApprovedDate`
 *  - the two legacy fixed sanction fields lift into `sanctions[]`
 *  - a case-level arrestDate copies to in-custody accused missing their own
 *  - a legacy case-level `chargesheetFiledDate` with an EMPTY register becomes
 *    register row #1 (kind main, case-wide coverage) per V4-DELTA §6
 *
 * ALWAYS-ON derivation: `chargesheetFiledDate` = earliest register date once any
 * row exists (the register is the source of truth; rows are editable in the UI).
 */
export function hydrateAggregate(agg: CaseAggregate): CaseAggregate {
  const c = { ...agg.case };
  let chargesheets = agg.chargesheets ?? [];
  let persons = agg.persons;

  if (!c.legacyMigrated) {
    if (!c.dgApprovedDate && c.dgOrderDate) c.dgApprovedDate = c.dgOrderDate;

    if (!c.sanctions) {
      const legacy: CaseRecord["sanctions"] = [];
      if (c.sanctionStatutory && c.sanctionStatutory !== "na")
        legacy.push({ id: `${c.id}-sanction-statutory`, kind: "Statutory (UAPA s.45)", state: c.sanctionStatutory, date: c.sanctionStatutory === "obtained" ? c.rule4SanctionDate ?? null : null });
      if (c.sanctionDg && c.sanctionDg !== "na")
        legacy.push({ id: `${c.id}-sanction-dg`, kind: "DG sanction", state: c.sanctionDg, date: null });
      if (legacy.length) c.sanctions = legacy;
    }

    const inCustody = new Set(["police_custody", "judicial_custody", "charge_sheeted"]);
    persons = agg.persons.map((p) =>
      p.role === "accused" && !p.arrestDate && c.arrestDate && p.accusedStatus && inCustody.has(p.accusedStatus)
        ? { ...p, arrestDate: c.arrestDate }
        : p,
    );

    if (chargesheets.length === 0 && c.chargesheetFiledDate) {
      // V4-DELTA §6: the legacy single date becomes register row #1. Empty
      // accusedIds = case-wide coverage (legacy semantics), so clocks behave
      // exactly as before the register existed.
      chargesheets = [{
        id: `${c.id}-cs-legacy`,
        caseId: c.id,
        kind: "main",
        date: c.chargesheetFiledDate,
        accusedIds: [],
        note: "Migrated from the case-level filing date.",
      }];
    }

    c.legacyMigrated = true;
  }

  if (chargesheets.length > 0) {
    c.chargesheetFiledDate = [...chargesheets].map((cs) => cs.date).sort()[0];
  }

  // T3: heading-8/13 free-text fields seed the dated logs (deterministic ids —
  // idempotent; the free-text fields are no longer editable, so no resurrect risk).
  let progressLog = agg.progressLog;
  if (!progressLog) {
    progressLog = c.investigationProgress?.trim()
      ? [{ id: `${c.id}-h8-legacy`, date: c.lastTouchedAt ?? c.firDate, tag: "General" as const, note: c.investigationProgress.trim() }]
      : [];
  }
  let planLog = agg.planLog;
  if (!planLog) {
    planLog = c.planOfAction?.trim()
      ? [{ id: `${c.id}-h13-legacy`, date: c.lastTouchedAt ?? c.firDate, note: c.planOfAction.trim() }]
      : [];
  }

  return { ...agg, case: c, persons, chargesheets, progressLog, planLog };
}

export class CaseRepository {
  private readonly blobs: BlobStore;
  // BlobStore is injectable so tests can supply an in-memory backend (no OPFS).
  constructor(private readonly db: DbClient, blobs?: BlobStore) {
    this.blobs = blobs ?? new BlobStore(db);
  }

  async save(agg: CaseAggregate, now: number = Date.now()): Promise<void> {
    // Persist hydrated so derived fields (chargesheetFiledDate ← register) are
    // consistent in storage too, not only after read.
    agg = hydrateAggregate(agg);
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
    return rows.length ? hydrateAggregate(JSON.parse(rows[0].data) as CaseAggregate) : null;
  }

  async list(): Promise<CaseAggregate[]> {
    const rows = await this.db.query<{ data: string }>("SELECT data FROM cases ORDER BY updated_at DESC");
    return rows.map((r) => hydrateAggregate(JSON.parse(r.data) as CaseAggregate));
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
