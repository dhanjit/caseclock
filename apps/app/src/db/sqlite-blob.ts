/**
 * In-memory SQLite (official @sqlite.org/sqlite-wasm) with byte export/import,
 * plus OPFS persistence of the *encrypted* vault blob (web).
 *
 * The DB lives in memory while unlocked; we serialize it to bytes, encrypt the
 * whole blob (crypto/envelope.ts), and write the ciphertext to OPFS. Nothing
 * plaintext (not even the SQLite header) ever touches disk. See envelope.ts for
 * the rationale behind this over a custom encrypted-Wasm build.
 */

import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";

let sqlitePromise: Promise<Sqlite3Static> | null = null;

/** Idempotently initialize the SQLite wasm module. */
export function initSqlite(): Promise<Sqlite3Static> {
  if (!sqlitePromise) sqlitePromise = sqlite3InitModule();
  return sqlitePromise;
}

/** Open a fresh in-memory database. */
export async function createDb(): Promise<Database> {
  const sqlite3 = await initSqlite();
  return new sqlite3.oo1.DB(":memory:", "c");
}

/** Serialize the whole DB to bytes (for encryption + persistence). */
export async function exportDb(db: Database): Promise<Uint8Array> {
  const sqlite3 = await initSqlite();
  return sqlite3.capi.sqlite3_js_db_export(db);
}

/** Load DB bytes (from a decrypted vault) into a fresh in-memory database. */
export async function importDb(bytes: Uint8Array): Promise<Database> {
  const sqlite3 = await initSqlite();
  const db = new sqlite3.oo1.DB(":memory:", "c");
  const p = sqlite3.wasm.allocFromTypedArray(bytes);
  const rc = sqlite3.capi.sqlite3_deserialize(
    db,
    "main",
    p,
    bytes.length,
    bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  if (rc !== 0) {
    db.close();
    throw new Error(`sqlite3_deserialize failed with code ${rc}`);
  }
  return db;
}

/** Reject a restored/imported DB that isn't a CaseClock vault (shape check post-decrypt). */
export function validateRestoredDb(db: Database): void {
  const tables = db.selectObjects("SELECT name FROM sqlite_master WHERE type='table'") as { name: string }[];
  const names = new Set(tables.map((t) => t.name));
  if (!names.has("meta") || !names.has("cases")) {
    throw new Error("Backup is missing expected tables — not a CaseClock vault.");
  }
  const rows = db.selectObjects("SELECT data FROM cases") as { data: string }[];
  for (const r of rows) {
    let obj: unknown;
    try {
      obj = JSON.parse(r.data);
    } catch {
      throw new Error("Backup contains a malformed case record.");
    }
    const agg = obj as { case?: { id?: unknown; firNumber?: unknown } };
    if (!agg.case || typeof agg.case.id !== "string" || typeof agg.case.firNumber !== "string") {
      throw new Error("Backup contains an invalid case record.");
    }
  }
}

// ---------------------------------------------------------------------------
// OPFS persistence of the encrypted vault blob (web only).
// We use the async OPFS API (getFileHandle + createWritable), which works on the
// main thread and needs NO COOP/COEP — we are NOT using a SQLite OPFS VFS here,
// only writing one opaque ciphertext file.
// ---------------------------------------------------------------------------

export function opfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === "function"
  );
}

async function readEntry(name: string): Promise<Uint8Array | null> {
  const root = await navigator.storage.getDirectory();
  try {
    const fh = await root.getFileHandle(name, { create: false });
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Write a file in OPFS, robustly across browsers. Prefers createWritable()
 * (Chrome, Safari 18+); falls back to a sync access handle (Chrome main thread).
 * Throws a clear, user-facing error if neither is available (e.g. old iOS Safari
 * where OPFS writes require a Worker).
 */
async function writeOpfsFile(
  root: FileSystemDirectoryHandle,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  const fh = await root.getFileHandle(name, { create: true });
  const anyFh = fh as FileSystemFileHandle & {
    createSyncAccessHandle?: () => Promise<{
      truncate: (n: number) => void;
      write: (b: Uint8Array, o?: { at: number }) => number;
      flush: () => void;
      close: () => void;
    }>;
  };
  if (typeof fh.createWritable === "function") {
    const w = await fh.createWritable();
    await w.write(bytes);
    await w.close();
    return;
  }
  if (typeof anyFh.createSyncAccessHandle === "function") {
    const h = await anyFh.createSyncAccessHandle();
    try {
      h.truncate(0);
      h.write(bytes, { at: 0 });
      h.flush();
    } finally {
      h.close();
    }
    return;
  }
  throw new Error(
    "This browser can't save to on-device storage. Use Chrome or Edge, or update to a newer Safari (iOS 18+).",
  );
}

/**
 * Crash-safe vault write. New content is fully written to a `.tmp` first, then
 * promoted to the primary name (so the primary is never torn), and the previous
 * generation is kept as `.bak` for recovery. The atomic move() is best-effort —
 * if it's unsupported or fails, we fall back to a direct write. Callers MUST
 * serialize calls (LocalDbClient's mutex).
 */
export async function saveVaultToOpfs(name: string, ciphertext: Uint8Array): Promise<void> {
  if (!opfsAvailable()) throw new Error("OPFS unavailable in this browser/mode");
  const root = await navigator.storage.getDirectory();

  // Keep the last good generation as .bak before we touch the primary.
  const current = await readEntry(name);
  if (current) await writeOpfsFile(root, `${name}.bak`, current);

  // Stage the new content in a temp file (the only file that can tear).
  const tmpName = `${name}.tmp`;
  await writeOpfsFile(root, tmpName, ciphertext);

  // Promote tmp → primary. Try atomic move(); fall back to a direct write.
  const tmpHandle = (await root.getFileHandle(tmpName)) as FileSystemFileHandle & {
    move?: (name: string) => Promise<void>;
  };
  let promoted = false;
  if (typeof tmpHandle.move === "function") {
    try {
      await root.removeEntry(name).catch(() => {});
      await tmpHandle.move(name);
      promoted = true;
    } catch {
      promoted = false;
    }
  }
  if (!promoted) {
    await writeOpfsFile(root, name, ciphertext);
    await root.removeEntry(tmpName).catch(() => {});
  }

  // Primary is now good. Drop the previous generation so "deleted"/restored-over
  // case data doesn't linger on-device between writes (it's recreated from the
  // live primary at the top of the next write, preserving within-write recovery).
  await root.removeEntry(`${name}.bak`).catch(() => {});
}

export async function loadVaultFromOpfs(name: string): Promise<Uint8Array | null> {
  if (!opfsAvailable()) throw new Error("OPFS unavailable in this browser/mode");
  // Primary, then the .bak generation (recovers from a crash between writes).
  return (await readEntry(name)) ?? (await readEntry(`${name}.bak`));
}

/** ONLY the .bak generation — unlock's corrupt-primary recovery path. */
export async function loadVaultBackupFromOpfs(name: string): Promise<Uint8Array | null> {
  if (!opfsAvailable()) throw new Error("OPFS unavailable in this browser/mode");
  return readEntry(`${name}.bak`);
}

// ---------------------------------------------------------------------------
// Sidecar blob storage (§10/§7). Big binaries (encrypted image/document
// originals) live in an OPFS `blobs/` subdir, content-addressed by name, OUTSIDE
// the SQLite vault — so the per-write whole-vault reseal never scales with image
// bytes. Each blob is already AES-256-GCM ciphertext (BlobStore encrypts with the
// vault DEK); these helpers only move opaque bytes.
// ---------------------------------------------------------------------------

const BLOB_DIR = "blobs";

async function blobDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsAvailable()) return null;
  const root = await navigator.storage.getDirectory();
  try {
    return await root.getDirectoryHandle(BLOB_DIR, { create });
  } catch {
    return null;
  }
}

export async function writeOpfsBlob(name: string, bytes: Uint8Array): Promise<void> {
  const dir = await blobDir(true);
  if (!dir) throw new Error("On-device blob storage (OPFS) is unavailable in this browser/mode.");
  await writeOpfsFile(dir, name, bytes);
}

export async function readOpfsBlob(name: string): Promise<Uint8Array | null> {
  const dir = await blobDir(false);
  if (!dir) return null;
  try {
    const fh = await dir.getFileHandle(name, { create: false });
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

export async function deleteOpfsBlob(name: string): Promise<void> {
  const dir = await blobDir(false);
  if (!dir) return;
  await dir.removeEntry(name).catch(() => {});
}
