/**
 * Schema bootstrap + forward-only migrations.
 *
 * M1 ships only the `meta` table (proves the encrypted lifecycle). M2 adds the
 * full case/person/hearing/… schema as additional migration steps. The runner
 * is keyed on meta.schema_version so adding tables is purely additive.
 */

import type { Bind } from "./types";

export const SCHEMA_VERSION = 3;

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
