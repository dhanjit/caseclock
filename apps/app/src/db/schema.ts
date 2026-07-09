/**
 * Schema bootstrap + forward-only migrations.
 *
 * M1 ships only the `meta` table (proves the encrypted lifecycle). M2 adds the
 * full case/person/hearing/… schema as additional migration steps. The runner
 * is keyed on meta.schema_version so adding tables is purely additive.
 */

import type { Bind } from "./types";

export const SCHEMA_VERSION = 5;

/** Ordered migration steps. Index i upgrades the DB from version i to i+1. */
export const MIGRATIONS: string[][] = [
  // 0 → 1 : metadata table
  [
    `CREATE TABLE IF NOT EXISTS meta (
       key   TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,
    // Stamp the version this step brings the DB to (1). applyMigrations() owns
    // the final current-version stamp, so no step hardcodes the latest number.
    `INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '1')`,
  ],
  // 1 → 2 : cases (full aggregate as JSON in `data`; a few denormalized columns
  //         for list queries). The whole DB is encrypted, so JSON-in-column is
  //         safe and avoids a brittle 40-column mapping at this scale.
  [
    `CREATE TABLE IF NOT EXISTS cases (
       id         TEXT PRIMARY KEY,
       fir_number TEXT,
       uapa       INTEGER NOT NULL DEFAULT 0,
       status     TEXT,
       data       TEXT NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_cases_updated ON cases(updated_at DESC)`,
  ],
  // 2 → 3 : attachments (§10 gallery + mind map). Thumbnails live in-vault as a
  //         BLOB (small, fast, backed up); full originals live in the encrypted
  //         OPFS sidecar referenced by blob_ref (see db/blob-store.ts). kind ∈
  //         accused|place|evidence|doc|other; ref_id links to the person/evidence/doc.
  [
    `CREATE TABLE IF NOT EXISTS attachments (
       id         TEXT PRIMARY KEY,
       case_id    TEXT NOT NULL,
       kind       TEXT NOT NULL,
       ref_id     TEXT,
       mime       TEXT NOT NULL,
       caption    TEXT,
       thumb      BLOB NOT NULL,
       blob_ref   TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_attachments_case ON attachments(case_id)`,
  ],
  // 3 → 4 : documents (§7 connected document repository / on-demand import). Each
  //         row is a letter / report / order with its number, date, subject and
  //         links; `status` is draft until the officer confirms an extracted entry
  //         (never verified truth). Originals (if attached) live in the sidecar
  //         (blob_ref); index-only pointers have none.
  [
    `CREATE TABLE IF NOT EXISTS documents (
       id                 TEXT PRIMARY KEY,
       case_id            TEXT NOT NULL,
       letter_no          TEXT,
       date_on_doc        TEXT,
       type               TEXT,
       subject            TEXT,
       direction          TEXT,
       forwarding_date    TEXT,
       status             TEXT NOT NULL,
       source             TEXT NOT NULL,
       confidence         REAL,
       linked_accused_id  TEXT,
       linked_evidence_id TEXT,
       file_name          TEXT,
       mime               TEXT,
       blob_ref           TEXT,
       created_at         INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id)`,
  ],
  // 4 → 5 : alert_state (M8) — per-occurrence OS-notification state so the
  //         daily-OVERDUE digest and per-deadline alarms honor snooze/ack, keyed
  //         (case_id, rule_id, occurrence_date) per RESEARCH §7 (acking today's
  //         review must not suppress next month's). The in-app agenda is NOT
  //         filtered by this — it stays the system of record.
  [
    `CREATE TABLE IF NOT EXISTS alert_state (
       case_id         TEXT NOT NULL,
       rule_id         TEXT NOT NULL,
       occurrence_date TEXT NOT NULL,
       state           TEXT NOT NULL,
       snoozed_until   TEXT,
       updated_at      INTEGER NOT NULL,
       PRIMARY KEY (case_id, rule_id, occurrence_date)
     )`,
  ],
];

/** SQL to bring a freshly-created DB up to SCHEMA_VERSION. */
export function bootstrapSql(): string[] {
  return MIGRATIONS.flat();
}

interface MigrationIO {
  exec: (sql: string, bind?: Bind) => Promise<void>;
  query: <T extends Record<string, unknown>>(sql: string, bind?: Bind) => Promise<T[]>;
}

/**
 * Run any migration steps newer than the DB's stored schema_version, then stamp
 * the current version. Safe on a brand-new DB (no meta table yet → version 0)
 * AND on an existing older-schema vault (upgrade-on-unlock). Idempotent.
 */
export async function applyMigrations(io: MigrationIO): Promise<void> {
  let version = 0;
  try {
    const rows = await io.query<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    if (rows.length) version = Number(rows[0].value) || 0;
  } catch {
    version = 0; // meta table doesn't exist yet
  }
  for (let i = version; i < MIGRATIONS.length; i++) {
    for (const sql of MIGRATIONS[i]) await io.exec(sql);
  }
  await io.exec(
    "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(MIGRATIONS.length)],
  );
}
