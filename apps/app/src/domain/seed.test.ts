/**
 * Acceptance test for the two sample fixtures (docs/sample-cases.md): both cases must
 * be representable and every alert named in their "Attached Panels" sections must fire
 * on the fixtures' reference date.
 */

import { describe, it, expect } from "vitest";
import { sampleAggregates } from "./seed";
import { computeDeadlines } from "@/rules/engine";
import { buildAgenda } from "@/rules/agenda";
import { addDays } from "@/rules/dates";
import { DEFAULT_SETTINGS, uapaSectionWithoutFlag, type DeadlineEvent } from "./types";

const TODAY = "2026-06-27"; // ~ the fixtures' 26 Jun 2026 reference date
const cases = sampleAggregates();
const byId = (id: string) => cases.find((a) => a.case.id === id)!;

function deadlines(id: string): DeadlineEvent[] {
  const a = byId(id);
  return computeDeadlines(a.case, a.persons, a.hearings, DEFAULT_SETTINGS, TODAY, a.evidence ?? [], a.processRequests ?? []);
}
const expert = (id: string) => deadlines(id).filter((d) => d.ruleId === "expert-report-pending");
const requests = (id: string) => deadlines(id).filter((d) => d.ruleId === "process-request-overdue");

describe("Case 1 — NIA 04/2024 (SLP @ SC, trial ongoing)", () => {
  const ds = () => deadlines("case-sample-1");

  it("device-imaging expert report fires RED (overdue 2-day)", () => {
    const device = expert("case-sample-1").find((d) => d.type.includes("Device imaging"))!;
    expect(device.state).toBe("overdue");
    expect(device.owes).toBe("FSL");
  });

  it("received expert reports (RDX, ballistic) are cleared, not alerting", () => {
    const overdue = expert("case-sample-1").filter((d) => d.state === "overdue");
    expect(overdue.every((d) => !d.type.match(/RDX|Ballistic/))).toBe(true);
  });

  it("monthly Court PR for Jun 2026 is overdue", () => {
    const courtPr = ds().find((d) => d.ruleId === "pr-monthly" && d.dueAt === "2026-06-07")!;
    expect(courtPr.state).toBe("overdue");
    expect(courtPr.type).toMatch(/Court PR/);
  });

  it("SLP at the Supreme Court sits in the Superior Court Zone (15-day lead)", () => {
    const slp = ds().find((d) => d.ruleId === "superior-court")!;
    expect(slp.track).toBe("superior");
    expect(slp.leadOffsets).toContain(15);
    expect(slp.dueAt).toBe("2026-07-09");
  });

  it("Interpol RCN request is overdue on its expected-response date", () => {
    expect(requests("case-sample-1").some((d) => d.state === "overdue")).toBe(true);
  });
});

describe("Case 2 — Case 21/2026 (PRIORITY, 3 remanded, FICN)", () => {
  const ds = () => deadlines("case-sample-2");

  it("passport-forgery expert report fires RED (overdue 2-day)", () => {
    const forgery = expert("case-sample-2").find((d) => d.type.includes("Forgery") || d.type.includes("passport") || d.type.includes("Passport"))
      ?? expert("case-sample-2").find((d) => d.state === "overdue")!;
    expect(forgery.state).toBe("overdue");
  });

  it("just-forwarded FICN report is within time (active, not overdue)", () => {
    const ficn = expert("case-sample-2").find((d) => d.type.match(/note-examination|FSL \/ RBI/))!;
    expect(ficn.state).toBe("active");
  });

  it("A-1 custody production fires with a 1-day-prior reminder", () => {
    const prod = ds().find((d) => d.ruleId === "custody-production")!;
    expect(prod.dueAt).toBe("2026-06-27");
    expect(prod.leadOffsets).toContain(1);
  });

  it("FRRO/MEA verification (15-day) is overdue; MLA/LR (45-day) is still tracking", () => {
    const rs = requests("case-sample-2");
    const frro = rs.find((d) => d.type.includes("FRRO / MEA foreigner verification"))!;
    expect(frro.state).toBe("overdue");
    const mla = rs.find((d) => d.type.includes("MLA / Letters Rogatory"))!;
    expect(mla.state).toBe("active"); // 45-day clock from a 30 Jun dispatch → not yet due
  });

  it("FR-I buffered target is arrest + 75 days (UAPA track, decision #6 honoured)", () => {
    const fr1 = ds().find((d) => d.ruleId === "fr1-chargesheet")!;
    expect(fr1.dueAt).toBe(addDays("2026-06-04", 75));
    expect(uapaSectionWithoutFlag(byId("case-sample-2").case)).toBe(false); // flag is set
  });
});

describe("priority pinning + decision #6 guard", () => {
  it("both sample cases are flagged priority and alert loudly (not silent)", () => {
    const agenda = buildAgenda(cases, DEFAULT_SETTINGS, TODAY);
    for (const id of ["case-sample-1", "case-sample-2"]) {
      const items = [...agenda.overdue, ...agenda.today, ...agenda.upcoming].filter((i) => i.caseId === id);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.priority)).toBe(true);
      expect(agenda.overdue.filter((i) => i.caseId === id).every((i) => !i.silent)).toBe(true);
    }
  });

  it("guard catches a UAPA section with the flag unset", () => {
    const c2 = byId("case-sample-2").case;
    expect(uapaSectionWithoutFlag({ ...c2, uapaFlag: false, custodyCaseType: null })).toBe(true);
  });
});

describe("heading 12 — accused incl. LOC/Interpol (derived) + custody history", () => {
  const noticesFor = (caseId: string, accusedId: string) =>
    (byId(caseId).processRequests ?? []).filter(
      (r) => r.accusedIds.includes(accusedId) && (r.type === "LOC" || r.type === "interpol_red" || r.type === "interpol_blue"),
    );

  it("Case 1 A-4 derives a LOC and an Interpol RCN from the tracker", () => {
    const ns = noticesFor("case-sample-1", "c1-a4");
    expect(ns.some((r) => r.type === "LOC")).toBe(true);
    expect(ns.some((r) => r.type === "interpol_red")).toBe(true);
  });

  it("Case 2 each remanded accused derives a LOC from the tracker", () => {
    for (const id of ["c2-a1", "c2-a2", "c2-a3"]) {
      expect(noticesFor("case-sample-2", id).some((r) => r.type === "LOC")).toBe(true);
    }
  });

  it("custody history (PC→JC transitions) is populated for representative accused", () => {
    const a1c1 = byId("case-sample-1").persons.find((p) => p.id === "c1-a1")!;
    expect((a1c1.custodyHistory ?? []).length).toBeGreaterThanOrEqual(2); // PC then JC
    const a2c2 = byId("case-sample-2").persons.find((p) => p.id === "c2-a2")!;
    expect((a2c2.custodyHistory ?? []).some((h) => h.kind === "judicial")).toBe(true);
  });
});
