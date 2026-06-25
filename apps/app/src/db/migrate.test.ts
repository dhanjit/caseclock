import { describe, it, expect } from "vitest";
import type { Database } from "@sqlite.org/sqlite-wasm";
import { createDb } from "./sqlite-blob";
import { applyMigrations, MIGRATIONS } from "./schema";

function io(db: Database) {
  return {
    exec: async (sql: string, bind: (string | number | null)[] = []) => {
      db.exec({ sql, bind });
    },
    query: async <T extends Record<string, unknown>>(sql: string, bind: (string | number | null)[] = []) =>
      db.selectObjects(sql, bind) as T[],
  };
}

function tableExists(db: Database, name: string): boolean {
  return (db.selectObjects("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]) as unknown[]).length > 0;
}

describe("schema migrations", () => {
  it("brings a fresh DB up to the current version with all tables", async () => {
    const db = await createDb();
    await applyMigrations(io(db));
    const v = await io(db).query<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'");
    expect(v[0].value).toBe(String(MIGRATIONS.length));
    expect(tableExists(db, "cases")).toBe(true);
    db.close();
  });

  it("upgrades an older (v1) vault on unlock — the cases table appears", async () => {
    const db = await createDb();
    // Simulate an old vault: only the v1 migration was ever run.
    for (const sql of MIGRATIONS[0]) db.exec(sql);
    db.exec("UPDATE meta SET value='1' WHERE key='schema_version'");
    expect(tableExists(db, "cases")).toBe(false);

    await applyMigrations(io(db)); // = what unlock() now does

    expect(tableExists(db, "cases")).toBe(true);
    const v = await io(db).query<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'");
    expect(v[0].value).toBe(String(MIGRATIONS.length));
    db.close();
  });

  it("is idempotent (re-running changes nothing)", async () => {
    const db = await createDb();
    await applyMigrations(io(db));
    await applyMigrations(io(db));
    const v = await io(db).query<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'");
    expect(v[0].value).toBe(String(MIGRATIONS.length));
    db.close();
  });
});
