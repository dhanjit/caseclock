/**
 * Encrypted offline backup (PLAN §6.6, M9) — the ONLY backup path (no cloud).
 *
 * A backup is a full vault file under a SEPARATE backup passphrase (independent
 * of the device unlock), reusing the same envelope (header-as-AAD, downgrade
 * floor, GCM tamper detection). Import is a two-step prepare → confirm → apply
 * so the officer sees what they're about to restore before it replaces live data.
 */

import { createVault, openVault } from "@/crypto/envelope";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/passphrase";
import { importDb } from "./sqlite-blob";
import type { DbClient } from "./types";

export interface BackupInfo {
  schemaVersion: number | null;
  exportedAt: number | null;
  caseCount: number;
  /** Monotonic change counter at export time — for rollback detection on import. */
  seq: number;
}

/** Encrypt the current DB under a separate backup passphrase → portable bytes. */
export async function exportBackup(client: DbClient, backupPassphrase: string): Promise<Uint8Array> {
  // Defense-in-depth floor next to the crypto, so no caller (test/refactor) can
  // emit an off-device backup under a weak passphrase even if the UI gate is bypassed.
  if (backupPassphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Backup passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  await client.exec(
    "INSERT INTO meta(key, value) VALUES ('exported_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(Date.now())],
  );
  const dbBytes = await client.exportBytes();
  return createVault(backupPassphrase, dbBytes);
}

/** Decrypt + inspect a backup WITHOUT touching live data. Throws on wrong pass/tamper/downgrade. */
export async function prepareImport(
  file: Uint8Array,
  backupPassphrase: string,
): Promise<{ dbBytes: Uint8Array; info: BackupInfo }> {
  const { dbBytes } = await openVault(backupPassphrase, file);
  const tmp = await importDb(dbBytes);
  try {
    const meta = (key: string) =>
      (tmp.selectObjects("SELECT value FROM meta WHERE key=?", [key]) as { value: string }[])[0]?.value;
    const c = tmp.selectObjects("SELECT COUNT(*) AS n FROM cases") as { n: number }[];
    return {
      dbBytes,
      info: {
        schemaVersion: meta("schema_version") ? Number(meta("schema_version")) : null,
        exportedAt: meta("exported_at") ? Number(meta("exported_at")) : null,
        caseCount: c.length ? c[0].n : 0,
        seq: meta("last_modified_seq") ? Number(meta("last_modified_seq")) : 0,
      },
    };
  } finally {
    tmp.close();
  }
}

/** Replace live data with a prepared backup (after the user confirms). */
export async function applyImport(client: DbClient, dbBytes: Uint8Array): Promise<void> {
  await client.importBytes(dbBytes);
}
