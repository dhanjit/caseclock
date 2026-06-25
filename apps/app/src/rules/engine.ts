/**
 * The rules engine (PLAN §4) — the legal heart.
 *
 * Each rule is a PURE function of (case, persons, hearings, settings, today) →
 * deadline event(s). All statutory references and verified-status come from the
 * adversarially fact-checked table in docs/RESEARCH.md §5 (mirrored in
 * docs/legal-rules.md). `today` is always passed in, so rules are deterministic
 * and golden-testable.
 *
 * Key correctness invariants (each covered by a golden test in engine.test.ts):
 *   - the officer's FR-I clock's WORKING ALERT is their buffered target from arrest (§4.1),
 *     but the STATUTORY default-bail date legally runs from first remand
 *   - custody limits by case type: UAPA 90 (→180 only if extension granted),
 *     scheduled-higher (10yr+) 90, scheduled-lower (<10yr) 60 — per BNSS 187(3)
 *   - the UAPA PP-report has a hard day-90 boundary and is owed by the PP
 *   - sanction clocks count WORKING days
 *   - appeal limitation splits by forum × outcome × death-sentence; acquittal
 *     appeals always lie to the High Court (90d)
 */

import {
  addDays,
  addMonths,
  addWorkingDays,
  diffDays,
  type ISODate,
} from "./dates";
import {
  custodyLimits,
  type CaseRecord,
  type DeadlineEvent,
  type DeadlineState,
  type DeadlineTrack,
  type HearingRecord,
  type PersonRecord,
  type Settings,
  type Severity,
  type Verified,
} from "@/domain/types";

interface RuleResult {
  type: string;
  dueAt: ISODate | null;
  occurrenceDate?: ISODate | null;
  state: DeadlineState;
  owes?: DeadlineEvent["owes"];
  note?: string;
  approximate?: boolean;
}

interface RuleCtx {
  c: CaseRecord;
  persons: PersonRecord[];
  hearings: HearingRecord[];
  settings: Settings;
  today: ISODate;
}

interface Rule {
  id: string;
  lawRef: string;
  verified: Verified;
  severity: Severity;
  track?: DeadlineTrack; // defaults to "investigation"
  leadOffsets: number[];
  applies: (c: CaseRecord) => boolean;
  compute: (ctx: RuleCtx) => RuleResult | RuleResult[] | null;
}

/** Standard "anchor + offset, done-if" state vs today. */
function stateVs(dueAt: ISODate, today: ISODate, done: boolean): DeadlineState {
  if (done) return "done";
  return diffDays(today, dueAt) > 0 ? "overdue" : "active";
}

/** Inclusive list of YYYY-MM from startYM through endYM (capped at 600 months). */
function monthsBetween(startYM: string, endYM: string): string[] {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  if (sy > ey || (sy === ey && sm > em)) return [endYM];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const LEAD_CRITICAL = [15, 7, 3, 1];
const LEAD_STATUTORY = [7, 3];
const LEAD_COURT = [10, 7, 3];

export const RULE_REGISTRY: Rule[] = [
  // ---- e-FIR -------------------------------------------------------------
  {
    id: "efir-3day",
    lawRef: "BNSS 173(1)(ii)",
    verified: "corrected",
    severity: "statutory",
    leadOffsets: [1],
    applies: (c) => c.eFirFlag,
    compute: ({ c, today }) => {
      const due = addDays(c.firDate, 3);
      return { type: "e-FIR signature by informant", dueAt: due, state: stateVs(due, today, !!c.eFirSignedDate) };
    },
  },

  // ---- 24h production ----------------------------------------------------
  {
    id: "production-24h",
    lawRef: "BNSS 58 + 187(1); Art. 22(2)",
    verified: "confirmed",
    severity: "statutory-critical",
    leadOffsets: [],
    applies: (c) => !!c.arrestDate,
    compute: ({ c, today }) => {
      const due = addDays(c.arrestDate!, 1);
      return {
        type: "Production before magistrate (24h)",
        dueAt: due,
        state: stateVs(due, today, !!c.firstRemandDate),
        note: "Excludes journey time; first production must be in person.",
        approximate: true,
      };
    },
  },

  // ==== OFFICER INVESTIGATION ENGINE (REQUIREMENTS §4.1) ===================
  // Chargesheet / FR-I clock — anchored on ARREST, the officer's case-type limits:
  // buffered target as the working alert + the true statutory date as a safeguard.
  {
    id: "fr1-chargesheet",
    lawRef: "Chargesheet/FR limit from arrest (BNSS 187(3) / UAPA 43-D(2))",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "investigation",
    leadOffsets: LEAD_CRITICAL,
    applies: (c) => !!c.arrestDate,
    compute: ({ c, today }) => {
      const lim = custodyLimits(c);
      // Working alert = his buffered target from ARREST (§4.1). Statutory default-bail
      // date legally runs from FIRST REMAND (BNSS 187(3)), falling back to arrest.
      const buffered = addDays(c.arrestDate!, lim.buffered);
      const statutoryAnchor = c.firstRemandDate ?? c.arrestDate!;
      const statutory = addDays(statutoryAnchor, lim.statutory);
      const anchorLabel = c.firstRemandDate ? "first remand" : "arrest";
      const filed = !!c.chargesheetFiledDate;
      const note = filed
        ? "Chargesheet / FR filed."
        : `Buffered target ${lim.buffered}d from arrest · statutory ${statutory} (${lim.statutory}d from ${anchorLabel}) — miss = default bail.${lim.statutoryNote ? " " + lim.statutoryNote : ""}`;
      return {
        type: `Chargesheet / FR-I (${lim.buffered}d target)`,
        dueAt: buffered,
        state: filed ? "done" : stateVs(buffered, today, false),
        note,
        owes: "IO",
      };
    },
  },
  // FR review chain — hierarchy is "indicative only"; the single HARD flag is the
  // DG order > 7 days after SP remarks.
  {
    id: "fr-sp-remarks",
    lawRef: "FR-II → SP (Branch Head) comments ≤ 1 week",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: (c) => !!c.frIIFiledDate,
    compute: ({ c, today }) => {
      const due = addDays(c.frIIFiledDate!, 7);
      return { type: "SP remarks on FR-II (≤1 week)", dueAt: due, state: stateVs(due, today, !!c.spRemarksDate), owes: "self" };
    },
  },
  {
    id: "fr-dg-order",
    lawRef: "Hard flag: DG order ≤ 7 days of SP remarks",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: (c) => !!c.spRemarksDate,
    compute: ({ c, today }) => {
      const due = addDays(c.spRemarksDate!, 7);
      return {
        type: "DG order on FR (≤7 days of SP remarks)",
        dueAt: due,
        state: stateVs(due, today, !!c.dgOrderDate),
        owes: "self",
        note: "Hard flag — escalate if the DG order is not passed within 7 days of SP remarks.",
      };
    },
  },
  // Custody production — user feeds the custody end date; remind 1 day prior.
  {
    id: "custody-production",
    lawRef: "BNSS — custody / production",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "investigation",
    leadOffsets: [1],
    applies: (c) => !!c.custodyEndDate,
    compute: ({ c, today }) => ({
      type: "Custody ends — produce accused / seek extension",
      dueAt: c.custodyEndDate!,
      state: stateVs(c.custodyEndDate!, today, false),
      owes: "IO",
      note: "Reminder 1 day prior; record the previous custody as history.",
    }),
  },
  // Progress Reports (PR)
  {
    id: "pr-first",
    lawRef: "First PR ≤ 15 days of registration",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [5, 2],
    applies: (c) => !c.chargesheetFiledDate,
    compute: ({ c, today }) => {
      const due = addDays(c.firDate, 15);
      return { type: "First Progress Report (≤15 days)", dueAt: due, state: stateVs(due, today, !!c.firstPrFiledDate), owes: "IO" };
    },
  },
  {
    id: "pr-monthly",
    lawRef: "Monthly PR from the 1st; critical by the 7th",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: (c) => !!c.firstPrFiledDate, // monthly cadence starts after the first PR
    compute: ({ c, today }) => {
      // Emit every month from the first PR through now, so a SKIPPED prior month
      // stays overdue instead of silently vanishing when the calendar rolls over.
      const startMonth = (c.firstPrFiledDate ?? c.firDate).slice(0, 7);
      const filed = new Set(c.prFiledMonths ?? []);
      const courtPr = !!c.chargesheetFiledDate;
      return monthsBetween(startMonth, today.slice(0, 7)).map((month) => {
        const due = `${month}-07`;
        return {
          type: courtPr ? `Court PR — ${month} (by 7th)` : `Monthly PR — ${month} (by 7th)`,
          dueAt: due,
          occurrenceDate: due,
          state: stateVs(due, today, filed.has(month)),
          owes: "IO",
          note: "Reckoned from the 1st; never pending beyond the 7th.",
        };
      });
    },
  },
  {
    id: "uapa-pp-report-window",
    lawRef: "UAPA 43-D(2)(b) proviso",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "investigation",
    leadOffsets: [20, 15, 7, 3],
    applies: (c) => c.uapaFlag && !!(c.firstRemandDate || c.arrestDate) && !c.chargesheetFiledDate,
    compute: ({ c, today }) => {
      const day90 = addDays((c.firstRemandDate ?? c.arrestDate)!, 90);
      const r = c.uapaPpReportFiledDate;
      let state: DeadlineState;
      let note: string;
      if (r) {
        if (diffDays(r, day90) < 0) {
          state = "done";
          note = "PP progress+reasons report filed before day 90.";
        } else {
          state = "overdue";
          note = "PP report filed ON/AFTER day 90 — invalid; default-bail exposure.";
        }
      } else if (diffDays(today, day90) >= 0) {
        state = "overdue";
        note = "Day 90 reached with no PP report — extension barred; default-bail exposure.";
      } else {
        state = "active";
        note = "PP (not IO) must file the progress+reasons report BEFORE day 90.";
      }
      return { type: "UAPA 43-D(2) PP extension report", dueAt: day90, state, owes: "PP", note };
    },
  },


  // ---- s.45 sanction (working-day clocks) --------------------------------
  {
    id: "sanction-rule3",
    lawRef: "UAP (Recommendation & Sanction) Rules 2008, Rule 3 + s.45(2)",
    verified: "confirmed",
    severity: "statutory-critical",
    leadOffsets: [3, 1],
    applies: (c) => c.uapaFlag && !!c.evidenceToAuthorityDate,
    compute: ({ c, today, settings }) => {
      const due = addWorkingDays(c.evidenceToAuthorityDate!, 7, new Set(settings.holidays));
      return {
        type: "Sanction — Authority recommendation (7 working days)",
        dueAt: due,
        state: stateVs(due, today, !!c.rule3RecommendationDate),
        approximate: true,
        note: "7 working days; excludes gazetted holidays not in settings.",
      };
    },
  },
  {
    id: "sanction-rule4",
    lawRef: "UAP (Recommendation & Sanction) Rules 2008, Rule 4 + s.45(2)",
    verified: "confirmed",
    severity: "statutory-critical",
    leadOffsets: [3, 1],
    applies: (c) => c.uapaFlag && !!c.rule3RecommendationDate,
    compute: ({ c, today, settings }) => {
      const due = addWorkingDays(c.rule3RecommendationDate!, 7, new Set(settings.holidays));
      return {
        type: "Sanction — Government decision (7 working days)",
        dueAt: due,
        state: stateVs(due, today, !!c.rule4SanctionDate),
        approximate: true,
      };
    },
  },

  // ---- Victim update / document supply -----------------------------------
  {
    id: "victim-90",
    lawRef: "BNSS 193(3)(ii)",
    verified: "confirmed",
    severity: "statutory",
    leadOffsets: LEAD_STATUTORY,
    applies: () => true,
    compute: ({ c, today }) => {
      const due = addDays(c.firDate, 90);
      return { type: "Victim progress update (90-day)", dueAt: due, state: stateVs(due, today, !!c.victimUpdatedDate) };
    },
  },
  {
    id: "doc-supply-14",
    lawRef: "BNSS 230",
    verified: "confirmed",
    severity: "statutory",
    leadOffsets: [3],
    applies: (c) => !!c.accusedFirstAppearanceDate,
    compute: ({ c, today }) => {
      const due = addDays(c.accusedFirstAppearanceDate!, 14);
      return { type: "Supply of documents to accused (14-day)", dueAt: due, state: stateVs(due, today, !!c.chargeFramingDate), owes: "court" };
    },
  },

  // ---- Committal / discharge / judgment ----------------------------------
  {
    id: "committal-90",
    lawRef: "BNSS 232",
    verified: "confirmed",
    severity: "statutory",
    leadOffsets: [10, 3],
    applies: (c) => !!c.cognizanceDate && c.trialCourtLevel === "sessions",
    compute: ({ c, today }) => {
      const due = addDays(c.cognizanceDate!, 90);
      return { type: "Committal to Sessions (90-day)", dueAt: due, state: stateVs(due, today, !!c.committalOrderDate), owes: "court" };
    },
  },
  {
    id: "discharge-60",
    lawRef: "BNSS 250(1)",
    verified: "uncertain",
    severity: "directory",
    leadOffsets: [7],
    applies: (c) => !!c.committalOrderDate,
    compute: ({ c, today }) => {
      const due = addDays(c.committalOrderDate!, 60);
      return {
        type: "Discharge application window (60-day)",
        dueAt: due,
        state: stateVs(due, today, !!c.chargeFramingDate),
        note: "Directory, not mandatory (Kerala HC) — verify before relying.",
      };
    },
  },
  {
    // 258 (sessions) carries the 30-day-from-arguments clock, extendable to 45 for
    // recorded reasons; 392 is the general pronouncement section, not the deadline source.
    id: "judgment-30",
    lawRef: "BNSS 258 (sessions) / 392 (general)",
    verified: "confirmed",
    severity: "statutory",
    leadOffsets: [5],
    applies: (c) => !!c.argumentsConcludedDate,
    compute: ({ c, today }) => {
      const due = addDays(c.argumentsConcludedDate!, 30);
      return {
        type: "Judgment after arguments (30-day)",
        dueAt: due,
        state: stateVs(due, today, !!c.judgmentDate),
        note: "Extendable to 45 days for recorded reasons.",
      };
    },
  },

  // ---- Sexual-offence (directory; scope: BNS 64-68/70/71 + POCSO 4/6/8/10)
  {
    id: "sexual-offence-invest-2mo",
    lawRef: "BNSS 193(2)/(3)",
    verified: "corrected",
    severity: "directory",
    leadOffsets: [7],
    applies: (c) => c.sexualOffenceInScope,
    compute: ({ c, today }) => {
      const due = addMonths(c.firDate, 2);
      return {
        type: "Sexual-offence investigation (2-month)",
        dueAt: due,
        state: stateVs(due, today, !!c.chargesheetFiledDate),
        note: "Scope: BNS 64-68/70/71 + POCSO 4/6/8/10 (s.69 excluded); directory.",
      };
    },
  },
  {
    id: "sexual-offence-trial-2mo",
    lawRef: "BNSS 346 proviso",
    verified: "confirmed",
    severity: "directory",
    leadOffsets: [7],
    applies: (c) => c.sexualOffenceInScope && !!c.chargesheetFiledDate,
    compute: ({ c, today }) => {
      const due = addMonths(c.chargesheetFiledDate!, 2);
      return { type: "Sexual-offence trial (2-month)", dueAt: due, state: stateVs(due, today, !!c.judgmentDate) };
    },
  },

  // ---- s.479 undertrial release ------------------------------------------
  {
    id: "s479-undertrial-release",
    lawRef: "BNSS 479",
    verified: "confirmed",
    severity: "statutory",
    leadOffsets: [15, 7],
    applies: (c) =>
      c.custodyStatus === "in_custody" && !!c.firstRemandDate && !!c.maxSentenceYears && !c.lifeOrDeath,
    compute: ({ c, today, persons }) => {
      // The 1/3-vs-1/2 fraction AND the multiple-pending-cases bar are PER ACCUSED —
      // emit one row per accused, not one arbitrary case-level row.
      const accusedList = persons.filter((p) => p.role === "accused");
      const targets: (PersonRecord | undefined)[] = accusedList.length ? accusedList : [undefined];
      return targets.map((accused) => {
        const who = accused?.name ? ` — ${accused.name}` : "";
        if (accused?.otherPendingCases) {
          return { type: `s.479 undertrial release${who}`, dueAt: null, state: "na" as const, note: "Barred — multiple pending offences/cases." };
        }
        const fraction = accused?.firstTimeOffender ? 1 / 3 : 1 / 2;
        const days = Math.round(fraction * c.maxSentenceYears! * 365);
        const due = addDays(c.firstRemandDate!, days);
        const released = accused?.custodyStatus ? accused.custodyStatus !== "in_custody" : c.custodyStatus !== "in_custody";
        return {
          type: `s.479 undertrial release${who} (${accused?.firstTimeOffender ? "1/3" : "1/2"} of max)`,
          dueAt: due,
          occurrenceDate: due,
          state: stateVs(due, today, released),
          note: "Jail Supt. has the s.479(3) duty to apply; not for life/death.",
        };
      });
    },
  },

  // ---- Appeal limitation (forum × outcome × death-sentence) --------------
  {
    id: "appeal-conviction-magistrate-30",
    lawRef: "BNSS 415(3) + Limitation Act Art. 115(b)(ii)",
    verified: "confirmed",
    severity: "statutory-condonable",
    leadOffsets: [30, 7],
    applies: (c) => !!c.judgmentDate && c.outcome === "convicted" && c.trialCourtLevel === "magistrate",
    compute: ({ c, today }) => appealResult(c, today, 30, "Appeal to Sessions"),
  },
  {
    id: "appeal-conviction-sessions-60",
    lawRef: "BNSS 415(2) + Limitation Act Art. 115(b)(i)",
    verified: "confirmed",
    severity: "statutory-condonable",
    leadOffsets: [30, 7],
    applies: (c) =>
      !!c.judgmentDate && c.outcome === "convicted" && c.trialCourtLevel === "sessions" && !c.deathSentence,
    compute: ({ c, today }) => appealResult(c, today, 60, "Appeal to High Court"),
  },
  {
    id: "appeal-conviction-sessions-death-30",
    lawRef: "Limitation Act Art. 115(a)",
    verified: "confirmed",
    severity: "statutory-condonable",
    leadOffsets: [20, 7],
    applies: (c) =>
      !!c.judgmentDate && c.outcome === "convicted" && c.trialCourtLevel === "sessions" && !!c.deathSentence,
    compute: ({ c, today }) => appealResult(c, today, 30, "Death-sentence appeal to High Court"),
  },
  {
    // BNSS 419: appeals against acquittal lie to the HIGH COURT (90 days, Art. 114),
    // whether the trial was before a magistrate or sessions court. There is no
    // acquittal appeal to the Court of Session.
    id: "appeal-acquittal-hc-90",
    lawRef: "BNSS 419 + Limitation Act Art. 114",
    verified: "confirmed",
    severity: "statutory-condonable",
    leadOffsets: [30, 7],
    applies: (c) => !!c.judgmentDate && c.outcome === "acquitted",
    compute: ({ c, today }) => appealResult(c, today, 90, "Appeal against acquittal (High Court)"),
  },

  // ---- Hearings (court / bail prep) --------------------------------------
  {
    id: "bail-hearing-prep",
    lawRef: "BNSS Ch. XXXV",
    verified: "confirmed",
    severity: "court",
    leadOffsets: [5, 3, 1],
    applies: () => true,
    compute: ({ hearings, today }) =>
      hearings
        .filter((h) => h.purpose === "bail" && h.tier !== "superior")
        .map((h) => ({
          type: "Bail hearing — prepare objections",
          dueAt: h.hearingDate,
          occurrenceDate: h.hearingDate,
          state: hearingState(h, today),
          owes: "self" as const,
          note: "File status report + case-diary extracts; brief PP; produce antecedents.",
        })),
  },
  {
    id: "court-hearing-prep",
    lawRef: "—",
    verified: "confirmed",
    severity: "court",
    leadOffsets: LEAD_COURT,
    applies: () => true,
    compute: ({ hearings, today }) =>
      hearings
        .filter((h) => h.purpose !== "bail" && h.tier !== "superior")
        .map((h) => ({
          type: `Court hearing — ${h.purpose}`,
          dueAt: h.hearingDate,
          occurrenceDate: h.hearingDate,
          state: hearingState(h, today),
        })),
  },

  // ---- Superior Court Zone (§2 — SC/HC, distinct highlight, 15-day reminder) --
  {
    id: "superior-court",
    lawRef: "Superior court (SC/HC) — SLP / writ / appellate",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "superior",
    leadOffsets: [15, 7, 3, 1],
    applies: () => true,
    compute: ({ hearings, today }) =>
      hearings
        .filter((h) => h.tier === "superior" || h.purpose === "slp" || h.purpose === "writ")
        .map((h) => ({
          type: `Superior court — ${h.forum ?? "SC/HC"}${h.purpose === "slp" ? " · SLP" : h.purpose === "writ" ? " · Writ" : ""}`,
          dueAt: h.hearingDate,
          occurrenceDate: h.hearingDate,
          state: hearingState(h, today),
          note: "Top priority — SC/HC listing.",
        })),
  },

  // ---- Supervisory -------------------------------------------------------
  {
    id: "review-overdue",
    lawRef: "— (departmental review cadence)",
    verified: "uncertain",
    severity: "soft",
    leadOffsets: [3, 0],
    applies: (c) => !!c.nextReviewDate,
    compute: ({ c, today }) => {
      const due = c.nextReviewDate!;
      const state: DeadlineState = diffDays(today, due) > 0 ? "overdue" : "active";
      return { type: "Supervisory review due", dueAt: due, state, owes: "self" };
    },
  },
  {
    id: "untouched",
    lawRef: "— (supervisory staleness)",
    verified: "uncertain",
    severity: "soft",
    leadOffsets: [],
    applies: (c) => !!c.lastTouchedAt,
    compute: ({ c, today, settings }) => {
      const idle = diffDays(today, c.lastTouchedAt!);
      if (idle < settings.untouchedDays) return null;
      const due = addDays(c.lastTouchedAt!, settings.untouchedDays);
      return { type: `Case untouched ${idle} days`, dueAt: due, state: "overdue", owes: "self" };
    },
  },
];

/**
 * A hearing is "done" only when the officer marks it disposed/adjourned — NOT merely
 * because the date passed. A past-but-unconfirmed hearing stays "overdue" so a
 * missed listing (esp. SC/HC) keeps signalling instead of silently dropping off.
 */
function hearingState(h: HearingRecord, today: ISODate): DeadlineState {
  if (h.disposed) return "done";
  return diffDays(today, h.hearingDate) > 0 ? "overdue" : "active";
}

function appealResult(c: CaseRecord, today: ISODate, days: number, label: string): RuleResult {
  const due = addDays(c.judgmentDate!, days);
  return {
    type: `${label} (${days}-day)`,
    dueAt: due,
    state: stateVs(due, today, !!c.appealDecided),
    note: "Day-count from the Limitation Act; condonable under s.5.",
  };
}

const TRIAL_RULES = new Set([
  "judgment-30",
  "sexual-offence-trial-2mo",
  "court-hearing-prep",
  "superior-court",
  "appeal-conviction-magistrate-30",
  "appeal-conviction-sessions-60",
  "appeal-conviction-sessions-death-30",
  "appeal-acquittal-hc-90",
  "appeal-acquittal-sessions-30",
]);
const COURT_RULES = new Set(["committal-90", "discharge-60", "doc-supply-14", "bail-hearing-prep", "s479-undertrial-release"]);
const SUPERVISORY_RULES = new Set(["review-overdue", "untouched"]);

function trackFor(id: string, explicit: DeadlineTrack | undefined): DeadlineTrack {
  if (explicit) return explicit;
  if (id === "superior-court") return "superior";
  if (TRIAL_RULES.has(id)) return "trial";
  if (COURT_RULES.has(id)) return "court";
  if (SUPERVISORY_RULES.has(id)) return "supervisory";
  return "investigation";
}

/** Run every applicable rule for a case → computed deadline events. */
export function computeDeadlines(
  c: CaseRecord,
  persons: PersonRecord[],
  hearings: HearingRecord[],
  settings: Settings,
  today: ISODate,
): DeadlineEvent[] {
  const out: DeadlineEvent[] = [];
  for (const rule of RULE_REGISTRY) {
    if (!rule.applies(c)) continue;
    const res = rule.compute({ c, persons, hearings, settings, today });
    if (!res) continue;
    for (const r of Array.isArray(res) ? res : [res]) {
      out.push({
        caseId: c.id,
        ruleId: rule.id,
        type: r.type,
        dueAt: r.dueAt,
        occurrenceDate: r.occurrenceDate ?? r.dueAt,
        severity: rule.severity,
        lawRef: rule.lawRef,
        verified: rule.verified,
        state: r.state,
        track: trackFor(rule.id, rule.track),
        leadOffsets: rule.leadOffsets,
        owes: r.owes,
        note: r.note,
        approximate: r.approximate,
      });
    }
  }
  return out;
}
