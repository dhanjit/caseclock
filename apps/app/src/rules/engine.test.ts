import { describe, it, expect } from "vitest";
import { computeDeadlines, RULE_REGISTRY } from "./engine";
import { addDays } from "./dates";
import {
  DEFAULT_SETTINGS,
  type CaseRecord,
  type DeadlineEvent,
  type EvidenceRecord,
  type HearingRecord,
  type PersonRecord,
  type ProcessRequestRecord,
} from "@/domain/types";

const base: CaseRecord = {
  id: "c1",
  firNumber: "1/2025",
  firDate: "2025-01-01",
  punishmentBand: "3to7",
  uapaFlag: false,
  sexualOffenceInScope: false,
  eFirFlag: false,
  custodyStatus: "not_arrested",
  status: "investigation",
};

function mk(over: Partial<CaseRecord>): CaseRecord {
  return { ...base, ...over };
}
function run(
  c: CaseRecord,
  today: string,
  persons: PersonRecord[] = [],
  hearings: HearingRecord[] = [],
  evidence: EvidenceRecord[] = [],
  processRequests: ProcessRequestRecord[] = [],
): DeadlineEvent[] {
  return computeDeadlines(c, persons, hearings, DEFAULT_SETTINGS, today, evidence, processRequests);
}
function find(evts: DeadlineEvent[], ruleId: string): DeadlineEvent | undefined {
  return evts.find((e) => e.ruleId === ruleId);
}

describe("officer investigation engine (§4.1) — arrest-anchored custody/FR", () => {
  it("UAPA WITHOUT extension: default 90/75 (NOT 180) — un-extended default bail accrues at 90", () => {
    const c = mk({ uapaFlag: true, arrestDate: "2025-05-01", custodyStatus: "in_custody" });
    const e = find(run(c, "2025-05-10"), "fr1-chargesheet")!;
    expect(e.dueAt).toBe(addDays("2025-05-01", 75));
    expect(e.note).toMatch(/90/);
    expect(e.note).toMatch(/extension/i);
  });

  it("UAPA WITH extension granted: buffered 150-day target, statutory 180 in the note", () => {
    const c = mk({ uapaFlag: true, uapaExtensionGranted: true, arrestDate: "2025-05-01", custodyStatus: "in_custody" });
    const e = find(run(c, "2025-05-10"), "fr1-chargesheet")!;
    expect(e.dueAt).toBe(addDays("2025-05-01", 150));
    expect(e.track).toBe("investigation");
    expect(e.note).toMatch(/180/);
  });

  it("Scheduled higher (10yr+ band, non-UAPA): arrest + 75 buffer, statutory 90", () => {
    const c = mk({ punishmentBand: "10plus", arrestDate: "2025-05-01", custodyStatus: "in_custody" });
    const e = find(run(c, "2025-05-10"), "fr1-chargesheet")!;
    expect(e.dueAt).toBe(addDays("2025-05-01", 75));
    expect(e.note).toMatch(/90/);
  });

  it("7-to-10 band is a 60-day case (BNSS 187(3)), NOT 90 — arrest + 45 buffer", () => {
    const c = mk({ punishmentBand: "7to10", arrestDate: "2025-05-01", custodyStatus: "in_custody" });
    const e = find(run(c, "2025-05-10"), "fr1-chargesheet")!;
    expect(e.dueAt).toBe(addDays("2025-05-01", 45));
    expect(e.note).toMatch(/60/);
  });

  it("Scheduled lower (sub-7yr band): arrest + 45 buffer, statutory 60", () => {
    const c = mk({ punishmentBand: "3to7", arrestDate: "2025-05-01", custodyStatus: "in_custody" });
    expect(find(run(c, "2025-05-10"), "fr1-chargesheet")!.dueAt).toBe(addDays("2025-05-01", 45));
  });

  it("statutory date legally anchors on first remand (not arrest) when remand is known", () => {
    const c = mk({ punishmentBand: "10plus", arrestDate: "2025-05-01", firstRemandDate: "2025-05-03", custodyStatus: "in_custody" });
    const e = find(run(c, "2025-05-10"), "fr1-chargesheet")!;
    expect(e.dueAt).toBe(addDays("2025-05-01", 75)); // buffered target still from arrest (§4.1)
    expect(e.note).toContain(addDays("2025-05-03", 90)); // statutory from first remand
    expect(e.note).toMatch(/first remand/);
  });

  it("configurable UAPA target overrides the default 150 (extension path)", () => {
    const c = mk({ uapaFlag: true, uapaExtensionGranted: true, arrestDate: "2025-05-01", uapaCustodyDays: 120, custodyStatus: "in_custody" });
    expect(find(run(c, "2025-05-10"), "fr1-chargesheet")!.dueAt).toBe(addDays("2025-05-01", 120));
  });

  it("filing the chargesheet / FR resolves the clock", () => {
    const c = mk({ arrestDate: "2025-05-01", chargesheetFiledDate: "2025-06-01", custodyStatus: "in_custody" });
    expect(find(run(c, "2025-06-10"), "fr1-chargesheet")!.state).toBe("done");
  });

  it("FR→MHA pipeline (V4-DELTA Q2): DG ≤7d of FR-I, IR-to-MHA ≤7d of DG, MHA nudge ≤7d of IR", () => {
    const c = mk({ arrestDate: "2025-05-01", frISubmittedDate: "2025-08-01", dgApprovedDate: "2025-08-05", irForMhaDate: "2025-08-10" });
    const e = run(c, "2025-08-12");
    const dg = find(e, "fr-dg-order")!;
    expect(dg.dueAt).toBe(addDays("2025-08-01", 7)); // anchored on FR-I submission
    expect(dg.state).toBe("done"); // DG approval recorded
    expect(dg.severity).toBe("statutory-critical");
    const ir = find(e, "fr-ir-mha")!;
    expect(ir.dueAt).toBe(addDays("2025-08-05", 7));
    expect(ir.state).toBe("done");
    const mha = find(e, "mha-sanction-pending")!;
    expect(mha.dueAt).toBe(addDays("2025-08-10", 7));
    expect(mha.state).toBe("active");
    expect(mha.note).toMatch(/blocked|only after MHA/i);
  });

  it("legacy dgOrderDate still satisfies the DG step and anchors IR-to-MHA", () => {
    const c = mk({ frISubmittedDate: "2025-08-01", dgOrderDate: "2025-08-04" });
    const e = run(c, "2025-08-06");
    expect(find(e, "fr-dg-order")!.state).toBe("done");
    expect(find(e, "fr-ir-mha")!.dueAt).toBe(addDays("2025-08-04", 7));
  });

  it("SP remarks is UAPA-only, riding the 150-day line from the earliest arrest", () => {
    const uapa = mk({ uapaFlag: true, uapaExtensionGranted: true, arrestDate: "2025-05-01", frISubmittedDate: "2025-08-01" });
    const sp = find(run(uapa, "2025-08-08"), "fr-sp-remarks")!;
    expect(sp.dueAt).toBe(addDays("2025-05-01", 150));
    const nonUapa = mk({ arrestDate: "2025-05-01", frISubmittedDate: "2025-08-01" });
    expect(find(run(nonUapa, "2025-08-08"), "fr-sp-remarks")).toBeUndefined();
  });

  it("FR anchor is the EARLIEST per-accused arrest (V4-DELTA §2), falling back to the case date", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-1", accusedStatus: "judicial_custody", arrestDate: "2025-05-03" },
      { id: "a2", caseId: "c1", role: "accused", name: "A-2", accusedStatus: "police_custody", arrestDate: "2025-05-01" },
    ];
    const c = mk({ punishmentBand: "10plus", custodyStatus: "in_custody" }); // no case-level arrestDate
    const e = find(run(c, "2025-05-10", persons), "fr1-chargesheet")!;
    expect(e.dueAt).toBe(addDays("2025-05-01", 75)); // earliest accused arrest wins
    expect(find(run(mk({ punishmentBand: "10plus" }), "2025-05-10"), "fr1-chargesheet")).toBeUndefined(); // no anchor at all → no row
  });

  it("custody production fans out PER ACCUSED off each custody end date (1-day lead)", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-1 (foreign national)", accusedStatus: "police_custody", custodyEndDate: "2025-05-20" },
      { id: "a2", caseId: "c1", role: "accused", name: "A-2", accusedStatus: "judicial_custody" },
    ];
    const rows = run(mk({ arrestDate: "2025-05-01" }), "2025-05-10", persons).filter((d) => d.ruleId === "custody-production");
    expect(rows).toHaveLength(1);
    expect(rows[0].dueAt).toBe("2025-05-20");
    expect(rows[0].type).toMatch(/A-1/);
    expect(rows[0].instanceId).toBe("a1");
    expect(rows[0].leadOffsets).toContain(1);
    // legacy case-level date still fires for old records
    const legacy = run(mk({ arrestDate: "2025-05-01", custodyEndDate: "2025-05-22" }), "2025-05-10").filter((d) => d.ruleId === "custody-production");
    expect(legacy[0].dueAt).toBe("2025-05-22");
  });

  it("PR: first ≤15d of registration; monthly due by the 7th", () => {
    const first = find(run(mk({ firDate: "2025-05-01" }), "2025-05-03"), "pr-first")!;
    expect(first.dueAt).toBe(addDays("2025-05-01", 15));
    const monthly = run(mk({ firDate: "2025-05-01", firstPrFiledDate: "2025-05-10" }), "2025-06-03").filter((d) => d.ruleId === "pr-monthly");
    expect(monthly.some((d) => d.dueAt === "2025-06-07")).toBe(true);
  });

  it("a SKIPPED prior month stays overdue instead of vanishing; filed months go done", () => {
    // first PR filed in May; today is July; June was never filed
    const rows = run(mk({ firDate: "2025-05-01", firstPrFiledDate: "2025-05-10", prFiledMonths: ["2025-05", "2025-07"] }), "2025-07-08")
      .filter((d) => d.ruleId === "pr-monthly");
    const byMonth = (m: string) => rows.find((d) => d.dueAt === `${m}-07`)!;
    expect(byMonth("2025-05").state).toBe("done"); // filed
    expect(byMonth("2025-06").state).toBe("overdue"); // skipped → still overdue
    expect(byMonth("2025-07").state).toBe("done"); // filed
  });
});

describe("Court-trial engine (§4.2) + Superior Court Zone (§2)", () => {
  it("tags judgment + appeal as trial; bail prep as court", () => {
    const c = mk({ argumentsConcludedDate: "2025-06-01", judgmentDate: null, arrestDate: "2025-05-01" });
    expect(find(run(c, "2025-06-05"), "judgment-30")!.track).toBe("trial");
    const hearings: HearingRecord[] = [{ id: "h", caseId: "c1", hearingDate: "2025-06-15", purpose: "bail" }];
    expect(find(run(c, "2025-06-05", [], hearings), "bail-hearing-prep")!.track).toBe("court");
  });

  it("Superior-court hearings get their own 'superior' track + are kept out of routine court prep", () => {
    const hearings: HearingRecord[] = [
      { id: "h1", caseId: "c1", hearingDate: "2025-07-01", purpose: "slp", tier: "superior", forum: "SC" },
      { id: "h2", caseId: "c1", hearingDate: "2025-07-02", purpose: "trial" },
    ];
    const e = run(mk({}), "2025-06-20", [], hearings);
    const sup = find(e, "superior-court")!;
    expect(sup.track).toBe("superior");
    expect(sup.leadOffsets).toContain(15);
    expect(sup.type).toMatch(/SC|SLP/);
    // the superior one must NOT also appear as a routine court hearing
    const courtHearings = e.filter((x) => x.ruleId === "court-hearing-prep");
    expect(courtHearings.every((x) => !x.type.includes("slp"))).toBe(true);
  });
});

describe("kept clocks (verified extras)", () => {
  it("sanction clocks count WORKING days (skip the weekend)", () => {
    const c = mk({ uapaFlag: true, evidenceToAuthorityDate: "2025-05-01" }); // Thu + 7 wd = Mon 12th
    expect(find(run(c, "2025-05-05"), "sanction-rule3")!.dueAt).toBe("2025-05-12");
  });

  it("appeal splits by forum × outcome × death-sentence", () => {
    const death = run(mk({ judgmentDate: "2025-06-01", outcome: "convicted", trialCourtLevel: "sessions", deathSentence: true }), "2025-06-05");
    expect(find(death, "appeal-conviction-sessions-death-30")!.dueAt).toBe("2025-07-01");
    expect(find(death, "appeal-conviction-sessions-60")).toBeUndefined();
  });

  it("acquittal appeals ALWAYS go to the High Court (90d) — magistrate AND sessions, never Sessions", () => {
    for (const level of ["magistrate", "sessions"] as const) {
      const e = run(mk({ judgmentDate: "2025-06-01", outcome: "acquitted", trialCourtLevel: level }), "2025-06-05");
      const acq = find(e, "appeal-acquittal-hc-90")!;
      expect(acq.dueAt).toBe(addDays("2025-06-01", 90));
      expect(acq.type).toMatch(/High Court/);
      expect(e.some((d) => d.type.includes("Sessions") && d.type.includes("acquittal"))).toBe(false);
    }
  });

  it("s.479 is PER ACCUSED — a first-timer (1/3) and a barred co-accused yield distinct rows", () => {
    const c = mk({ custodyStatus: "in_custody", firstRemandDate: "2025-01-01", maxSentenceYears: 6, status: "trial" });
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "First-timer", firstTimeOffender: true },
      { id: "a2", caseId: "c1", role: "accused", name: "Habitual", otherPendingCases: true },
    ];
    const rows = run(c, "2025-06-01", persons).filter((d) => d.ruleId === "s479-undertrial-release");
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.type.includes("First-timer"))!.type).toMatch(/1\/3/);
    expect(rows.find((r) => r.type.includes("Habitual"))!.state).toBe("na"); // barred
  });

  it("a past hearing stays OVERDUE until marked disposed (doesn't silently vanish)", () => {
    const past: HearingRecord[] = [{ id: "h", caseId: "c1", hearingDate: "2025-05-01", purpose: "slp", tier: "superior", forum: "SC" }];
    expect(find(run(mk({}), "2025-06-01", [], past), "superior-court")!.state).toBe("overdue");
    const disposed: HearingRecord[] = [{ ...past[0], disposed: true }];
    expect(find(run(mk({}), "2025-06-01", [], disposed), "superior-court")!.state).toBe("done");
  });

  it("sexual-offence month clock clamps at end-of-month", () => {
    const c = mk({ sexualOffenceInScope: true, firDate: "2025-12-31" });
    expect(find(run(c, "2026-01-15"), "sexual-offence-invest-2mo")!.dueAt).toBe("2026-02-28");
  });

  it("uncertain items carry directory/verify, never a hard bar", () => {
    const d = find(run(mk({ committalOrderDate: "2025-06-01" }), "2025-06-10"), "discharge-60")!;
    expect(d.verified).toBe("uncertain");
    expect(d.severity).toBe("directory");
  });

  it("is pure — identical inputs give identical due dates", () => {
    const c = mk({ arrestDate: "2025-05-01", uapaFlag: true, custodyStatus: "in_custody" });
    expect(find(run(c, "2025-05-10"), "fr1-chargesheet")!.dueAt).toBe(find(run(c, "2025-05-10"), "fr1-chargesheet")!.dueAt);
  });
});

describe("expert-report 7-day auto-alert (V4-DELTA Q1 — supersedes V3's 2-day)", () => {
  const mkEv = (over: Partial<EvidenceRecord>): EvidenceRecord => ({
    id: "ev1",
    caseId: "c1",
    description: "Seized mobile phones",
    reportToObtain: "Device imaging / CFSL cyber report",
    status: "pending",
    reportKind: "expert",
    ...over,
  });
  const expert = (c: CaseRecord, today: string, ev: EvidenceRecord[]) =>
    find(run(c, today, [], [], ev), "expert-report-pending");

  it("day 0 (just forwarded): active, not overdue", () => {
    const e = expert(mk({}), "2025-05-01", [mkEv({ forwardedDate: "2025-05-01" })])!;
    expect(e.state).toBe("active");
    expect(e.dueAt).toBe(addDays("2025-05-01", 7));
    expect(e.owes).toBe("FSL");
    expect(e.track).toBe("investigation");
  });

  it("day 6: still active (within the 7-day chase window)", () => {
    expect(expert(mk({}), "2025-05-07", [mkEv({ forwardedDate: "2025-05-01" })])!.state).toBe("active");
  });

  it("forwarded + 7 days: overdue (RED) — the 7-day boundary fires", () => {
    expect(expert(mk({}), "2025-05-08", [mkEv({ forwardedDate: "2025-05-01" })])!.state).toBe("overdue");
  });

  it("marked received: done regardless of how long it ran", () => {
    const e = expert(mk({}), "2025-06-01", [mkEv({ forwardedDate: "2025-05-01", status: "received", receivedDate: "2025-04-20" })])!;
    expect(e.state).toBe("done");
  });

  it("non-expert reports and un-forwarded expert reports never alert", () => {
    const evs = [
      mkEv({ id: "e1", reportKind: "other", forwardedDate: "2025-05-01" }),
      mkEv({ id: "e2", reportKind: "expert", forwardedDate: null }),
    ];
    expect(run(mk({}), "2025-06-01", [], [], evs).filter((d) => d.ruleId === "expert-report-pending")).toHaveLength(0);
  });

  it("emits one row per forwarded expert report", () => {
    const evs = [
      mkEv({ id: "e1", forwardedDate: "2025-05-01" }),
      mkEv({ id: "e2", description: "Two foreign passports", forwardedDate: "2025-05-10" }),
    ];
    expect(run(mk({}), "2025-06-01", [], [], evs).filter((d) => d.ruleId === "expert-report-pending")).toHaveLength(2);
  });
});

describe("per-accused bail dates + appeal windows (V4-DELTA N6/N7)", () => {
  it("a bail-pending accused with a date raises a BAIL row; clears when flipped off", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-2 Hiren Das", accusedStatus: "judicial_custody", bailPending: true, bailDate: "2026-07-09" },
      { id: "a2", caseId: "c1", role: "accused", name: "A-3", accusedStatus: "judicial_custody", bailPending: false, bailDate: "2026-07-09" },
    ];
    const rows = run(mk({}), "2026-07-01", persons).filter((d) => d.ruleId === "bail-date-accused");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toMatch(/Hiren Das/);
    expect(rows[0].dueAt).toBe("2026-07-09");
    expect(rows[0].track).toBe("court");
  });

  it("convicted accused: forum-accurate default appeal window from sentence date", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-1", accusedStatus: "convicted", sentenceDate: "2026-03-12" },
    ];
    // sessions, non-death → 60d
    const sessions = run(mk({ trialCourtLevel: "sessions" }), "2026-04-01", persons).find((d) => d.ruleId === "appeal-window-accused")!;
    expect(sessions.dueAt).toBe(addDays("2026-03-12", 60));
    expect(sessions.note).toMatch(/forum-accurate/);
    // magistrate → 30d
    const mag = run(mk({ trialCourtLevel: "magistrate" }), "2026-04-01", persons).find((d) => d.ruleId === "appeal-window-accused")!;
    expect(mag.dueAt).toBe(addDays("2026-03-12", 30));
    // unknown forum → 90d fallback marked verify
    const unk = run(mk({}), "2026-04-01", persons).find((d) => d.ruleId === "appeal-window-accused")!;
    expect(unk.dueAt).toBe(addDays("2026-03-12", 90));
    expect(unk.note).toMatch(/VERIFY/);
  });

  it("an officer-set appeal-by overrides the computed default", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-1", accusedStatus: "convicted", sentenceDate: "2026-03-12", appealBy: "2026-05-01" },
    ];
    const e = run(mk({ trialCourtLevel: "sessions" }), "2026-04-01", persons).find((d) => d.ruleId === "appeal-window-accused")!;
    expect(e.dueAt).toBe("2026-05-01");
    expect(e.note).toMatch(/Officer-set/);
  });
});

describe("UAPA extension step honours the explicit custody-ext date (V4-DELTA §2)", () => {
  it("custodyExtFiledDate before day 90 marks the 43-D(2) window done; lead starts day 75", () => {
    const c = mk({ uapaFlag: true, arrestDate: "2026-06-04", custodyStatus: "in_custody", custodyExtFiledDate: "2026-08-20" });
    const e = find(run(c, "2026-08-25"), "uapa-pp-report-window")!;
    expect(e.state).toBe("done");
    expect(e.leadOffsets).toContain(15); // day-75 reminder on the day-90 boundary
  });

  it("anchor falls back to the earliest per-accused arrest when no case-level dates exist", () => {
    const persons: PersonRecord[] = [
      { id: "a1", caseId: "c1", role: "accused", name: "A-1", accusedStatus: "police_custody", arrestDate: "2026-06-04" },
    ];
    const e = find(run(mk({ uapaFlag: true }), "2026-06-10", persons), "uapa-pp-report-window")!;
    expect(e.dueAt).toBe(addDays("2026-06-04", 90));
  });
});

describe("process & requests tracker (§6) — expected-response overdue", () => {
  const mkReq = (over: Partial<ProcessRequestRecord>): ProcessRequestRecord => ({
    id: "r1",
    caseId: "c1",
    type: "MLA_LR",
    accusedIds: [],
    status: "pending",
    ...over,
  });
  const req = (today: string, rs: ProcessRequestRecord[]) =>
    find(run(mk({}), today, [], [], [], rs), "process-request-overdue");

  it("before the expected-response date: active", () => {
    const e = req("2026-07-01", [mkReq({ expectedResponseDate: "2026-08-14" })])!;
    expect(e.state).toBe("active");
    expect(e.track).toBe("process");
    expect(e.dueAt).toBe("2026-08-14");
  });

  it("past the expected-response date while pending: overdue (the 45-day / 15-day clocks fire)", () => {
    expect(req("2026-06-27", [mkReq({ refNo: "REF-FR/12", expectedResponseDate: "2026-06-20" })])!.state).toBe("overdue");
  });

  it("granted / executed / rejected requests stop alerting", () => {
    const rs: ProcessRequestRecord[] = [
      mkReq({ id: "a", status: "granted", expectedResponseDate: "2026-06-01" }),
      mkReq({ id: "b", status: "executed", expectedResponseDate: "2026-06-01" }),
      mkReq({ id: "c", status: "rejected", expectedResponseDate: "2026-06-01" }),
    ];
    expect(run(mk({}), "2026-06-27", [], [], [], rs).filter((d) => d.ruleId === "process-request-overdue")).toHaveLength(0);
  });

  it("a request with no expected-response date does not alert", () => {
    expect(req("2026-06-27", [mkReq({ status: "requested", expectedResponseDate: null })])).toBeUndefined();
  });

  it("custom type uses its label in the row", () => {
    const e = req("2026-06-27", [mkReq({ type: "custom", customLabel: "FRRO / MEA verification", expectedResponseDate: "2026-06-20" })])!;
    expect(e.type).toMatch(/FRRO \/ MEA verification/);
  });
});

describe("comms registers (V4-DELTA N3) — CDR/IPDR/IMEI + tower pendency", () => {
  const comms = (over: Partial<import("@/domain/types").CommsRequestRecord>) => ({
    id: "cr1", caseId: "c1", kind: "cdr" as const, ref: "L-0771/26 · 06 Jun 2026",
    numbers: ["70029-44810", "90850-33127", "77380-99012"], receivedCount: 1,
    expectedDate: "2026-06-22", ...over,
  });
  const runC = (today: string, rows: ReturnType<typeof comms>[], towers: import("@/domain/types").TowerDumpRecord[] = []) =>
    computeDeadlines(mk({}), [], [], DEFAULT_SETTINGS, today, [], [], rows, towers);

  it("pending identifiers past the expected date go overdue; before it, active", () => {
    const before = runC("2026-06-20", [comms({})]).find((d) => d.ruleId === "comms-pending")!;
    expect(before.state).toBe("active");
    expect(before.type).toMatch(/CDR - 2 of 3 pending/);
    const after = runC("2026-06-27", [comms({})]).find((d) => d.ruleId === "comms-pending")!;
    expect(after.state).toBe("overdue");
  });

  it("fully received rows are done; rows without an expected date never alert", () => {
    expect(runC("2026-06-27", [comms({ receivedCount: 3 })]).find((d) => d.ruleId === "comms-pending")!.state).toBe("done");
    expect(runC("2026-06-27", [comms({ expectedDate: null })]).filter((d) => d.ruleId === "comms-pending")).toHaveLength(0);
  });

  it("tower dumps alert until received", () => {
    const t: import("@/domain/types").TowerDumpRecord = {
      id: "t1", caseId: "c1", ref: "L-0790/26", site: "Paltan Bazar BTS", timeWindow: "02-Jun 12:00–14:00",
      status: "pending", expectedDate: "2026-06-28",
    };
    const row = runC("2026-07-01", [], [t]).find((d) => d.ruleId === "tower-pending")!;
    expect(row.state).toBe("overdue");
    expect(row.type).toMatch(/Paltan Bazar BTS/);
    expect(runC("2026-07-01", [], [{ ...t, status: "received" }]).find((d) => d.ruleId === "tower-pending")!.state).toBe("done");
  });
});

describe("routine trial 15-day lead (§4.2)", () => {
  it("routine (non-superior) court hearings now carry a 15-day lead, not 10", () => {
    const hearings: HearingRecord[] = [{ id: "h", caseId: "c1", hearingDate: "2026-07-20", purpose: "trial" }];
    const e = find(run(mk({}), "2026-06-20", [], hearings), "court-hearing-prep")!;
    expect(e.leadOffsets).toContain(15);
  });
});

/** Doc-sync: every rule's exact law reference pinned here; drift fails CI. */
const EXPECTED_LAWREFS: Record<string, string> = {
  "expert-report-pending": "Expert-report follow-up — pending >7 days from forwarding (V4-DELTA Q1)",
  "process-request-overdue": "Process & Requests — expected-response follow-up (§6)",
  "efir-3day": "BNSS 173(1)(ii)",
  "production-24h": "BNSS 58 + 187(1); Art. 22(2)",
  "fr1-chargesheet": "Chargesheet/FR limit from arrest (BNSS 187(3) / UAPA 43-D(2))",
  "fr-sp-remarks": "SP remarks — UAPA 150-day line (V6 preview / V4-DELTA Q2)",
  "fr-dg-order": "Hard flag: DG approval ≤ 7 days of FR-I submission (V4-DELTA Q2)",
  "fr-ir-mha": "IR for MHA sanction ≤ 7 days of DG approval (V6 preview)",
  "mha-sanction-pending": "MHA sanction — chargesheet blocked until obtained (V6 preview)",
  "bail-date-accused": "Bail matter on accused row — V6 preview (heading 12)",
  "appeal-window-accused": "Appeal window per convicted accused (V4-DELTA Q3/Q7)",
  "comms-pending": "CDR/IPDR/IMEI pendency - expected-date follow-up (V6 preview)",
  "tower-pending": "Tower-dump pendency - expected-date follow-up (V6 preview)",
  "custody-production": "BNSS — custody / production",
  "pr-first": "First PR ≤ 15 days of registration",
  "pr-monthly": "Monthly PR from the 1st; critical by the 7th",
  "uapa-pp-report-window": "UAPA 43-D(2)(b) proviso",
  "sanction-rule3": "UAP (Recommendation & Sanction) Rules 2008, Rule 3 + s.45(2)",
  "sanction-rule4": "UAP (Recommendation & Sanction) Rules 2008, Rule 4 + s.45(2)",
  "victim-90": "BNSS 193(3)(ii)",
  "doc-supply-14": "BNSS 230",
  "committal-90": "BNSS 232",
  "discharge-60": "BNSS 250(1)",
  "judgment-30": "BNSS 258 (sessions) / 392 (general)",
  "sexual-offence-invest-2mo": "BNSS 193(2)/(3)",
  "sexual-offence-trial-2mo": "BNSS 346 proviso",
  "s479-undertrial-release": "BNSS 479",
  "appeal-conviction-magistrate-30": "BNSS 415(3) + Limitation Act Art. 115(b)(ii)",
  "appeal-conviction-sessions-60": "BNSS 415(2) + Limitation Act Art. 115(b)(i)",
  "appeal-conviction-sessions-death-30": "Limitation Act Art. 115(a)",
  "appeal-acquittal-hc-90": "BNSS 419 + Limitation Act Art. 114",
  "superior-court": "Superior court (SC/HC) — SLP / writ / appellate",
  "bail-hearing-prep": "BNSS Ch. XXXV",
  "court-hearing-prep": "—",
  "review-overdue": "— (departmental review cadence)",
  "untouched": "— (supervisory staleness)",
};

describe("legal-rules doc-sync", () => {
  it("every registry rule has its exact pinned law reference", () => {
    for (const rule of RULE_REGISTRY) {
      expect(EXPECTED_LAWREFS[rule.id], `missing pinned lawRef for ${rule.id}`).toBeDefined();
      expect(rule.lawRef, `lawRef drift on ${rule.id}`).toBe(EXPECTED_LAWREFS[rule.id]);
    }
  });
  it("no orphan entries in the pinned map", () => {
    const ids = new Set(RULE_REGISTRY.map((r) => r.id));
    for (const id of Object.keys(EXPECTED_LAWREFS)) {
      expect(ids.has(id), `pinned lawRef for unknown rule ${id}`).toBe(true);
    }
  });
  it("rule ids are unique", () => {
    const ids = RULE_REGISTRY.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
