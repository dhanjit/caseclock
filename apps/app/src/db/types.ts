/**
 * The storage seam. Everything above the DB talks to this async interface, so
 * the implementation can move from the main thread into a Web Worker (PLAN §6,
 * M10) with zero changes to callers. Two implementations:
 *   - LocalDbClient   — encrypted, OPFS-persisted (the real app)
 *   - MemoryDbClient  — in-memory, unencrypted (tests + early dev)
 */

export type Bind = (string | number | null)[];
export type DbRow = Record<string, unknown>;

export interface DbClient {
  /** Has a vault been created on this device yet? */
  vaultExists(): Promise<boolean>;
  /** First run: set the passphrase, create the schema, persist the first snapshot. */
  createVault(passphrase: string): Promise<void>;
  /** Decrypt + load the DB into memory. Throws on wrong passphrase. */
  unlock(passphrase: string): Promise<void>;
  /** Snapshot, then drop the DB + key material from memory. */
  lock(): Promise<void>;
  isUnlocked(): boolean;
  /** Mutating statement; persists an encrypted snapshot afterwards. */
  exec(sql: string, bind?: Bind): Promise<void>;
  /** Read query. */
  query<T extends DbRow = DbRow>(sql: string, bind?: Bind): Promise<T[]>;
  /** Raw serialized DB bytes (for encrypted backup export). */
  exportBytes(): Promise<Uint8Array>;
  /** Replace the live DB with imported bytes, migrate, and persist (restore). */
  importBytes(bytes: Uint8Array): Promise<void>;
}
