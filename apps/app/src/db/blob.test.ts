/**
 * Tier-3 seam verification (REQUIREMENTS §10/§7). Confirms the premise the gallery
 * and document modules build on: the sqlite-wasm engine ALREADY round-trips binary
 * through a BLOB column — only the TS `Bind` type gated it — and that the new
 * execMany() batches a multi-row import into ONE transaction, atomically.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryDbClient } from "./memory-client";

describe("DbClient — BLOB binding + execMany (Tier-3 seam)", () => {
  let db: MemoryDbClient;

  beforeEach(async () => {
    db = new MemoryDbClient();
    await db.createVault("x");
    await db.exec("CREATE TABLE blobs (id TEXT PRIMARY KEY, bytes BLOB)");
  });

  it("round-trips a Uint8Array through a BLOB column byte-for-byte", async () => {
    // Includes 0x00, high bytes, and CR/LF — anything that would break a text path.
    const data = new Uint8Array([0, 1, 2, 253, 254, 255, 10, 13, 0, 42]);
    await db.exec("INSERT INTO blobs (id, bytes) VALUES (?, ?)", ["a", data]);

    const rows = await db.query<{ bytes: Uint8Array }>("SELECT bytes FROM blobs WHERE id = ?", ["a"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(rows[0].bytes)).toEqual(Array.from(data));
  });

  it("execMany inserts many BLOB rows in one batch", async () => {
    const statements = Array.from({ length: 5 }, (_, i) => ({
      sql: "INSERT INTO blobs (id, bytes) VALUES (?, ?)",
      bind: [`k${i}`, new Uint8Array([i, i + 1, i + 2])],
    }));
    await db.execMany(statements);

    const count = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM blobs");
    expect(count[0].n).toBe(5);
    const r2 = await db.query<{ bytes: Uint8Array }>("SELECT bytes FROM blobs WHERE id = ?", ["k2"]);
    expect(Array.from(r2[0].bytes)).toEqual([2, 3, 4]);
  });

  it("execMany is atomic — a failing statement rolls the whole batch back", async () => {
    await db.exec("INSERT INTO blobs (id, bytes) VALUES (?, ?)", ["pre", new Uint8Array([9])]);

    await expect(
      db.execMany([
        { sql: "INSERT INTO blobs (id, bytes) VALUES (?, ?)", bind: ["ok", new Uint8Array([1])] },
        { sql: "INSERT INTO blobs (id, bytes) VALUES (?, ?)", bind: ["pre", new Uint8Array([2])] }, // dup PK → throws
      ]),
    ).rejects.toThrow();

    // The 'ok' row from the same batch must NOT survive; the pre-existing row stays.
    const rows = await db.query<{ id: string }>("SELECT id FROM blobs ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual(["pre"]);
  });

  it("execMany([]) is a no-op", async () => {
    await db.execMany([]);
    const count = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM blobs");
    expect(count[0].n).toBe(0);
  });
});
