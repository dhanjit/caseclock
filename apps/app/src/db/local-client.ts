/**
 * LocalDbClient — the real storage client (PLAN §6.1).
 *
 * In-memory SQLite + whole-DB AES-256-GCM vault, persisted to OPFS. Holds the
 * DEK (via VaultSession) in memory only while unlocked; drops it on lock.
 *
 * Durability (review fixes):
 *  - All mutating ops are SERIALIZED through a tail-promise mutex, so two saves
 *    can never interleave their OPFS writes.
 *  - The OPFS write itself is crash-safe (.tmp → promote + .bak; see sqlite-blob).
 *  - importBytes validates the replacement in a TEMP db and only swaps on
 *    success — a corrupt/hostile backup can never wedge the live session.
 *  - A monotonic `last_modified_seq` is bumped on every persist for backup
 *    rollback detection.
 *
 * NOTE (M10): crypto + DB run on the main thread; the async DbClient seam makes
 * moving them into a Web Worker a transparent swap. Until then Argon2id on
 * unlock/create briefly blocks the UI.
 */

import type { Database } from "@sqlite.org/sqlite-wasm";
import {
  createDb,
  importDb,
  exportDb,
  saveVaultToOpfs,
  loadVaultFromOpfs,
  opfsAvailable,
  validateRestoredDb,
} from "./sqlite-blob";
import {
  initVault,
  openVault,
  resealVault,
  KDF_DEFAULT,
  type VaultSession,
  type KdfParams,
} from "@/crypto/envelope";
import { applyMigrations } from "./schema";
import type { Bind, DbClient, DbRow } from "./types";

const VAULT_FILE = "caseclock.vault";

/** A MigrationIO bound to a specific Database (runs migrations without touching the live persist path). */
function dbIO(db: Database) {
  return {
    exec: async (sql: string, bind: (string | number | null)[] = []) => {
      db.exec({ sql, bind });
    },
    query: async <T extends Record<string, unknown>>(sql: string, bind: (string | number | null)[] = []) =>
      db.selectObjects(sql, bind) as T[],
  };
}

export class LocalDbClient implements DbClient {
  private db: Database | null = null;
  private session: VaultSession | null = null;
  private readonly kdf: KdfParams;
  /** Serializes all mutating ops so OPFS writes never overlap. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(kdf: KdfParams = KDF_DEFAULT) {
    this.kdf = kdf;
  }

  private serialize<T>(op: () => Promise<T>): Promise<T> {
    const run = this.tail.then(op, op);
    this.tail = run.catch(() => {}); // keep the chain alive after an error
    return run;
  }

  isUnlocked(): boolean {
    return this.db !== null && this.session !== null;
  }

  async vaultExists(): Promise<boolean> {
    if (!opfsAvailable()) {
      throw new Error("Persistent storage (OPFS) is unavailable in this browser or private window.");
    }
    return (await loadVaultFromOpfs(VAULT_FILE)) !== null;
  }

  async createVault(passphrase: string): Promise<void> {
    if (await this.vaultExists()) throw new Error("A vault already exists on this device.");
    const db = await createDb();
    await applyMigrations(dbIO(db));
    const bytes = await exportDb(db);
    const { vault, session } = await initVault(passphrase, bytes, this.kdf);
    await saveVaultToOpfs(VAULT_FILE, vault);
    this.db = db;
    this.session = session;
  }

  async unlock(passphrase: string): Promise<void> {
    const vault = await loadVaultFromOpfs(VAULT_FILE);
    if (!vault) throw new Error("No vault on this device — create one first.");
    const { session, dbBytes } = await openVault(passphrase, vault);
    const db = await importDb(dbBytes);
    await applyMigrations(dbIO(db)); // upgrade older-schema vaults
    this.db = db;
    this.session = session;
    await this.serialize(() => this.persist()); // persist any migration upgrade
  }

  async lock(): Promise<void> {
    await this.serialize(async () => {
      if (this.db && this.session) {
        await this.persist();
        this.db.close();
      }
      this.db = null;
      this.session = null; // drop the DEK reference
    });
  }

  async exec(sql: string, bind: Bind = []): Promise<void> {
    await this.serialize(async () => {
      const db = this.requireDb();
      db.exec({ sql, bind });
      await this.persist();
    });
  }

  async query<T extends DbRow = DbRow>(sql: string, bind: Bind = []): Promise<T[]> {
    // Reads are synchronous within one event-loop tick — no serialization needed.
    return this.requireDb().selectObjects(sql, bind) as T[];
  }

  async exportBytes(): Promise<Uint8Array> {
    return exportDb(this.requireDb());
  }

  async importBytes(bytes: Uint8Array): Promise<void> {
    if (!this.session) throw new Error("Vault is locked.");
    await this.serialize(async () => {
      // Build + validate the replacement in a temp DB; only swap if it's clean.
      const temp = await importDb(bytes);
      try {
        await applyMigrations(dbIO(temp));
        validateRestoredDb(temp);
      } catch (e) {
        temp.close();
        throw e; // live DB untouched
      }
      const old = this.db;
      this.db = temp;
      old?.close();
      await this.persist();
    });
  }

  private requireDb(): Database {
    if (!this.db) throw new Error("Vault is locked.");
    return this.db;
  }

  private async persist(): Promise<void> {
    if (!this.db || !this.session) return;
    // Monotonic change counter for backup rollback detection.
    this.db.exec(
      "INSERT INTO meta(key, value) VALUES ('last_modified_seq', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)",
    );
    const bytes = await exportDb(this.db);
    const vault = await resealVault(this.session, bytes);
    await saveVaultToOpfs(VAULT_FILE, vault);
  }
}
