import { describe, it, expect } from "vitest";
import { MemoryDbClient } from "./memory-client";
import { SCHEMA_VERSION } from "./schema";

describe("DbClient contract (MemoryDbClient)", () => {
  it("createVault bootstraps the schema to the current version", async () => {
    const db = new MemoryDbClient();
    expect(db.isUnlocked()).toBe(false);
    await db.createVault("x");
    expect(db.isUnlocked()).toBe(true);

    const rows = await db.query<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    expect(rows[0].value).toBe(String(SCHEMA_VERSION));
  });

  it("exec persists rows that query can read back, with bind params", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    await db.exec("INSERT INTO meta(key, value) VALUES (?, ?)", ["district", "Civil Lines"]);
    const rows = await db.query<{ value: string }>("SELECT value FROM meta WHERE key = ?", ["district"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("Civil Lines");
  });

  it("query throws when locked", async () => {
    const db = new MemoryDbClient();
    await expect(db.query("SELECT 1")).rejects.toThrow();
  });
});
