/**
 * MemoryDbClient — non-persistent, unencrypted DbClient for tests and early dev.
 * Same SQLite engine, no vault/crypto/OPFS. Lets the rules engine (M3) and UI be
 * exercised without the encryption lifecycle.
 */

import type { Database } from "@sqlite.org/sqlite-wasm";
import { createDb, exportDb, importDb } from "./sqlite-blob";
import { applyMigrations } from "./schema";
import type { Bind, DbClient, DbRow, SqlStatement } from "./types";

export class MemoryDbClient implements DbClient {
  private db: Database | null = null;

  isUnlocked(): boolean {
    return this.db !== null;
  }

  async vaultExists(): Promise<boolean> {
    return this.db !== null;
  }

  async createVault(_passphrase: string): Promise<void> {
    this.db = await createDb();
    await applyMigrations(this);
  }

  async unlock(_passphrase: string): Promise<void> {
    if (!this.db) await this.createVault(_passphrase);
  }

  async lock(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  async exec(sql: string, bind: Bind = []): Promise<void> {
    this.requireDb().exec({ sql, bind });
  }

  async execMany(statements: SqlStatement[]): Promise<void> {
    const db = this.requireDb();
    db.exec({ sql: "SAVEPOINT execmany" });
    try {
      for (const s of statements) db.exec({ sql: s.sql, bind: s.bind ?? [] });
      db.exec({ sql: "RELEASE execmany" });
    } catch (e) {
      db.exec({ sql: "ROLLBACK TO execmany" });
      db.exec({ sql: "RELEASE execmany" });
      throw e;
    }
  }

  async query<T extends DbRow = DbRow>(sql: string, bind: Bind = []): Promise<T[]> {
    return this.requireDb().selectObjects(sql, bind) as T[];
  }

  async exportBytes(): Promise<Uint8Array> {
    return exportDb(this.requireDb());
  }

  async importBytes(bytes: Uint8Array): Promise<void> {
    this.db?.close();
    this.db = await importDb(bytes);
    await applyMigrations(this);
  }

  private requireDb(): Database {
    if (!this.db) throw new Error("MemoryDbClient not initialized");
    return this.db;
  }
}
