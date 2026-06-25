import { describe, it, expect } from "vitest";
import { MemoryDbClient } from "./memory-client";
import { createDb, validateRestoredDb } from "./sqlite-blob";
import { exportBackup, prepareImport, applyImport } from "./backup";
import { CaseRepository, type CaseAggregate } from "@/domain/repository";
import type { CaseRecord } from "@/domain/types";

const BACKUP_PASS = "backup-phrase-take-it-to-the-new-phone-7781";

function sample(id: string): CaseAggregate {
  const c: CaseRecord = {
    id,
    firNumber: "112/2025",
    firDate: "2025-04-20",
    punishmentBand: "10plus",
    uapaFlag: true,
    sexualOffenceInScope: false,
    eFirFlag: false,
    custodyStatus: "in_custody",
    firstRemandDate: "2025-05-01",
    status: "custody",
  };
  return { case: c, persons: [], hearings: [], supervisionEntries: [], tasks: [] };
}

describe("encrypted backup (M9)", () => {
  it("round-trips: export from one device, import into another", async () => {
    const a = new MemoryDbClient();
    await a.createVault("device-A");
    await new CaseRepository(a).save(sample("case-47"));

    const file = await exportBackup(a, BACKUP_PASS);

    const { dbBytes, info } = await prepareImport(file, BACKUP_PASS);
    expect(info.caseCount).toBe(1);
    expect(info.exportedAt).toBeGreaterThan(0);

    const b = new MemoryDbClient();
    await b.createVault("device-B");
    expect(await new CaseRepository(b).count()).toBe(0);

    await applyImport(b, dbBytes);
    expect(await new CaseRepository(b).count()).toBe(1);
    expect((await new CaseRepository(b).get("case-47"))!.case.firNumber).toBe("112/2025");
  });

  it("rejects the wrong backup passphrase", async () => {
    const a = new MemoryDbClient();
    await a.createVault("device-A");
    const file = await exportBackup(a, BACKUP_PASS);
    await expect(prepareImport(file, "wrong-backup-passphrase")).rejects.toThrow(/passphrase|tamper|corrupt/i);
  });

  it("rejects a tampered backup file", async () => {
    const a = new MemoryDbClient();
    await a.createVault("device-A");
    const file = await exportBackup(a, BACKUP_PASS);
    const obj = JSON.parse(new TextDecoder().decode(file));
    obj.payload = obj.payload.slice(0, 12) + (obj.payload[12] === "A" ? "B" : "A") + obj.payload.slice(13);
    const tampered = new TextEncoder().encode(JSON.stringify(obj));
    await expect(prepareImport(tampered, BACKUP_PASS)).rejects.toThrow();
  });
});

describe("restore validation (validateRestoredDb)", () => {
  it("rejects a DB missing the expected tables", async () => {
    const empty = await createDb();
    expect(() => validateRestoredDb(empty)).toThrow(/missing expected tables/i);
    empty.close();
  });

  it("rejects a DB whose case record is malformed", async () => {
    const db = await createDb();
    db.exec("CREATE TABLE meta(key TEXT, value TEXT)");
    db.exec("CREATE TABLE cases(id TEXT, data TEXT)");
    db.exec("INSERT INTO cases(id, data) VALUES('x', 'not-json')");
    expect(() => validateRestoredDb(db)).toThrow(/malformed|invalid/i);
    db.close();
  });

  it("accepts a well-formed CaseClock DB", async () => {
    const db = await createDb();
    db.exec("CREATE TABLE meta(key TEXT, value TEXT)");
    db.exec("CREATE TABLE cases(id TEXT, data TEXT)");
    db.exec(`INSERT INTO cases(id, data) VALUES('x', '{"case":{"id":"x","firNumber":"1/2025"}}')`);
    expect(() => validateRestoredDb(db)).not.toThrow();
    db.close();
  });
});
