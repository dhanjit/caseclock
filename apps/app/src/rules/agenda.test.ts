import { describe, it, expect } from "vitest";
import { buildAgenda, casesNeedingAttention, quickStats } from "./agenda";
import type { CaseAggregate } from "@/domain/repository";
import { DEFAULT_SETTINGS, type CaseRecord } from "@/domain/types";

function agg(over: Partial<CaseRecord>, extra: Partial<CaseAggregate> = {}): CaseAggregate {
  const c: CaseRecord = {
    id: over.id ?? "c",
    firNumber: over.firNumber ?? "1/2025",
    firDate: over.firDate ?? "2025-05-01",
    punishmentBand: "3to7",
    uapaFlag: false,
    sexualOffenceInScope: false,
    eFirFlag: false,
    custodyStatus: "not_arrested",
    status: "investigation",
    ...over,
  };
  return { case: c, persons: [], hearings: [], supervisionEntries: [], tasks: [], ...extra };
}

describe("agenda projection", () => {
  it("buckets an elapsed default-bail clock as overdue and a far hearing as upcoming", () => {
    const a = agg({ id: "A", firNumber: "11/2025", arrestDate: "2025-01-01", custodyStatus: "in_custody" });
    const b = agg({ id: "B", firNumber: "22/2025" }, {
      // 20 days out — beyond the new 15-day trial lead (§4.2), so it stays "upcoming"
      hearings: [{ id: "h1", caseId: "B", hearingDate: "2025-06-21", purpose: "trial" }],
    });

    const agenda = buildAgenda([a, b], DEFAULT_SETTINGS, "2025-06-01");

    expect(agenda.overdue.some((i) => i.caseId === "A" && i.deadline.ruleId === "fr1-chargesheet")).toBe(true);
    expect(agenda.upcoming.some((i) => i.caseId === "B" && i.deadline.ruleId === "court-hearing-prep")).toBe(true);
  });

  it("puts a lead-offset hit into Today", () => {
    // hearing exactly 7 days out → court-hearing-prep lead [15,10,7,3] hits today
    const b = agg({ id: "B" }, { hearings: [{ id: "h", caseId: "B", hearingDate: "2025-06-08", purpose: "trial" }] });
    const agenda = buildAgenda([b], DEFAULT_SETTINGS, "2025-06-01");
    expect(agenda.today.some((i) => i.deadline.ruleId === "court-hearing-prep")).toBe(true);
  });

  it("threads evidence + process-requests through to the agenda (§4.1 / §6)", () => {
    const a = agg({ id: "X", firNumber: "9/2026" }, {
      evidence: [
        { id: "ev", caseId: "X", description: "Passports", reportToObtain: "Forgery report", status: "pending", reportKind: "expert", forwardedDate: "2026-06-10" },
      ],
      processRequests: [
        { id: "rq", caseId: "X", type: "custom", customLabel: "FRRO / MEA", accusedIds: [], status: "pending", expectedResponseDate: "2026-06-20" },
      ],
    });
    const agenda = buildAgenda([a], DEFAULT_SETTINGS, "2026-06-27");
    expect(agenda.overdue.some((i) => i.deadline.ruleId === "expert-report-pending")).toBe(true);
    expect(agenda.overdue.some((i) => i.deadline.ruleId === "process-request-overdue")).toBe(true);
  });

  it("priority cases alert loudly; non-priority overdue items are flagged silent (§1)", () => {
    const overdueClock = { arrestDate: "2025-01-01", custodyStatus: "in_custody" as const };
    const loud = agg({ id: "P", priority: true, ...overdueClock });
    const quiet = agg({ id: "Q", ...overdueClock });
    const agenda = buildAgenda([loud, quiet], DEFAULT_SETTINGS, "2025-06-01");
    const p = agenda.overdue.find((i) => i.caseId === "P")!;
    const q = agenda.overdue.find((i) => i.caseId === "Q")!;
    expect(p.priority).toBe(true);
    expect(p.silent).toBe(false);
    expect(q.priority).toBe(false);
    expect(q.silent).toBe(true);
  });

  it("flags stale + heavy-clock cases as needing attention", () => {
    const stale = agg({ id: "S", lastTouchedAt: "2025-05-01" }); // 31 days idle (>14)
    const heavy = agg({ id: "H", arrestDate: "2025-04-20", custodyStatus: "in_custody" }); // fr1 (45d buffer) ~2025-06-04, within 7d of 2025-06-01
    const flags = casesNeedingAttention([stale, heavy], DEFAULT_SETTINGS, "2025-06-01");
    expect(flags.find((f) => f.caseId === "S")!.reasons).toContain("untouched");
    expect(flags.find((f) => f.caseId === "H")!.reasons).toContain("heavy clock <7d");
  });

  it("computes quick stats incl. long-pending buckets", () => {
    const s = quickStats(
      [
        agg({ id: "1", uapaFlag: true, custodyStatus: "in_custody", firDate: "2025-05-01" }),
        agg({ id: "2", firDate: "2024-01-01" }), // >1yr old
        agg({ id: "3", firDate: "2025-02-01", status: "closed" }), // ~4mo old, closed
      ],
      "2025-06-01",
    );
    expect(s.uapa).toBe(1);
    expect(s.inCustody).toBe(1);
    expect(s.m12).toBe(1);
    expect(s.m3).toBe(0); // case 3 is ~4 months old but CLOSED → excluded from live load
    expect(s.live).toBe(2); // case 3 is closed
  });
});
