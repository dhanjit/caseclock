import { describe, it, expect } from "vitest";
import { searchCases } from "./search";
import { sampleAggregates, SAMPLE_WATCHLIST } from "./seed";
import type { CaseAggregate } from "@/domain/repository";

const cases = sampleAggregates();
const c1 = cases[0]; // NIA 04/2024 — the proscribed-outfit (ULFA-I) case

describe("searchCases — field coverage (§9 structured fields)", () => {
  it("matches the case / FIR number", () => {
    const hits = searchCases(cases, "112/2024");
    expect(hits.some((h) => h.field === "firNumber" && h.caseId === c1.case.id)).toBe(true);
  });

  it("matches the case identity", () => {
    const hits = searchCases(cases, "Fancy Bazar");
    expect(hits.some((h) => h.field === "identity")).toBe(true);
  });

  it("matches a section of law", () => {
    const hits = searchCases(cases, "Explosive Substances");
    expect(hits.some((h) => h.field === "section" && h.caseId === c1.case.id)).toBe(true);
  });

  it("matches an accused name", () => {
    const hits = searchCases(cases, "Jahnabi Boro");
    expect(hits.some((h) => h.field === "accused" && h.caseId === c1.case.id)).toBe(true);
  });

  it("matches a date in raw ISO form", () => {
    const hits = searchCases(cases, "2024-03-09");
    expect(hits.some((h) => h.field === "date" && h.caseId === c1.case.id)).toBe(true);
  });

  it("matches a date in display form", () => {
    const hits = searchCases(cases, "9 Mar 2024");
    expect(hits.some((h) => h.field === "date" && h.caseId === c1.case.id)).toBe(true);
  });

  it("matches a court matter (court name + purpose)", () => {
    expect(searchCases(cases, "NIA Special Court").some((h) => h.field === "court")).toBe(true);
    expect(searchCases(cases, "Supreme Court").some((h) => h.field === "court")).toBe(true);
  });

  it("matches a §6 process-request reference number", () => {
    const hits = searchCases(cases, "LOC-2210/24");
    expect(hits.some((h) => h.field === "request" && h.caseId === c1.case.id)).toBe(true);
  });
});

describe("searchCases — banned-org / watchlist (§9 banned-org field)", () => {
  it("finds ULFA-I via the watchlist even though it only appears in the brief", () => {
    const hits = searchCases(cases, "ULFA-I", SAMPLE_WATCHLIST);
    const wl = hits.find((h) => h.field === "watchlist");
    expect(wl).toBeDefined();
    expect(wl?.caseId).toBe(c1.case.id);
    expect(wl?.snippet).toBe("ULFA-I");
  });

  it("does NOT produce a watchlist hit when no watchlist names are supplied", () => {
    const hits = searchCases(cases, "ULFA-I"); // no watchlist arg
    expect(hits.some((h) => h.field === "watchlist")).toBe(false);
  });

  it("ranks the banned-org hit first when present", () => {
    const hits = searchCases(cases, "ULFA-I", SAMPLE_WATCHLIST);
    expect(hits[0].field).toBe("watchlist");
  });
});

describe("searchCases — the no-document-content guarantee", () => {
  it("never returns a hit for arbitrary free text in the brief / progress / plan", () => {
    const SENT = "ZZSENTINEL_UNIQUE_TOKEN";
    const tampered: CaseAggregate[] = cases.map((a, i) =>
      i === 0
        ? {
            ...a,
            case: {
              ...a.case,
              brief: `${a.case.brief ?? ""} ${SENT}`,
              investigationProgress: `${a.case.investigationProgress ?? ""} ${SENT}`,
              planOfAction: `${a.case.planOfAction ?? ""} ${SENT}`,
              trialStatus: `${a.case.trialStatus ?? ""} ${SENT}`,
            },
          }
        : a,
    );
    // Even with the sentinel injected into every free-text heading, and even with a
    // watchlist supplied (the sentinel is not a banned-org name), there are zero hits.
    expect(searchCases(tampered, SENT)).toHaveLength(0);
    expect(searchCases(tampered, SENT, SAMPLE_WATCHLIST)).toHaveLength(0);
  });
});

describe("searchCases — normalization + ranking", () => {
  it("is case-insensitive", () => {
    const lower = searchCases(cases, "jahnabi boro");
    const upper = searchCases(cases, "JAHNABI BORO");
    expect(lower.some((h) => h.field === "accused")).toBe(true);
    expect(upper.some((h) => h.field === "accused")).toBe(true);
  });

  it("returns [] for empty / whitespace-only queries", () => {
    expect(searchCases(cases, "")).toEqual([]);
    expect(searchCases(cases, "    ")).toEqual([]);
    expect(searchCases(cases, "\t\n")).toEqual([]);
  });

  it("returns results sorted by descending score", () => {
    const hits = searchCases(cases, "court", SAMPLE_WATCHLIST);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it("scores an exact full-value match above a mere prefix match (same field)", () => {
    const exact = searchCases(cases, c1.case.firNumber).find((h) => h.field === "firNumber" && h.caseId === c1.case.id);
    const prefix = searchCases(cases, c1.case.firNumber.slice(0, 6)).find((h) => h.field === "firNumber" && h.caseId === c1.case.id);
    expect(exact).toBeDefined();
    expect(prefix).toBeDefined();
    expect(exact!.score).toBeGreaterThan(prefix!.score);
  });

  it("is a pure function — identical input yields identical output", () => {
    const a = searchCases(cases, "court", SAMPLE_WATCHLIST);
    const b = searchCases(cases, "court", SAMPLE_WATCHLIST);
    expect(a).toEqual(b);
  });

  it("does not mutate the input aggregates", () => {
    const frozen = sampleAggregates().map((a) => Object.freeze(a));
    expect(() => searchCases(frozen as CaseAggregate[], "ULFA-I", SAMPLE_WATCHLIST)).not.toThrow();
  });
});
