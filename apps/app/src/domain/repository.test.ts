import { describe, it, expect } from "vitest";
import { MemoryDbClient } from "@/db/memory-client";
import { CaseRepository, chargesheetFiled, hydrateAggregate, type CaseAggregate } from "./repository";
import { computeDeadlines } from "@/rules/engine";
import { addDays } from "@/rules/dates";
import { DEFAULT_SETTINGS, type CaseRecord, type PersonRecord } from "./types";

function uapaCase(): CaseAggregate {
  const c: CaseRecord = {
    id: "case-47",
    firNumber: "112/2025",
    firDate: "2025-04-20",
    punishmentBand: "10plus",
    uapaFlag: true,
    sexualOffenceInScope: false,
    eFirFlag: false,
    custodyStatus: "in_custody",
    arrestDate: "2025-05-01",
    uapaExtensionGranted: true,
    status: "custody",
  };
  return { case: c, persons: [], hearings: [], supervisionEntries: [], tasks: [] };
}

describe("CaseRepository (M2) ⇄ rules engine (M3)", () => {
  it("saves, lists, and round-trips an aggregate, then recomputes its deadlines", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    const repo = new CaseRepository(db);

    await repo.save(uapaCase(), 1000);
    expect(await repo.count()).toBe(1);

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].case.firNumber).toBe("112/2025");

    const got = await repo.get("case-47");
    expect(got).not.toBeNull();

    // M2 → M3: the retrieved UAPA case computes its arrest-anchored FR/chargesheet clock.
    const deadlines = computeDeadlines(got!.case, got!.persons, got!.hearings, DEFAULT_SETTINGS, "2025-06-01");
    const fr1 = deadlines.find((d) => d.ruleId === "fr1-chargesheet");
    expect(fr1).toBeDefined();
    expect(fr1!.dueAt).toBe(addDays("2025-05-01", 150)); // UAPA target from arrest
    expect(fr1!.track).toBe("investigation");
  });

  it("upsert updates an existing case in place", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    const repo = new CaseRepository(db);
    const agg = uapaCase();

    await repo.save(agg, 1000);
    agg.case.status = "chargesheet";
    await repo.save(agg, 2000);

    expect(await repo.count()).toBe(1);
    expect((await repo.get("case-47"))!.case.status).toBe("chargesheet");
  });

  it("remove deletes the case", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    const repo = new CaseRepository(db);
    await repo.save(uapaCase(), 1000);
    await repo.remove("case-47");
    expect(await repo.count()).toBe(0);
  });
});

describe("hydrateAggregate (V4-DELTA §6 JSON-level migrations)", () => {
  it("derives chargesheetFiledDate from the earliest register row", () => {
    const agg = uapaCase();
    agg.chargesheets = [
      { id: "cs2", caseId: "case-47", kind: "supplementary", date: "2025-11-20", accusedIds: [] },
      { id: "cs1", caseId: "case-47", kind: "main", date: "2025-09-04", accusedIds: [] },
    ];
    const h = hydrateAggregate(agg);
    expect(h.case.chargesheetFiledDate).toBe("2025-09-04");
    expect(chargesheetFiled(h)).toBe(true);
    expect(chargesheetFiled(uapaCase())).toBe(false);
  });

  it("maps legacy dgOrderDate → dgApprovedDate and legacy sanction fields → sanctions[]", () => {
    const agg = uapaCase();
    agg.case.dgOrderDate = "2025-06-10";
    agg.case.sanctionStatutory = "pending";
    agg.case.sanctionDg = "obtained";
    const h = hydrateAggregate(agg);
    expect(h.case.dgApprovedDate).toBe("2025-06-10");
    expect(h.case.sanctions).toHaveLength(2);
    expect(h.case.sanctions![0]).toMatchObject({ kind: "Statutory (UAPA s.45)", state: "pending" });
    expect(h.case.sanctions![1]).toMatchObject({ kind: "DG sanction", state: "obtained" });
    // idempotent: re-hydrating doesn't duplicate
    expect(hydrateAggregate(h).case.sanctions).toHaveLength(2);
  });

  it("copies the case arrestDate to in-custody accused missing their own — and only those", () => {
    const agg = uapaCase();
    const p = (id: string, status: PersonRecord["accusedStatus"], arrestDate?: string): PersonRecord => ({
      id, caseId: "case-47", role: "accused", name: id, accusedStatus: status, arrestDate: arrestDate ?? null,
    });
    agg.persons = [
      p("a1", "judicial_custody"), // gets the copy
      p("a2", "absconding"), // never arrested — untouched
      p("a3", "police_custody", "2025-05-03"), // has own date — untouched
    ];
    const h = hydrateAggregate(agg);
    expect(h.persons.find((x) => x.id === "a1")!.arrestDate).toBe("2025-05-01");
    expect(h.persons.find((x) => x.id === "a2")!.arrestDate).toBeNull();
    expect(h.persons.find((x) => x.id === "a3")!.arrestDate).toBe("2025-05-03");
  });

  it("legacy migrations run ONCE: a cleared DG date stays cleared after save (review fix)", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    const repo = new CaseRepository(db);
    const agg = uapaCase();
    agg.case.dgOrderDate = "2025-06-10";
    await repo.save(agg, 1000); // save persists hydrated → dgApproved copied, legacyMigrated stamped
    let got = (await repo.get("case-47"))!;
    expect(got.case.dgApprovedDate).toBe("2025-06-10");
    expect(got.case.legacyMigrated).toBe(true);
    // Officer deliberately clears the DG approval…
    got = { ...got, case: { ...got.case, dgApprovedDate: null } };
    await repo.save(got, 2000);
    // …and it must NOT be resurrected from the legacy dgOrderDate.
    expect((await repo.get("case-47"))!.case.dgApprovedDate).toBeNull();
  });

  it("cleared per-accused arrest dates stay cleared after the one-time copy-down", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    const repo = new CaseRepository(db);
    const agg = uapaCase();
    agg.persons = [{ id: "a1", caseId: "case-47", role: "accused", name: "A-1", accusedStatus: "judicial_custody", arrestDate: null }];
    await repo.save(agg, 1000); // copy-down runs once (case arrest 2025-05-01)
    let got = (await repo.get("case-47"))!;
    expect(got.persons[0].arrestDate).toBe("2025-05-01");
    got = { ...got, persons: [{ ...got.persons[0], arrestDate: null }] };
    await repo.save(got, 2000);
    expect((await repo.get("case-47"))!.persons[0].arrestDate).toBeNull();
  });

  it("a legacy case-level chargesheet date becomes register row #1 (case-wide) — V4-DELTA §6", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    const repo = new CaseRepository(db);
    const agg = uapaCase();
    agg.case.chargesheetFiledDate = "2025-09-04";
    await repo.save(agg, 1000);
    const got = (await repo.get("case-47"))!;
    expect(got.chargesheets).toHaveLength(1);
    expect(got.chargesheets![0]).toMatchObject({ kind: "main", date: "2025-09-04", accusedIds: [] });
    expect(got.case.chargesheetFiledDate).toBe("2025-09-04");
  });

  it("repository round-trips hydrated: register drives the stored derived date", async () => {
    const db = new MemoryDbClient();
    await db.createVault("x");
    const repo = new CaseRepository(db);
    const agg = uapaCase();
    agg.chargesheets = [{ id: "cs1", caseId: "case-47", kind: "main", date: "2025-09-04", accusedIds: [] }];
    await repo.save(agg, 1000);
    const got = await repo.get("case-47");
    expect(got!.case.chargesheetFiledDate).toBe("2025-09-04");
    expect(got!.chargesheets).toHaveLength(1);
  });
});
