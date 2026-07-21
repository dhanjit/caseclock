import { describe, it, expect } from "vitest";
import { anchorGaps, integrityGaps, lapsedHearings } from "./integrity";
import type { CaseAggregate } from "./repository";
import type { CaseRecord, HearingRecord, PersonRecord } from "./types";

const TODAY = "2026-07-01";

function agg(over: Partial<CaseRecord> = {}, persons: PersonRecord[] = [], hearings: HearingRecord[] = []): CaseAggregate {
  const c: CaseRecord = {
    id: "c1",
    firNumber: "1/2026",
    firDate: "2026-01-01",
    punishmentBand: "10plus",
    uapaFlag: false,
    sexualOffenceInScope: false,
    eFirFlag: false,
    custodyStatus: "not_arrested",
    status: "investigation",
    ...over,
  };
  return { case: c, persons, hearings, supervisionEntries: [], tasks: [] };
}

describe("integrity checks — silence is not safety (V4-DELTA §2)", () => {
  it("a past undisposed hearing raises NEXT DATE?; disposed or future ones don't", () => {
    const hearings: HearingRecord[] = [
      { id: "h1", caseId: "c1", hearingDate: "2026-06-20", purpose: "trial", court: "Sessions" },
      { id: "h2", caseId: "c1", hearingDate: "2026-06-20", purpose: "trial", disposed: true },
      { id: "h3", caseId: "c1", hearingDate: "2026-07-10", purpose: "trial" },
    ];
    expect(lapsedHearings(hearings, TODAY).map((h) => h.id)).toEqual(["h1"]);
    const rows = integrityGaps(agg({}, [], hearings), TODAY);
    expect(rows.filter((g) => g.kind === "next-date")).toHaveLength(1);
    expect(rows[0].hearingId).toBe("h1");
    expect(rows[0].text).toMatch(/next date/i);
  });

  it("in-custody accused without arrest date → CLOCK NOT RUNNING; dated/absconding accused don't", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-1", accusedStatus: "judicial_custody" },
      { id: "a2", caseId: "c1", role: "accused", name: "A-2", accusedStatus: "judicial_custody", arrestDate: "2026-06-04" },
      { id: "a3", caseId: "c1", role: "accused", name: "A-3", accusedStatus: "absconding" },
    ];
    const gaps = anchorGaps(agg({}, persons), TODAY);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].text).toMatch(/A-1.*no arrest date/);
  });

  it("trial-stage case with no future hearing flags; a future hearing clears it", () => {
    const trial = agg({ status: "trial" });
    expect(anchorGaps(trial, TODAY).some((g) => g.text.match(/no future hearing/))).toBe(true);
    const withHearing = agg({ status: "trial" }, [], [{ id: "h", caseId: "c1", hearingDate: "2026-07-15", purpose: "trial" }]);
    expect(anchorGaps(withHearing, TODAY).some((g) => g.text.match(/no future hearing/))).toBe(false);
  });

  it("convicted accused without sentence date flags (appeal window uncomputable)", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-1", accusedStatus: "convicted" },
    ];
    expect(anchorGaps(agg({}, persons), TODAY).some((g) => g.text.match(/appeal window/))).toBe(true);
  });

  it("UAPA sections without the flag + unsanctioned UAPA chargesheet both flag", () => {
    const a1 = agg({ sectionsOfLaw: "UA(P)A ss.16,18" });
    expect(anchorGaps(a1, TODAY).some((g) => g.text.match(/UAPA flag is off/))).toBe(true);
    const a2 = agg({ uapaFlag: true, chargesheetFiledDate: "2026-05-01" });
    expect(anchorGaps(a2, TODAY).some((g) => g.text.match(/s\.45/))).toBe(true);
    const a3 = agg({ uapaFlag: true, chargesheetFiledDate: "2026-05-01", mhaSanctionDate: "2026-04-20" });
    expect(anchorGaps(a3, TODAY).some((g) => g.text.match(/s\.45/))).toBe(false);
  });

  it("a clean case yields no gaps", () => {
    expect(integrityGaps(agg(), TODAY)).toEqual([]);
  });
});
