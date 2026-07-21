import { describe, it, expect } from "vitest";
import { allIdentifierLinks, crossCaseLinks } from "./links";
import type { CaseAggregate } from "./repository";
import type { CaseRecord, CommsRequestRecord } from "./types";

function agg(id: string, fir: string, comms: Omit<CommsRequestRecord, "caseId">[]): CaseAggregate {
  const c: CaseRecord = {
    id, firNumber: fir, firDate: "2026-01-01", punishmentBand: "10plus", uapaFlag: false,
    sexualOffenceInScope: false, eFirFlag: false, custodyStatus: "not_arrested", status: "investigation",
  };
  return {
    case: c, persons: [], hearings: [], supervisionEntries: [], tasks: [],
    commsRequests: comms.map((r) => ({ ...r, caseId: id })),
  };
}

describe("cross-case interconnectivity (V4-DELTA N4)", () => {
  const c1 = agg("c1", "NIA 04/2024", [
    { id: "r1", kind: "cdr", ref: "L-4412/24 · 12 Mar 2024", numbers: ["98640-11235", "70029-44810"], receivedCount: 2 },
    { id: "r2", kind: "imei", ref: "L-4420/24", numbers: ["356938035643809"], receivedCount: 1 },
  ]);
  const c2 = agg("c2", "Case 21/2026", [
    { id: "r3", kind: "cdr", ref: "L-0771/26 · 06 Jun 2026", numbers: ["70029-44810", "90850-33127"], receivedCount: 1 },
    { id: "r4", kind: "imei", ref: "L-0775/26", numbers: ["3569 3803 5643 809", "867530045128834"], receivedCount: 1 },
  ]);

  it("links identifiers appearing in 2+ cases; punctuation-tolerant on IMEIs", () => {
    const links = crossCaseLinks([c1, c2]);
    expect(links).toHaveLength(2);
    const phone = links.find((l) => l.kind === "phone")!;
    expect(phone.value).toBe("70029-44810");
    expect(phone.cases.map((c) => c.caseId).sort()).toEqual(["c1", "c2"]);
    // "356938035643809" vs "3569 3803 5643 809" — same handset through normNum
    const imei = links.find((l) => l.kind === "imei")!;
    expect(imei.cases).toHaveLength(2);
  });

  it("single-case identifiers stay out of the cross-case list but show in the full list", () => {
    const links = crossCaseLinks([c1, c2]);
    expect(links.some((l) => l.value.includes("98640"))).toBe(false);
    const all = allIdentifierLinks([c1, c2]);
    expect(all.some((l) => l.value.includes("98640"))).toBe(true);
    // most-connected sorted first
    expect(all[0].cases.length).toBeGreaterThanOrEqual(all[all.length - 1].cases.length);
  });

  it("same identifier twice in ONE case is one node with one case ref", () => {
    const dup = agg("c3", "CR 1/2026", [
      { id: "a", kind: "cdr", ref: "L-1", numbers: ["77380-99012"], receivedCount: 0 },
      { id: "b", kind: "ipdr", ref: "L-2", numbers: ["77380-99012"], receivedCount: 0 },
    ]);
    const all = allIdentifierLinks([dup]);
    expect(all).toHaveLength(1);
    expect(all[0].cases).toHaveLength(1);
    expect(crossCaseLinks([dup])).toHaveLength(0);
  });

  it("cases without comms registers contribute nothing", () => {
    expect(allIdentifierLinks([agg("c9", "X", [])])).toEqual([]);
  });
});
