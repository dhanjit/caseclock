/**
 * CaseClock domain model (PLAN §3). The rules engine (M3) operates purely on
 * these types; persistence (M2 repositories) maps them to/from SQLite rows.
 */

import type { ISODate } from "@/rules/dates";

export type Severity =
  | "statutory-critical"
  | "statutory"
  | "statutory-condonable"
  | "court"
  | "soft"
  | "directory";

export type Verified = "confirmed" | "corrected" | "uncertain";

export type DeadlineState =
  | "latent"
  | "active"
  | "overdue"
  | "done"
  | "na"
  | "window-open" // default bail claimable now (not yet extinguished by filing)
  | "extinguished"; // default-bail right extinguished by a timely chargesheet

/** Punishment band → 60/90 chargesheet track + 7yr+ forensic trigger (PLAN §5.1). */
export type PunishmentBand = "lt3" | "3to7" | "7to10" | "10plus";

export type CaseStatus =
  | "registered"
  | "investigation"
  | "custody"
  | "chargesheet"
  | "cognizance"
  | "committal"
  | "charge_framed"
  | "trial"
  | "judgment"
  | "appeal"
  | "closed";

export type CustodyStatus = "not_arrested" | "in_custody" | "on_bail";
export type TrialCourtLevel = "magistrate" | "sessions" | "high_court";
export type Outcome = "pending" | "convicted" | "acquitted";

/** Officer custody case type (REQUIREMENTS §4.1 table) — drives the chargesheet/FR limit from arrest. */
export type CustodyCaseType = "uapa" | "scheduled_higher" | "scheduled_lower";

/** Which engine a deadline belongs to — investigation vs trial, tagged on the dashboard (§4). */
export type DeadlineTrack = "investigation" | "trial" | "court" | "supervisory" | "superior" | "process";

/** Sanction tracking (REQUIREMENTS §5). */
export type SanctionStatus = "na" | "required" | "pending" | "obtained";

/** Evidence ↔ report mapping + No. of witnesses (§5 / heading 9). */
export interface EvidenceRecord {
  id: string;
  caseId: string;
  description: string;
  reportToObtain?: string;
  status: "pending" | "received";
  witnesses?: number | null;
  // Expert-report 2-day auto-alert (REQUIREMENTS §4.1): FSL / ballistic / device
  // imaging etc. fire RED once pending beyond 2 days from the forwarding date and
  // clear the instant the report is marked received.
  reportKind?: "expert" | "other"; // only "expert" reports drive the 2-day alert
  forwardedDate?: ISODate | null; // date the exhibit/sample was sent to the lab
  receivedDate?: ISODate | null; // optional — set when the report comes back
}

/** LOC / Interpol notices per accused (§5). */
export interface LocNotice {
  id: string;
  type: "LOC" | "RCN" | "Blue" | "Yellow" | "other";
  ref?: string;
  status?: string;
}

/** Process & Requests tracker (REQUIREMENTS §6) — formal requests raised during
 * arrest / investigation, linked to the accused. The case-level superset of the
 * per-accused LocNotice; the expected-response date drives the overdue alert. */
export type ProcessRequestType =
  | "LOC"
  | "MLA_LR" // MLA / Letters Rogatory
  | "interpol_red"
  | "interpol_blue"
  | "NBW"
  | "proclamation"
  | "attachment"
  | "custom";

export type ProcessRequestStatus =
  | "requested"
  | "pending"
  | "granted"
  | "executed"
  | "rejected";

export interface ProcessRequestRecord {
  id: string;
  caseId: string;
  type: ProcessRequestType;
  customLabel?: string; // when type === "custom"
  accusedIds: string[]; // PersonRecord ids this request is linked to
  refNo?: string; // reference / letter number
  dateRaised?: ISODate | null;
  authority?: string; // authority addressed
  status: ProcessRequestStatus;
  expectedResponseDate?: ISODate | null; // drives the §6 overdue alert
  note?: string;
}

export const PROCESS_REQUEST_LABEL: Record<ProcessRequestType, string> = {
  LOC: "LOC (Look-Out Circular)",
  MLA_LR: "MLA / Letters Rogatory",
  interpol_red: "Interpol Red Notice",
  interpol_blue: "Interpol Blue Notice",
  NBW: "NBW / warrant",
  proclamation: "Proclamation",
  attachment: "Attachment",
  custom: "Custom",
};

/** Human label for a request row (honours customLabel for custom types). */
export function processRequestLabel(r: ProcessRequestRecord): string {
  if (r.type === "custom") return r.customLabel?.trim() || "Custom request";
  return PROCESS_REQUEST_LABEL[r.type];
}

/** Previous custody history per accused (§4.1 / heading 12). */
export interface CustodyHistoryEntry {
  id: string;
  from?: ISODate | null;
  to?: ISODate | null;
  kind?: "police" | "judicial" | "other";
}

/** Place of occurrence — plotted on a map (§5). */
export interface PlaceOfOccurrence {
  label?: string;
  lat?: number | null;
  lng?: number | null;
}

/** The officer's 11 accused statuses (REQUIREMENTS §6), each with a distinct colour. */
export type AccusedStatus =
  | "police_custody"
  | "judicial_custody"
  | "not_arrested"
  | "absconding"
  | "killed"
  | "surrendered"
  | "approver"
  | "charge_sheeted"
  | "under_investigation"
  | "acquitted"
  | "dropped";

export interface CaseRecord {
  id: string;
  firNumber: string; // §3.1 Case number
  firDate: ISODate; // §3.5 Date of registration — also drives victim-90 etc.
  policeStation?: string;
  district?: string;

  // Officer case-file headings (REQUIREMENTS §3) — free-text, evolve over the case
  identity?: string; // §3.2 Identity of the case (1 line)
  sectionsOfLaw?: string; // §3.3 Sections of law (display string; structured flags below)
  occurrenceDate?: ISODate | null; // §3.4 Date of occurrence (distinct from registration)
  brief?: string; // §3.6 Brief of the case
  investigationProgress?: string; // §3.8 Progress of investigation
  trialStatus?: string; // §3.10 Status of trial
  planOfAction?: string; // §3.13 Plan of action

  // Offence classification
  punishmentBand: PunishmentBand;
  trackOverride?: 60 | 90 | null; // manual 60/90 override for the "10 years" edge
  uapaFlag: boolean;
  sevenYearPlus?: boolean;
  sexualOffenceInScope: boolean; // BNS 64-68/70/71 + POCSO 4/6/8/10 only (s.69 excluded)
  maxSentenceYears?: number | null; // for s.479 undertrial-release
  lifeOrDeath?: boolean; // excludes s.479 general release

  // e-FIR
  eFirFlag: boolean;
  eFirSignedDate?: ISODate | null;

  // Custody anchors
  arrestDate?: ISODate | null;
  firstRemandDate?: ISODate | null; // BNSS first-remand anchor (extras)
  custodyStatus: CustodyStatus;
  chargesheetFiledDate?: ISODate | null; // = FR-I / chargesheet filed

  // Officer investigation engine (REQUIREMENTS §4.1) — chargesheet/FR clock from ARREST
  custodyCaseType?: CustodyCaseType | null; // drives the statutory limit + buffer (default-derived)
  uapaCustodyDays?: number | null; // configurable UAPA target (default 150); statutory 90→180 shown alongside
  custodyEndDate?: ISODate | null; // user-fed custody end → production reminder 1 day prior
  // FR review chain (hierarchy "indicative only"; only the DG-7-day flag is hard)
  frIIFiledDate?: ISODate | null;
  spRemarksDate?: ISODate | null;
  dgOrderDate?: ISODate | null;
  // Progress Reports
  firstPrFiledDate?: ISODate | null; // first PR (≤15d of registration)
  prFiledMonths?: string[]; // YYYY-MM marked filed (monthly PR, due by the 7th)

  // UAPA track
  uapaPpReportFiledDate?: ISODate | null;
  uapaExtensionGranted?: boolean | null;

  // s.45 sanction track (working-day clocks)
  evidenceToAuthorityDate?: ISODate | null;
  rule3RecommendationDate?: ISODate | null;
  rule4SanctionDate?: ISODate | null;
  sanctionAnnexed?: boolean;

  // Victim
  victimUpdatedDate?: ISODate | null;

  // Court
  cognizanceDate?: ISODate | null;
  accusedFirstAppearanceDate?: ISODate | null;
  trialCourtLevel?: TrialCourtLevel | null;
  committalOrderDate?: ISODate | null;
  chargeFramingDate?: ISODate | null;
  argumentsConcludedDate?: ISODate | null;
  judgmentDate?: ISODate | null;
  outcome?: Outcome;
  deathSentence?: boolean;
  appealDecided?: boolean; // appeal filed or decided not to appeal

  // Sanctions (§5) + place of occurrence (§5)
  sanctionStatutory?: SanctionStatus;
  sanctionDg?: SanctionStatus;
  sanctionNote?: string;
  place?: PlaceOfOccurrence;

  // Supervision
  status: CaseStatus;
  lastTouchedAt?: ISODate | null;
  nextReviewDate?: ISODate | null;
  // Fluid user priority (REQUIREMENTS §1) — the officer flags up to ~10 cases that
  // pin to the top of the dashboard with all engines firing; lighter (non-priority)
  // cases still auto-compute deadlines but alert silently. Replaces the dead
  // `priorityHeinous`, which conflated heinousness with this user-driven priority.
  priority?: boolean;
}

export interface PersonRecord {
  id: string;
  caseId: string;
  role: "accused" | "witness" | "victim" | "informant" | "surety";
  name: string;
  accusedStatus?: AccusedStatus; // §6 — the officer's 11-value status (for role=accused)
  firstTimeOffender?: boolean;
  otherPendingCases?: boolean; // s.479 / s.480 disqualifier
  custodyStatus?: "in_custody" | "released";
  securedSummonedStatus?: "secured" | "summoned" | "pending";
  loc?: LocNotice[]; // §5 — LOC / Interpol notices
  custodyHistory?: CustodyHistoryEntry[]; // §4.1 — previous custody
}

export interface HearingRecord {
  id: string;
  caseId: string;
  hearingDate: ISODate;
  court?: string;
  purpose: "bail" | "trial" | "remand" | "framing" | "deposition" | "arguments" | "slp" | "writ" | "other";
  tier?: "routine" | "superior"; // §2 — superior = SC/HC (distinct highlight)
  forum?: "SC" | "HC"; // when superior
  disposed?: boolean; // marked done/adjourned — past hearings stay overdue until set
}

export type Owes = "IO" | "PP" | "court" | "self" | "FSL";

/** Append-only supervisory timeline — the spine of context continuity (PLAN §7.5). */
export interface SupervisionEntryRecord {
  id: string;
  caseId: string;
  createdAt: string; // ISO datetime
  entryType: "cd-scrutiny" | "supervisory-note" | "io-update" | "court-note" | "private";
  lastActionText?: string;
  noteText: string;
  nextActionText?: string;
  nextActionOwes?: Owes;
  nextReviewDate?: ISODate | null;
}

export interface TaskRecord {
  id: string;
  caseId: string;
  title: string;
  owes?: Owes;
  dueDate?: ISODate | null;
  status: "open" | "done";
}

export interface Settings {
  untouchedDays: number; // "case untouched N days" threshold
  holidays: string[]; // gazetted holidays for working-day clocks (ISO dates)
}

export const DEFAULT_SETTINGS: Settings = {
  untouchedDays: 14,
  holidays: [],
};

/** A computed statutory/court/supervisory deadline (output of the rules engine). */
export interface DeadlineEvent {
  caseId: string;
  ruleId: string;
  type: string; // human label
  dueAt: ISODate | null;
  occurrenceDate: ISODate | null; // AlertState keying (usually = dueAt)
  /** Sub-entity discriminator for fan-out rules (per accused/hearing/evidence/PR):
   *  distinguishes sibling deadlines that share (caseId, ruleId, occurrenceDate).
   *  Undefined for single-result rules. Feeds alertKey + the notification dedup key. */
  instanceId?: string;
  severity: Severity;
  lawRef: string;
  verified: Verified;
  state: DeadlineState;
  track: DeadlineTrack; // §4 — investigation vs trial (vs court/supervisory/superior)
  leadOffsets: number[]; // days-before to alert
  owes?: "IO" | "PP" | "court" | "self" | "FSL";
  note?: string;
  approximate?: boolean; // working-day clocks excluding gazetted holidays
}

/** The chargesheet/default-bail track in days for a case (band + manual override). */
export function trackDays(c: CaseRecord): 60 | 90 {
  if (c.trackOverride === 60 || c.trackOverride === 90) return c.trackOverride;
  return c.punishmentBand === "10plus" ? 90 : 60;
}

/** Default-derive the officer's custody case type from existing flags when not set. */
export function custodyCaseTypeOf(c: CaseRecord): CustodyCaseType {
  if (c.custodyCaseType) return c.custodyCaseType;
  if (c.uapaFlag) return "uapa";
  // BNSS 187(3): the 90-day ceiling is ONLY for death / life / "not less than ten
  // years". 7-to-under-10 (and below) is a 60-day case — mapping it to the higher
  // track would warn ~30 days too late on default bail.
  return c.punishmentBand === "10plus" ? "scheduled_higher" : "scheduled_lower";
}

/**
 * Decision #6 guard (V3-BUILD-PLAN): a case whose Sections-of-law text cites a UAPA
 * provision but whose `uapaFlag` / `custodyCaseType` is unset silently falls onto the
 * scheduled 60/45 track instead of the UAPA 150/90 one — under-warning on default bail.
 * Detects that mismatch so the UI can prompt the officer to confirm the UAPA flag.
 */
const UAPA_SECTION_RE = /\bUA\s*\(?P\)?\s*A\b|\bUAPA\b|unlawful activities/i;
export function uapaSectionWithoutFlag(c: CaseRecord): boolean {
  if (c.uapaFlag) return false;
  if (c.custodyCaseType === "uapa") return false;
  return !!c.sectionsOfLaw && UAPA_SECTION_RE.test(c.sectionsOfLaw);
}

/**
 * The officer's chargesheet/FR-I limits FROM ARREST (REQUIREMENTS §4.1): buffered target
 * for the working alert + the true statutory date shown alongside as a safeguard.
 */
export function custodyLimits(c: CaseRecord): {
  caseType: CustodyCaseType;
  statutory: number;
  buffered: number;
  statutoryNote?: string;
} {
  const caseType = custodyCaseTypeOf(c);
  if (caseType === "uapa") {
    // UAPA 43-D(2)(b): ceiling is 90 days; extends to 180 ONLY if the PP files the
    // progress report before day 90 and the court grants extension. Until that is
    // recorded, the statutory (default-bail) date stands at 90.
    if (c.uapaExtensionGranted) {
      return {
        caseType,
        statutory: 180,
        buffered: c.uapaCustodyDays ?? 150,
        statutoryNote: "UAPA extension granted → 180-day ceiling.",
      };
    }
    return {
      caseType,
      statutory: 90,
      buffered: 75,
      statutoryNote: "UAPA default 90d — extends to 180 only if PP-report extension is granted before day 90.",
    };
  }
  if (caseType === "scheduled_higher") return { caseType, statutory: 90, buffered: 75 };
  return { caseType, statutory: 60, buffered: 45 };
}

export const CUSTODY_CASE_TYPE_LABEL: Record<CustodyCaseType, string> = {
  uapa: "UAPA (150d target · 90→180 statutory)",
  scheduled_higher: "Scheduled — higher (90d → buffer 75)",
  scheduled_lower: "Scheduled — lower (60d → buffer 45)",
};
