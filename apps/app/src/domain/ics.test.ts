import { describe, it, expect } from "vitest";
import {
  buildCaseIcs,
  buildAllCasesIcs,
  escapeText,
  foldLine,
  toIcsDate,
  eventUid,
  type IcsOptions,
} from "./ics";
import { sampleAggregates } from "@/domain/seed";
import { computeDeadlines } from "@/rules/engine";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { CaseAggregate } from "@/domain/repository";
import type { CaseRecord, HearingRecord, Settings } from "@/domain/types";

const TODAY = "2026-06-26"; // reference date the seed fixtures are tuned to
const DTSTAMP = "20260626T093000Z";
const OPTS: IcsOptions = { dtstamp: DTSTAMP };

function utf8Len(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Split a folded .ics back into UNFOLDED logical lines (RFC-5545 unfolding). */
function unfold(ics: string): string[] {
  // Continuation = CRLF followed by a single leading space.
  return ics.replace(/\r\n /g, "").split("\r\n").filter((l) => l.length > 0);
}

function minimalCase(over: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: "c-min",
    firNumber: "FIR 1/2026",
    firDate: "2026-06-01",
    punishmentBand: "lt3",
    uapaFlag: false,
    sexualOffenceInScope: false,
    eFirFlag: false,
    custodyStatus: "not_arrested",
    status: "investigation",
    ...over,
  };
}

function aggOf(c: CaseRecord, hearings: HearingRecord[] = []): CaseAggregate {
  return { case: c, persons: [], hearings, supervisionEntries: [], tasks: [] };
}

describe("buildCaseIcs — soft supervisory events stay out of the calendar (agenda parity)", () => {
  it("excludes review-overdue / untouched soft events though they have a real dueAt + overdue state", () => {
    // A case overdue for supervisory review (past nextReviewDate) AND stale.
    const c = minimalCase({ nextReviewDate: "2026-01-01", lastTouchedAt: "2025-01-01" });
    // The engine DOES generate the soft events...
    const dl = computeDeadlines(c, [], [], DEFAULT_SETTINGS, TODAY, [], []);
    expect(dl.some((d) => d.severity === "soft")).toBe(true);
    // ...but they must NOT reach the .ics (agenda keeps them out of the deadline tiers too).
    const ics = buildCaseIcs(aggOf(c), DEFAULT_SETTINGS, TODAY, OPTS);
    expect(ics).not.toContain("Supervisory review due");
    expect(ics).not.toContain("Case untouched");
  });
});

describe("escapeText", () => {
  it("escapes backslash FIRST so subsequent escapes are not double-escaped", () => {
    expect(escapeText("a\\b")).toBe("a\\\\b");
    // a literal backslash followed by a comma → backslash doubled, comma escaped
    expect(escapeText("\\,")).toBe("\\\\\\,");
  });

  it("escapes comma, semicolon and newline", () => {
    expect(escapeText("a,b")).toBe("a\\,b");
    expect(escapeText("a;b")).toBe("a\\;b");
    expect(escapeText("a\nb")).toBe("a\\nb");
    expect(escapeText("a\r\nb")).toBe("a\\nb");
    expect(escapeText("a\rb")).toBe("a\\nb");
  });

  it("leaves ':' and '@' untouched (legal in property values)", () => {
    expect(escapeText("a:b@c")).toBe("a:b@c");
  });
});

describe("toIcsDate", () => {
  it("YYYY-MM-DD → YYYYMMDD", () => {
    expect(toIcsDate("2026-06-27")).toBe("20260627");
  });
  it("truncates any time suffix", () => {
    expect(toIcsDate("2026-06-27T10:00:00Z")).toBe("20260627");
  });
});

describe("eventUid", () => {
  it("is stable and deterministic and carries the @caseclock suffix", () => {
    expect(eventUid("case-1", "fr1-chargesheet", "2026-06-27")).toBe(
      "case-1-fr1-chargesheet-2026-06-27@caseclock",
    );
    expect(eventUid("case-1", "fr1-chargesheet", "2026-06-27")).toBe(
      eventUid("case-1", "fr1-chargesheet", "2026-06-27"),
    );
  });

  it("sanitises whitespace and stray @ in the parts", () => {
    expect(eventUid("case 1", "rule@x", "k")).toBe("case-1-rule-x-k@caseclock");
  });

  it("strips RFC-5545 TEXT delimiters (, ; : \\) so the UID stays one bare token", () => {
    // d.type can carry user free-text (process-request label, expert-report 'reportToObtain').
    const uid = eventUid("c1", "expert-report-2day", "2026-06-27-evil, and; bad: x\\y");
    expect(uid).toBe("c1-expert-report-2day-2026-06-27-evil-and-bad-x-y@caseclock");
    // No raw delimiter survives anywhere except the intended trailing @caseclock suffix.
    expect(uid.replace("@caseclock", "")).not.toMatch(/[,;:\\@]/);
  });
});

describe("foldLine", () => {
  it("leaves a <=75-octet line unchanged", () => {
    const line = "X".repeat(75);
    expect(foldLine(line)).toBe(line);
    expect(utf8Len(line)).toBe(75);
  });

  it("folds a >75-octet line with CRLF + single leading space", () => {
    const line = "Y".repeat(150);
    const folded = foldLine(line);
    expect(folded).not.toBe(line);
    expect(folded).toContain("\r\n ");
    // Every physical line must be <=75 octets.
    for (const physical of folded.split("\r\n")) {
      expect(utf8Len(physical)).toBeLessThanOrEqual(75);
    }
    // Unfolding restores the original content.
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("never splits a multibyte UTF-8 codepoint across the fold boundary", () => {
    // Devanagari + emoji: each codepoint is multi-octet; folding must keep them whole.
    const line = "SUMMARY:" + "क".repeat(40) + "😀".repeat(10);
    const folded = foldLine(line);
    for (const physical of folded.split("\r\n")) {
      expect(utf8Len(physical)).toBeLessThanOrEqual(75);
    }
    // Round-trips with no replacement characters / corruption.
    const restored = folded.replace(/\r\n /g, "");
    expect(restored).toBe(line);
    expect(restored).not.toContain("�");
  });
});

describe("buildCaseIcs — structure", () => {
  const c = minimalCase({ arrestDate: "2026-06-20", firstRemandDate: "2026-06-20", custodyStatus: "in_custody" });
  const ics = buildCaseIcs(aggOf(c), DEFAULT_SETTINGS, TODAY, OPTS);

  it("emits CRLF endings and a balanced VCALENDAR wrapper", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const lines = unfold(ics);
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//CaseClock//EN");
  });

  it("balances every BEGIN/END pair", () => {
    const lines = unfold(ics);
    const count = (tag: string) => lines.filter((l) => l === tag).length;
    expect(count("BEGIN:VEVENT")).toBe(count("END:VEVENT"));
    expect(count("BEGIN:VALARM")).toBe(count("END:VALARM"));
    expect(count("BEGIN:VCALENDAR")).toBe(1);
    expect(count("END:VCALENDAR")).toBe(1);
    // Two VALARMs per VEVENT.
    expect(count("BEGIN:VALARM")).toBe(count("BEGIN:VEVENT") * 2);
  });

  it("uses all-day DTSTART;VALUE=DATE with next-day exclusive DTEND and UTC DTSTAMP", () => {
    const lines = unfold(ics);
    // chargesheet/FR clock: arrest 2026-06-20, scheduled_lower buffer 45 → 2026-08-04
    expect(lines).toContain("DTSTART;VALUE=DATE:20260804");
    expect(lines).toContain("DTEND;VALUE=DATE:20260805");
    expect(lines.every((l) => !l.startsWith("DTSTAMP:") || l === `DTSTAMP:${DTSTAMP}`)).toBe(true);
    expect(lines).toContain(`DTSTAMP:${DTSTAMP}`);
  });

  it("emits exactly two VALARMs (-P15D and -P1D) per event by default", () => {
    const lines = unfold(ics);
    expect(lines.filter((l) => l === "TRIGGER:-P15D").length).toBe(
      lines.filter((l) => l === "BEGIN:VEVENT").length,
    );
    expect(lines.filter((l) => l === "TRIGGER:-P1D").length).toBe(
      lines.filter((l) => l === "BEGIN:VEVENT").length,
    );
    expect(lines).toContain("ACTION:DISPLAY");
  });

  it("honours custom alarmOffsets", () => {
    const custom = buildCaseIcs(aggOf(c), DEFAULT_SETTINGS, TODAY, { ...OPTS, alarmOffsets: [30, 7, 1] });
    const lines = unfold(custom);
    const nEvents = lines.filter((l) => l === "BEGIN:VEVENT").length;
    expect(lines.filter((l) => l === "TRIGGER:-P30D").length).toBe(nEvents);
    expect(lines.filter((l) => l === "TRIGGER:-P7D").length).toBe(nEvents);
    expect(lines.filter((l) => l === "TRIGGER:-P1D").length).toBe(nEvents);
    expect(lines.filter((l) => l === "TRIGGER:-P15D").length).toBe(0);
    expect(lines.filter((l) => l === "BEGIN:VALARM").length).toBe(nEvents * 3);
  });
});

describe("buildCaseIcs — skip rules", () => {
  it("skips dueAt===null and inert states (done/na/extinguished/latent)", () => {
    // Filed chargesheet → fr1 state 'done'; no arrest so most clocks absent. Give a
    // single future hearing so we still produce a valid (non-empty) calendar.
    const c = minimalCase({
      arrestDate: "2026-06-20",
      firstRemandDate: "2026-06-20",
      custodyStatus: "in_custody",
      chargesheetFiledDate: "2026-06-25", // fr1-chargesheet → done
    });
    const ics = buildCaseIcs(aggOf(c), DEFAULT_SETTINGS, TODAY, OPTS);
    const lines = unfold(ics);
    // No event should carry the chargesheet UID (state done → skipped).
    expect(lines.some((l) => l.startsWith("UID:") && l.includes("fr1-chargesheet"))).toBe(false);
    // s.479 with no maxSentenceYears yields state 'na' / dueAt null — never present.
    expect(lines.some((l) => l.includes("s479"))).toBe(false);
  });
});

describe("buildCaseIcs — evidence + processRequest threading (regression guard)", () => {
  // A case whose ONLY computable deadlines are the expert-report-2day (from evidence)
  // and the process-request-overdue (from processRequests). If the builder forgot to
  // thread evidence/processRequests into computeDeadlines, BOTH would vanish.
  const c = minimalCase({ id: "c-thread", firNumber: "FIR 9/2026", chargesheetFiledDate: "2026-06-01" });
  const agg: CaseAggregate = {
    case: c,
    persons: [],
    hearings: [],
    supervisionEntries: [],
    tasks: [],
    evidence: [
      {
        id: "ev1",
        caseId: c.id,
        description: "Seized phone",
        reportToObtain: "Device imaging report",
        status: "pending",
        reportKind: "expert",
        forwardedDate: "2026-06-10",
      },
    ],
    processRequests: [
      {
        id: "pr1",
        caseId: c.id,
        type: "custom",
        customLabel: "FRRO / MEA verification",
        accusedIds: [],
        status: "pending",
        expectedResponseDate: "2026-06-20",
      },
    ],
  };

  it("includes BOTH the expert-report and the process-request events", () => {
    const lines = unfold(buildCaseIcs(agg, DEFAULT_SETTINGS, TODAY, OPTS));
    expect(lines.some((l) => l.startsWith("UID:") && l.includes("expert-report-2day"))).toBe(true);
    expect(lines.some((l) => l.startsWith("UID:") && l.includes("process-request-overdue"))).toBe(true);
  });
});

describe("buildCaseIcs — hearing escaping", () => {
  it("escapes special characters in the hearing summary", () => {
    const c = minimalCase({ chargesheetFiledDate: "2026-06-01" });
    const hearing: HearingRecord = {
      id: "h1",
      caseId: c.id,
      hearingDate: "2026-07-04",
      purpose: "trial",
      court: "CJM Court; Room 3, Wing-A",
    };
    const ics = buildCaseIcs(aggOf(c, [hearing]), DEFAULT_SETTINGS, TODAY, OPTS);
    const lines = unfold(ics);
    const summary = lines.find((l) => l.startsWith("SUMMARY:") && l.includes("Hearing"));
    expect(summary).toBeDefined();
    // ';' and ',' in the court name must be backslash-escaped.
    expect(summary).toContain("\\;");
    expect(summary).toContain("\\,");
    // The hearing produces its own VEVENT with a stable hearing UID.
    expect(lines).toContain("UID:c-min-h1-hearing@caseclock");
  });
});

describe("buildAllCasesIcs", () => {
  const settings: Settings = DEFAULT_SETTINGS;

  it("includes live cases and excludes closed cases by default", () => {
    const open = aggOf(minimalCase({ id: "open-1", firNumber: "FIR-OPEN" }, ), [
      { id: "ho", caseId: "open-1", hearingDate: "2026-07-10", purpose: "trial" },
    ]);
    const closed = aggOf(minimalCase({ id: "closed-1", firNumber: "FIR-CLOSED", status: "closed" }), [
      { id: "hc", caseId: "closed-1", hearingDate: "2026-07-11", purpose: "trial" },
    ]);
    const lines = unfold(buildAllCasesIcs([open, closed], settings, TODAY, OPTS));
    expect(lines).toContain("UID:open-1-ho-hearing@caseclock");
    expect(lines.some((l) => l.includes("closed-1"))).toBe(false);
  });

  it("includes closed cases when opts.includeClosed is set", () => {
    const closed = aggOf(minimalCase({ id: "closed-1", firNumber: "FIR-CLOSED", status: "closed" }), [
      { id: "hc", caseId: "closed-1", hearingDate: "2026-07-11", purpose: "trial" },
    ]);
    const lines = unfold(buildAllCasesIcs([closed], settings, TODAY, { ...OPTS, includeClosed: true }));
    expect(lines).toContain("UID:closed-1-hc-hearing@caseclock");
  });

  it("produces a valid empty VCALENDAR for empty input", () => {
    const ics = buildAllCasesIcs([], settings, TODAY, OPTS);
    expect(ics).toBe(
      "BEGIN:VCALENDAR\r\n" +
        "VERSION:2.0\r\n" +
        "PRODID:-//CaseClock//EN\r\n" +
        "CALSCALE:GREGORIAN\r\n" +
        "METHOD:PUBLISH\r\n" +
        "END:VCALENDAR\r\n",
    );
  });
});

describe("determinism + UID uniqueness", () => {
  it("is byte-identical across runs with a fixed dtstamp", () => {
    const aggs = sampleAggregates();
    const a = buildAllCasesIcs(aggs, DEFAULT_SETTINGS, TODAY, OPTS);
    const b = buildAllCasesIcs(aggs, DEFAULT_SETTINGS, TODAY, OPTS);
    expect(a).toBe(b);
  });

  it("emits unique UIDs across the whole all-cases export", () => {
    const lines = unfold(buildAllCasesIcs(sampleAggregates(), DEFAULT_SETTINGS, TODAY, OPTS));
    const uids = lines.filter((l) => l.startsWith("UID:"));
    expect(uids.length).toBeGreaterThan(0);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("re-export reuses the SAME UID for an unchanged event (idempotent update)", () => {
    const aggs = sampleAggregates();
    const first = unfold(buildAllCasesIcs(aggs, DEFAULT_SETTINGS, TODAY, OPTS)).filter((l) => l.startsWith("UID:"));
    const again = unfold(buildAllCasesIcs(aggs, DEFAULT_SETTINGS, TODAY, OPTS)).filter((l) => l.startsWith("UID:"));
    expect(again).toEqual(first);
  });

  it("custom prodId is honoured", () => {
    const ics = buildAllCasesIcs([], DEFAULT_SETTINGS, TODAY, { ...OPTS, prodId: "-//Acme//Test//EN" });
    expect(unfold(ics)).toContain("PRODID:-//Acme//Test//EN");
  });
});

describe("sample fixtures end-to-end", () => {
  it("emits the seed expert-report + process-request RED events for the live cases", () => {
    const lines = unfold(buildAllCasesIcs(sampleAggregates(), DEFAULT_SETTINGS, TODAY, OPTS));
    // Case 2 passport-forgery expert report (forwarded 10 Jun → overdue) and the
    // FRRO/MEA process request (expected 20 Jun → overdue) should both appear.
    expect(lines.some((l) => l.startsWith("UID:") && l.includes("expert-report-2day"))).toBe(true);
    expect(lines.some((l) => l.startsWith("UID:") && l.includes("process-request-overdue"))).toBe(true);
  });
});
