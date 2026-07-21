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
  monthsBetween,
  type ISODate,
} from "./dates";
import {
  custodyLimits,
  defaultAppealWindowDays,
  earliestArrest,
  processRequestLabel,
  type CaseRecord,
  type CommsRequestRecord,
  type TowerDumpRecord,
  type DeadlineEvent,
  type DeadlineState,
  type DeadlineTrack,
  type EvidenceRecord,
  type HearingRecord,
  type PersonRecord,
  type ProcessRequestRecord,
  type Settings,
  type Severity,
  type Verified,
} from "@/domain/types";

interface RuleResult {
  type: string;
  dueAt: ISODate | null;
  occurrenceDate?: ISODate | null;
  instanceId?: string;
  state: DeadlineState;
  owes?: DeadlineEvent["owes"];
  note?: string;
  approximate?: boolean;
}

interface RuleCtx {
  c: CaseRecord;
  persons: PersonRecord[];
  hearings: HearingRecord[];
  evidence: EvidenceRecord[];
  processRequests: ProcessRequestRecord[];
  commsRequests: CommsRequestRecord[];
  towerDumps: TowerDumpRecord[];
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

const LEAD_CRITICAL = [15, 7, 3, 1];
const LEAD_STATUTORY = [7, 3];
// Routine trial-track hearings carry a 15-day lead (REQUIREMENTS §4.2) — same head
// start the Superior Court Zone gets, so charge-framing / deposition / final-argument
// listings surface 15 days out, not 10.
const LEAD_COURT = [15, 10, 7, 3];

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
    applies: () => true, // anchor may live on the accused rows — resolved in compute
    compute: ({ c, persons, today }) => {
      // V4-DELTA §2: the FR anchor is the EARLIEST per-accused arrest (V6 frAnchor),
      // falling back to the case-level arrestDate for older records.
      const anchor = earliestArrest(c, persons);
      if (!anchor) return null;
      const lim = custodyLimits(c);
      // Working alert = his buffered target from ARREST (§4.1). Statutory default-bail
      // date legally runs from FIRST REMAND (BNSS 187(3)), falling back to arrest.
      const buffered = addDays(anchor, lim.buffered);
      const statutoryAnchor = c.firstRemandDate ?? anchor;
      const statutory = addDays(statutoryAnchor, lim.statutory);
      const anchorLabel = c.firstRemandDate ? "first remand" : "earliest arrest";
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
  // FR → MHA-sanction pipeline (V4-DELTA §2, per the officer's V6 preview):
  // FR-I submitted → DG approval (≤7d of FR-I, HARD) → IR for MHA (≤7d of DG, HARD)
  // → MHA sanction. SP remarks is a UAPA-only step riding the 150-day line.
  {
    id: "fr-sp-remarks",
    lawRef: "SP remarks — UAPA 150-day line (V6 preview / V4-DELTA Q2)",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [15, 7, 3],
    applies: (c) => c.uapaFlag && !!c.frISubmittedDate,
    compute: ({ c, persons, today }) => {
      const anchor = earliestArrest(c, persons);
      if (!anchor) return null;
      const due = addDays(anchor, custodyLimits(c).buffered);
      return { type: "SP remarks on FR (within the 150-day line)", dueAt: due, state: stateVs(due, today, !!c.spRemarksDate), owes: "self" };
    },
  },
  {
    id: "fr-dg-order",
    lawRef: "Hard flag: DG approval ≤ 7 days of FR-I submission (V4-DELTA Q2)",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: (c) => !!c.frISubmittedDate,
    compute: ({ c, today }) => {
      const due = addDays(c.frISubmittedDate!, 7);
      return {
        type: "DG approval of FR-I (≤7 days)",
        dueAt: due,
        state: stateVs(due, today, !!(c.dgApprovedDate || c.dgOrderDate)),
        owes: "self",
        note: "Hard flag — escalate if DG approval is not recorded within 7 days of FR-I submission.",
      };
    },
  },
  {
    id: "fr-ir-mha",
    lawRef: "IR for MHA sanction ≤ 7 days of DG approval (V6 preview)",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: (c) => !!(c.dgApprovedDate || c.dgOrderDate),
    compute: ({ c, today }) => {
      // Chargesheet already on file without this step → the pipeline is moot (V6
      // closes it on csFiled); a recorded IR still shows as a done row.
      if (c.chargesheetFiledDate && !c.irForMhaDate) return null;
      const dg = (c.dgApprovedDate ?? c.dgOrderDate)!;
      const due = addDays(dg, 7);
      return {
        type: "IR for MHA sanction (≤7 days of DG approval)",
        dueAt: due,
        state: stateVs(due, today, !!c.irForMhaDate),
        owes: "self",
        note: "Hard flag — the Investigation Report for MHA sanction goes within a week of DG approval.",
      };
    },
  },
  {
    id: "mha-sanction-pending",
    lawRef: "MHA sanction — chargesheet blocked until obtained (V6 preview)",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: (c) => !!c.irForMhaDate,
    compute: ({ c, today }) => {
      const due = addDays(c.irForMhaDate!, 7);
      return {
        type: "MHA sanction pending",
        dueAt: due,
        state: stateVs(due, today, !!c.mhaSanctionDate),
        owes: "self",
        note: "Chargesheet may be filed only after MHA sanction — follow up weekly.",
      };
    },
  },
  // Custody production — per-accused custody end dates (V4-DELTA §2); the legacy
  // case-level date still fires for older records. Remind 1 day prior.
  {
    id: "custody-production",
    lawRef: "BNSS — custody / production",
    verified: "confirmed",
    severity: "statutory-critical",
    track: "investigation",
    leadOffsets: [1],
    applies: () => true,
    compute: ({ c, persons, today }) => {
      const rows: RuleResult[] = persons
        .filter((p) => p.role === "accused" && p.custodyEndDate)
        .map((p) => ({
          type: `Custody ends — produce ${p.name} / seek extension`,
          dueAt: p.custodyEndDate!,
          occurrenceDate: p.custodyEndDate!,
          instanceId: p.id,
          state: stateVs(p.custodyEndDate!, today, false),
          owes: "IO" as const,
          note: "Reminder 1 day prior; record the previous custody as history.",
        }));
      if (c.custodyEndDate) {
        rows.push({
          type: "Custody ends — produce accused / seek extension",
          dueAt: c.custodyEndDate,
          state: stateVs(c.custodyEndDate, today, false),
          owes: "IO",
          note: "Reminder 1 day prior; record the previous custody as history.",
        });
      }
      return rows.length ? rows : null;
    },
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
          instanceId: month,
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
    // V4-DELTA §2: the reminder runs from day 75 (V6 CUSTEXT step) — lead 15 on the
    // day-90 boundary = day 75.
    leadOffsets: [15, 7, 3, 1],
    applies: (c) => c.uapaFlag && !c.chargesheetFiledDate,
    compute: ({ c, persons, today }) => {
      const anchor = c.firstRemandDate ?? earliestArrest(c, persons);
      if (!anchor) return null;
      const day90 = addDays(anchor, 90);
      // Either date evidences the extension step: the PP report or the officer's
      // explicit "custody extension 90→180 filed" date (V4-DELTA custodyExtFiledDate).
      const r = c.uapaPpReportFiledDate ?? c.custodyExtFiledDate;
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
  // Expert-report follow-up (V4-DELTA Q1 — the officer's V6 preview sets the chase
  // window at 7 days from forwarding, superseding V3's 2 days). FSL, ballistic,
  // device imaging etc. — clears the moment the report is marked received.
  {
    id: "expert-report-pending",
    lawRef: "Expert-report follow-up — pending >7 days from forwarding (V4-DELTA Q1)",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [2, 1],
    applies: () => true,
    compute: ({ evidence, today }) =>
      evidence
        .filter((e) => e.reportKind === "expert" && !!e.forwardedDate)
        .map((e) => {
          const due = addDays(e.forwardedDate!, 7);
          const received = e.status === "received";
          // Overdue from forwarding + 7 (inclusive): pending on day 7 owes the lab a
          // reminder. Receipt switches it off regardless of the date.
          const state: DeadlineState = received ? "done" : diffDays(today, due) >= 0 ? "overdue" : "active";
          return {
            type: `Expert report pending — ${e.reportToObtain || e.description}`,
            dueAt: due,
            occurrenceDate: due,
            instanceId: e.id,
            state,
            owes: "FSL" as const,
            note: "Auto-alert: pending >7 days from forwarding; clears when the report is marked received.",
          };
        }),
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
          return { type: `s.479 undertrial release${who}`, dueAt: null, instanceId: accused?.id, state: "na" as const, note: "Barred — multiple pending offences/cases." };
        }
        const fraction = accused?.firstTimeOffender ? 1 / 3 : 1 / 2;
        const days = Math.round(fraction * c.maxSentenceYears! * 365);
        const due = addDays(c.firstRemandDate!, days);
        const released = accused?.custodyStatus ? accused.custodyStatus !== "in_custody" : c.custodyStatus !== "in_custody";
        return {
          type: `s.479 undertrial release${who} (${accused?.firstTimeOffender ? "1/3" : "1/2"} of max)`,
          dueAt: due,
          occurrenceDate: due,
          instanceId: accused?.id,
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

  // ---- Per-accused bail dates (V4-DELTA §2 / V6 accused table) ------------
  // A live bail matter recorded directly on the accused row — no hearing record
  // needed. Cleared by flipping bailPending off (or recording the outcome).
  {
    id: "bail-date-accused",
    lawRef: "Bail matter on accused row — V6 preview (heading 12)",
    verified: "confirmed",
    severity: "court",
    track: "court",
    leadOffsets: [5, 3, 1],
    applies: () => true,
    compute: ({ persons, today }) =>
      persons
        .filter((p) => p.role === "accused" && p.bailPending && p.bailDate)
        .map((p) => ({
          type: `Bail hearing — ${p.name}`,
          dueAt: p.bailDate!,
          occurrenceDate: p.bailDate!,
          instanceId: p.id,
          state: stateVs(p.bailDate!, today, false),
          owes: "self" as const,
          note: "From the accused roster (bail pending). Oppose with case-diary extracts; clears when bail-pending is switched off.",
        })),
  },

  // ---- Per-accused appeal window (V4-DELTA Q3/Q7) -------------------------
  // A convicted accused carries sentence + appeal-by; the default window is
  // forum-accurate (30 magistrate / 60 sessions / 30 death), 90d "verify" fallback.
  {
    id: "appeal-window-accused",
    lawRef: "Appeal window per convicted accused (V4-DELTA Q3/Q7)",
    verified: "confirmed",
    severity: "statutory-condonable",
    track: "trial",
    leadOffsets: [30, 15, 7],
    applies: () => true,
    compute: ({ c, persons, today }) =>
      persons
        .filter((p) => p.role === "accused" && p.accusedStatus === "convicted" && (p.appealBy || p.sentenceDate))
        .map((p) => {
          const win = defaultAppealWindowDays(c);
          const due = p.appealBy ?? addDays(p.sentenceDate!, win.days);
          return {
            type: `Appeal window — ${p.name}`,
            dueAt: due,
            occurrenceDate: due,
            instanceId: p.id,
            state: stateVs(due, today, !!c.appealDecided),
            note: p.appealBy
              ? "Officer-set appeal-by date."
              : win.verified
                ? `Default ${win.days}-day window from sentence (forum-accurate); edit appeal-by to override.`
                : "Default 90-day window — trial forum unknown, VERIFY the limitation period.",
          };
        }),
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
          instanceId: h.id,
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
          instanceId: h.id,
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
          instanceId: h.id,
          state: hearingState(h, today),
          note: "Top priority — SC/HC listing.",
        })),
  },

  // ---- Process & Requests tracker (REQUIREMENTS §6) ----------------------
  // LOC / MLA-LR / Interpol / NBW / FRRO-MEA etc. — each carries an expected-response
  // date; the request alerts once that date passes while still requested/pending.
  {
    id: "process-request-overdue",
    lawRef: "Process & Requests — expected-response follow-up (§6)",
    verified: "confirmed",
    severity: "court",
    track: "process",
    leadOffsets: [7, 3, 1],
    applies: () => true,
    compute: ({ processRequests, today }) =>
      processRequests
        .filter((r) => !!r.expectedResponseDate && (r.status === "requested" || r.status === "pending"))
        .map((r) => ({
          type: `${processRequestLabel(r)} — response${r.refNo ? ` (${r.refNo})` : ""}`,
          dueAt: r.expectedResponseDate!,
          occurrenceDate: r.expectedResponseDate!,
          instanceId: r.id,
          state: stateVs(r.expectedResponseDate!, today, false),
          owes: "self" as const,
          note: "Follow up — expected response date has been set for this request.",
        })),
  },

  // ---- Comms registers (V4-DELTA N3 / V6) --------------------------------
  // CDR/IPDR/IMEI: pending = numbers - received; overdue past the expected date
  // while anything is pending. Identifiers only - no raw CDR is ingested.
  {
    id: "comms-pending",
    lawRef: "CDR/IPDR/IMEI pendency - expected-date follow-up (V6 preview)",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: () => true,
    compute: ({ commsRequests, today }) =>
      commsRequests
        .filter((r) => !!r.expectedDate)
        .map((r) => {
          const pending = Math.max(0, (r.numbers ?? []).length - (r.receivedCount ?? 0));
          return {
            type: `${r.kind.toUpperCase()} - ${pending} of ${(r.numbers ?? []).length} pending (${r.ref})`,
            dueAt: r.expectedDate!,
            occurrenceDate: r.expectedDate!,
            instanceId: r.id,
            state: pending === 0 ? ("done" as const) : stateVs(r.expectedDate!, today, false),
            owes: "self" as const,
            note: "Service-provider follow-up; clears when every requested identifier is received.",
          };
        }),
  },
  {
    id: "tower-pending",
    lawRef: "Tower-dump pendency - expected-date follow-up (V6 preview)",
    verified: "confirmed",
    severity: "statutory",
    track: "investigation",
    leadOffsets: [3, 1],
    applies: () => true,
    compute: ({ towerDumps, today }) =>
      towerDumps
        .filter((t) => !!t.expectedDate)
        .map((t) => ({
          type: `Tower dump - ${t.site || t.ref} ${t.status === "received" ? "received" : "pending"}`,
          dueAt: t.expectedDate!,
          occurrenceDate: t.expectedDate!,
          instanceId: t.id,
          state: t.status === "received" ? ("done" as const) : stateVs(t.expectedDate!, today, false),
          owes: "self" as const,
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
  evidence: EvidenceRecord[] = [],
  processRequests: ProcessRequestRecord[] = [],
  commsRequests: CommsRequestRecord[] = [],
  towerDumps: TowerDumpRecord[] = [],
): DeadlineEvent[] {
  const out: DeadlineEvent[] = [];
  for (const rule of RULE_REGISTRY) {
    if (!rule.applies(c)) continue;
    const res = rule.compute({ c, persons, hearings, evidence, processRequests, commsRequests, towerDumps, settings, today });
    if (!res) continue;
    for (const r of Array.isArray(res) ? res : [res]) {
      out.push({
        caseId: c.id,
        ruleId: rule.id,
        type: r.type,
        dueAt: r.dueAt,
        occurrenceDate: r.occurrenceDate ?? r.dueAt,
        instanceId: r.instanceId,
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
