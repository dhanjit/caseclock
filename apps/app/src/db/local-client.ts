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
  validateRestoredDb,
} from "./sqlite-blob";
import { vaultSink } from "./sink";
import {
  initVault,
  openVault,
  resealVault,
  KDF_DEFAULT,
  type VaultSession,
  type KdfParams,
} from "@/crypto/envelope";
import { applyMigrations } from "./schema";
import type { Bind, DbClient, DbRow, SqlStatement } from "./types";

const VAULT_FILE = "caseclock.vault";

/** A MigrationIO bound to a specific Database (runs migrations without touching the live persist path). */
function dbIO(db: Database) {
  return {
    exec: async (sql: string, bind: Bind = []) => {
      db.exec({ sql, bind });
    },
    query: async <T extends Record<string, unknown>>(sql: string, bind: Bind = []) =>
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
    if (!vaultSink().available()) {
      throw new Error("Persistent storage is unavailable in this browser or private window.");
    }
    return (await vaultSink().loadVault(VAULT_FILE)) !== null;
  }

  async createVault(passphrase: string): Promise<void> {
    if (await this.vaultExists()) throw new Error("A vault already exists on this device.");
    const db = await createDb();
    await applyMigrations(dbIO(db));
    const bytes = await exportDb(db);
    const { vault, session } = await initVault(passphrase, bytes, this.kdf);
    await vaultSink().saveVault(VAULT_FILE, vault);
    this.db = db;
    this.session = session;
  }

  async unlock(passphrase: string): Promise<void> {
    const vault = await vaultSink().loadVault(VAULT_FILE);
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

  async execMany(statements: SqlStatement[]): Promise<void> {
    if (statements.length === 0) return;
    await this.serialize(async () => {
      const db = this.requireDb();
      // One transaction → one whole-vault reseal for the whole batch (avoids the
      // O(N · dbSize) cost of N separate exec()s on a large encrypted vault).
      db.exec({ sql: "SAVEPOINT execmany" });
      try {
        for (const s of statements) db.exec({ sql: s.sql, bind: s.bind ?? [] });
        db.exec({ sql: "RELEASE execmany" });
      } catch (e) {
        db.exec({ sql: "ROLLBACK TO execmany" });
        db.exec({ sql: "RELEASE execmany" });
        throw e; // batch is atomic — nothing persisted on failure
      }
      await this.persist();
    });
  }

  async query<T extends DbRow = DbRow>(sql: string, bind: Bind = []): Promise<T[]> {
    // Reads are synchronous within one event-loop tick — no serialization needed.
    return this.requireDb().selectObjects(sql, bind) as T[];
  }

  async encryptBlob(bytes: Uint8Array): Promise<Uint8Array> {
    if (!this.session) throw new Error("Vault is locked.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.session.dekKey, bytes),
    );
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return out;
  }

  async decryptBlob(blob: Uint8Array): Promise<Uint8Array> {
    if (!this.session) throw new Error("Vault is locked.");
    const iv = blob.subarray(0, 12);
    const ct = blob.subarray(12);
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.session.dekKey, ct),
    );
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
    await vaultSink().saveVault(VAULT_FILE, vault);
  }
}
