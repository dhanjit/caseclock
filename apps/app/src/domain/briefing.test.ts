/**
 * Briefing-note generator (REQUIREMENTS §8). Pure tests over both sample fixtures
 * (docs/sample-cases.md via sampleAggregates) plus a minimal-aggregate edge case.
 * Mirrors seed.test.ts: same TODAY reference date as the fixtures' ~26 Jun 2026.
 */

import { describe, it, expect } from "vitest";
import { buildBriefing, type BriefingNote } from "./briefing";
import { sampleAggregates } from "./seed";
import type { CaseAggregate } from "./repository";
import type { CaseRecord } from "./types";

const TODAY = "2026-06-27"; // ~ the fixtures' 26 Jun 2026 reference date
const cases = sampleAggregates();
const byId = (id: string) => cases.find((a) => a.case.id === id)!;

/** The 13 fixed headings + V7 docket sub-headings in CaseFile.tsx order. */
const EXPECTED_TITLES: [number | string, string][] = [
  [1, "Case number"],
  ["1.1", "Original FIR"],
  [2, "Identity of the case"],
  [3, "Sections of law"],
  [4, "Date of occurrence"],
  [5, "Date of registration"],
  ["5.1", "Name of CIO"],
  ["5.2", "Name & address of complainant"],
  ["5.3", "Name of the trial court"],
  [6, "Brief of the case"],
  [7, "Number of accused"],
  [8, "Progress of investigation"],
  [9, "Evidences collected"],
  [10, "Status of trial"],
  [11, "Court matters"],
  [12, "List of accused with status (incl. LOC / Interpol + custody history)"],
  [13, "Plan of action"],
];

const headingByNo = (b: BriefingNote, n: number | string) => b.headings.find((h) => h.n === n)!;

describe("buildBriefing — heading order + titles (13 + V7 sub-headings + registers)", () => {
  for (const id of ["case-sample-1", "case-sample-2"]) {
    it(`${id}: the 17 numbered headings lead, in order with exact titles`, () => {
      const b = buildBriefing(byId(id), TODAY);
      expect(b.headings.slice(0, EXPECTED_TITLES.length).map((h) => [h.n, h.title])).toEqual(EXPECTED_TITLES);
      // Appended registers: both samples carry comms data; case 1 also chargesheets.
      expect(b.headings.some((h) => h.n === "CD")).toBe(true);
    });
  }
});

describe("Case 1 — NIA 04/2024 rollups", () => {
  const b = () => buildBriefing(byId("case-sample-1"), TODAY);

  it("#7 status-count table: total 5 with the V6 breakdown", () => {
    const lines = headingByNo(b(), 7).lines;
    expect(lines[0]).toBe("Total: 5");
    expect(lines).toContain("Absconder: 1");
    expect(lines).toContain("Under investigation: 1");
  });

  it("chargesheet register + High observation reach the note", () => {
    const cs = headingByNo(b(), "CS").lines;
    expect(cs).toHaveLength(2);
    expect(cs[0]).toMatch(/Main \(CS-1\).*Jahnabi Boro/);
    expect(headingByNo(b(), 9).lines.some((l) => l.startsWith("★ M-1"))).toBe(true);
    expect(headingByNo(b(), 9).lines.some((l) => l.includes("OUT (M-3)"))).toBe(true);
  });

  it("#9 evidence summary counts items/received/witnesses and the 1 overdue expert report", () => {
    const lines = headingByNo(b(), 9).lines;
    // 5 evidence items, 4 received (only the device-imaging report pending),
    // witnesses 2+2+1+1+4 = 10, device-imaging expert report overdue.
    expect(lines[0]).toBe("5 item(s) · 4 received · 10 witness(es) · 1 expert report(s) overdue");
    expect(lines.some((l) => l.includes("Device imaging") && l.includes("REPORT OVERDUE"))).toBe(true);
  });

  it("#11 court matters lists every hearing", () => {
    const lines = headingByNo(b(), 11).lines;
    expect(lines).toHaveLength(byId("case-sample-1").hearings.length);
    expect(lines.some((l) => l.includes("Supreme Court of India"))).toBe(true);
  });

  it("#12 accused carries status, custody history and LOC/Interpol from the tracker", () => {
    const lines = headingByNo(b(), 12).lines;
    expect(lines).toHaveLength(5);
    const a1 = lines.find((l) => l.startsWith("Jahnabi Boro"))!;
    expect(a1).toContain("Judicial custody");
    expect(a1).toContain("Custody:");
    expect(a1).toContain("PC");
    expect(a1).toContain("JC");
    const a4 = lines.find((l) => l.startsWith("Sanjib"))!;
    expect(a4).toContain("LOC / Interpol:");
    expect(a4).toContain("LOC-2210/24");
    expect(a4).toContain("NCB-Req/77");
  });
});

describe("Case 2 — Case 21/2026 rollups", () => {
  const b = () => buildBriefing(byId("case-sample-2"), TODAY);

  it("#7 status-count table: total 3, all arrested", () => {
    const lines = headingByNo(b(), 7).lines;
    expect(lines[0]).toBe("Total: 3");
    expect(lines).toContain("Arrested (PC + JC): 3");
  });

  it("comms register lines carry received counts; the seal-broken leg flags in #9", () => {
    const cd = headingByNo(b(), "CD").lines;
    expect(cd.some((l) => l.match(/CDR .*recd 1\/3/))).toBe(true);
    expect(cd.some((l) => l.startsWith("Tower "))).toBe(true);
    expect(headingByNo(b(), 9).lines.some((l) => l.includes("SEAL BROKEN on E-2"))).toBe(true);
  });

  it("#9 flags the overdue passport-forgery expert report (but not the just-forwarded FICN one)", () => {
    const lines = headingByNo(b(), 9).lines;
    // ev2 forwarded 10 Jun (overdue), ev4 forwarded 18 Jun (overdue) → 2 overdue;
    // ev1/ev3 forwarded 26 Jun → within 2-day window, not overdue.
    expect(lines[0]).toContain("2 expert report(s) overdue");
    const passports = lines.find((l) => l.includes("foreign passports"))!;
    expect(passports).toContain("REPORT OVERDUE");
    const ficn = lines.find((l) => l.includes("FICN notes"))!;
    expect(ficn).not.toContain("REPORT OVERDUE");
  });

  it("#12 each remanded accused derives a LOC from the tracker", () => {
    const lines = headingByNo(b(), 12).lines;
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.includes("LOC-0613/26"))).toBe(true);
  });
});

describe("header block", () => {
  it("Case 2 header: caseLabel, FIR no, identity, registration date, UAPA flag", () => {
    const h = buildBriefing(byId("case-sample-2"), TODAY).header;
    expect(h.firNumber).toBe("Case 21/2026 · FIR 058/2026");
    expect(h.identity).toContain("fake Indian currency");
    expect(h.firDate).toBe("2 Jun 2026");
    expect(h.uapa).toBe(true);
    expect(h.caseLabel).toContain("FIR Case 21/2026");
  });

  it("default-bail line is UAPA-track buffered + statutory from arrest (Case 2, no chargesheet yet)", () => {
    const h = buildBriefing(byId("case-sample-2"), TODAY).header;
    // UAPA, no extension → buffered 75 from arrest 04 Jun, statutory 90 from first remand 04 Jun.
    expect(h.defaultBailLine).toContain("Default bail:");
    expect(h.defaultBailLine).toContain("75d from arrest");
    expect(h.defaultBailLine).toContain("90d from");
    expect(h.defaultBailLine).toContain("UAPA");
  });

  it("default-bail line reports a filed chargesheet (Case 1)", () => {
    const h = buildBriefing(byId("case-sample-1"), TODAY).header;
    expect(h.defaultBailLine).toContain("Chargesheet / FR filed");
  });
});

describe("determinism + non-mutation", () => {
  it("is deterministic for the same inputs", () => {
    const a = buildBriefing(byId("case-sample-1"), TODAY);
    const b = buildBriefing(byId("case-sample-1"), TODAY);
    expect(a).toEqual(b);
  });

  it("does not mutate a deeply-frozen aggregate", () => {
    const deepFreeze = <T>(o: T): T => {
      if (o && typeof o === "object") {
        Object.values(o).forEach(deepFreeze);
        Object.freeze(o);
      }
      return o;
    };
    const agg = deepFreeze(structuredClone(byId("case-sample-2")));
    expect(() => buildBriefing(agg, TODAY)).not.toThrow();
  });
});

describe("minimal-aggregate edge", () => {
  it("yields 13 headings with em-dashes and never throws on undefined optional arrays", () => {
    const minimalCase: CaseRecord = {
      id: "min",
      firNumber: "1/2026",
      firDate: "2026-01-01",
      punishmentBand: "lt3",
      uapaFlag: false,
      sexualOffenceInScope: false,
      eFirFlag: false,
      custodyStatus: "not_arrested",
      status: "registered",
    };
    const agg: CaseAggregate = {
      case: minimalCase,
      persons: [],
      hearings: [],
      supervisionEntries: [],
      tasks: [],
      // evidence + processRequests intentionally undefined
    };
    const b = buildBriefing(agg, TODAY);
    expect(b.headings).toHaveLength(EXPECTED_TITLES.length); // no registers on a bare case
    expect(b.headings.map((h) => [h.n, h.title])).toEqual(EXPECTED_TITLES);
    // Derived rollups fall back to em-dash.
    expect(headingByNo(b, 9).lines).toEqual(["—"]);
    expect(headingByNo(b, "5.1").lines).toEqual(["—"]);
    expect(headingByNo(b, 11).lines).toEqual(["—"]);
    expect(headingByNo(b, 12).lines).toEqual(["—"]);
    expect(headingByNo(b, 7).lines).toEqual(["Total: 0"]);
    // Free-text headings fall back to em-dash too.
    expect(headingByNo(b, 6).lines).toEqual(["—"]);
    expect(b.header.identity).toBe("—");
  });
});
