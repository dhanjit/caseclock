/**
 * The storage seam. Everything above the DB talks to this async interface, so
 * the implementation can move from the main thread into a Web Worker (PLAN §6,
 * M10) with zero changes to callers. Two implementations:
 *   - LocalDbClient   — encrypted, OPFS-persisted (the real app)
 *   - MemoryDbClient  — in-memory, unencrypted (tests + early dev)
 */

// Uint8Array is included so BLOB columns (image thumbnails, attachment bytes —
// §10/§7) can be bound directly. The sqlite-wasm `oo1` engine already accepts a
// Uint8Array bind and returns one for BLOB reads at runtime; this type is the
// only thing that gated it.
export type Bind = (string | number | null | Uint8Array)[];
export type DbRow = Record<string, unknown>;

/** One statement in an execMany batch. */
export interface SqlStatement {
  sql: string;
  bind?: Bind;
}

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
  /**
   * Run many mutating statements in ONE transaction, persisting a SINGLE
   * encrypted snapshot afterwards. Use for batch imports (a gallery of images, a
   * folder of documents) so N rows cost one whole-vault reseal, not N. Atomic:
   * any failure rolls the whole batch back.
   */
  execMany(statements: SqlStatement[]): Promise<void>;
  /** Read query. */
  query<T extends DbRow = DbRow>(sql: string, bind?: Bind): Promise<T[]>;
  /** Raw serialized DB bytes (for encrypted backup export). */
  exportBytes(): Promise<Uint8Array>;
  /** Replace the live DB with imported bytes, migrate, and persist (restore). */
  importBytes(bytes: Uint8Array): Promise<void>;
}
