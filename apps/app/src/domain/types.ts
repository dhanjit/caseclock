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
  reportKind?: "expert" | "other"; // only "expert" reports drive the pendency alert
  forwardedDate?: ISODate | null; // date the exhibit/sample was sent to the lab
  receivedDate?: ISODate | null; // optional — set when the report comes back
  exhibitNo?: string; // M-1 / D-1 style exhibit number (links the custody ledger)
  observations?: EvidenceObservation[]; // V4-DELTA N5 — officer remarks, High/Normal
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

/** The officer's accused statuses (REQUIREMENTS §11 + V4-DELTA Q3: 12th value
 * "convicted", from the V6/V7 previews), each with a distinct colour. */
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
  | "convicted"
  | "dropped";

/** Officer supervision categories (V4-DELTA Q8 / V6 preview) — a manual facet of
 * how much attention a case gets, orthogonal to the procedural CaseStatus. */
export type CaseCategory = "I" | "II" | "III" | "IV" | "V";

export const CASE_CATEGORY_META: Record<CaseCategory, { short: string; label: string }> = {
  I: { short: "Cat I · UI", label: "Cat I — Under active investigation" },
  II: { short: "Cat II · AFI", label: "Cat II — Active further investigation" },
  III: { short: "Cat III · PFI", label: "Cat III — Passive further investigation (long-term)" },
  IV: { short: "Cat IV · Dormant", label: "Cat IV — Dormant" },
  V: { short: "Cat V · Closed", label: "Cat V — Closed" },
};

export const CASE_CATEGORIES: CaseCategory[] = ["I", "II", "III", "IV", "V"];

/** Chargesheet register (V4-DELTA N1 / V6 preview) — main + supplementaries, each
 * covering a subset of the accused. The case-level `chargesheetFiledDate` is
 * DERIVED from this register (earliest date) once any row exists. */
export interface ChargesheetRecord {
  id: string;
  caseId: string;
  kind: "main" | "supplementary";
  date: ISODate;
  court?: string; // court / CC no.
  accusedIds: string[]; // PersonRecord ids covered by this chargesheet
  note?: string;
}

/** Sanctions as an open list (V4-DELTA §3, replacing the two fixed fields) —
 * e.g. "Statutory (UAPA s.45)", "DG sanction", cycled Pending → Required → Obtained. */
export interface SanctionItem {
  id: string;
  kind: string;
  state: "pending" | "required" | "obtained";
  date?: ISODate | null; // set when obtained
}

/** App-level CIO master list (V7-6) — Case Investigating Officers, referenced by
 * every case's H5.1 dropdown. Reference data: deletable, unlike case records. */
export interface CioRecord {
  id: string;
  name: string;
  rank?: string;
}

/** Comms registers (V4-DELTA N3 / V6): CDR / IPDR / IMEI request rows. Identifiers
 * only — no raw CDR content is ever ingested. Pending = numbers − received; the
 * row overdue-alerts past `expectedDate` while anything is pending. These rows
 * auto-feed the cross-case Links map (N4). */
export interface CommsRequestRecord {
  id: string;
  caseId: string;
  kind: "cdr" | "ipdr" | "imei";
  ref: string; // letter no. · date
  numbers: string[]; // identifiers requested (phone numbers / IMEIs)
  receivedCount: number;
  expectedDate?: ISODate | null;
}

export const COMMS_KIND_LABEL: Record<CommsRequestRecord["kind"], string> = {
  cdr: "CDR — call detail records",
  ipdr: "IPDR — internet/session records",
  imei: "IMEI — device identifiers",
};

/** Tower dump register (V4-DELTA N3): site / time-window based, no identifiers. */
export interface TowerDumpRecord {
  id: string;
  caseId: string;
  ref: string;
  site?: string; // BTS / cluster
  timeWindow?: string;
  status: "pending" | "received";
  expectedDate?: ISODate | null;
}

/** Chain-of-custody movement ledger (V4-DELTA N2 / V6): one row per leg —
 * Malkhana → FSL → Malkhana → Court… An open leg (no backDate) means the exhibit
 * is OUT; a seal broken on return is flagged RED and never un-rung. */
export interface CustodyMovementRecord {
  id: string;
  caseId: string;
  exhibitNo: string; // free text; optionally linked to an evidence row
  evidenceId?: string | null;
  nature?: string;
  outDate: ISODate;
  backDate?: ISODate | null;
  from: string; // default "Malkhana" — a waypoint, not an owner
  to: string;
  purpose?: string; // FSL / Court exhibit / …
  sealIntact: boolean;
}

/** Exhibits currently out of the Malkhana (open legs). */
export function openExhibits(movements: CustodyMovementRecord[]): CustodyMovementRecord[] {
  return movements.filter((m) => !m.backDate);
}

/** The officer's remark on a received expert/FSL report (V4-DELTA N5). High-flagged
 * observations rise to the top and enter the briefing note. */
export interface EvidenceObservation {
  id: string;
  date: ISODate;
  flag: "high" | "normal";
  text: string;
}

/** Heading-8 progress log (T3 / V6): dated + tagged entries, edit-only. A
 * Court-tagged entry auto-creates a court-matter row; an entry can optionally
 * route a dated append onto Sections (H3) / Brief (H6) / Trial status (H10). */
export const PROGRESS_TAGS = [
  "General",
  "Sections",
  "Arrest",
  "Evidence",
  "Court",
  "FSL",
  "Custody",
  "Sanction",
  "Intel",
] as const;
export type ProgressTag = (typeof PROGRESS_TAGS)[number];

export interface ProgressEntry {
  id: string;
  date: ISODate;
  tag: ProgressTag;
  note: string;
}

/** Heading-13 plan-of-action log (T3 / V6): dated action points, edit-only. */
export interface PlanEntry {
  id: string;
  date: ISODate;
  note: string;
}

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
  // V7 docket-of-record sub-headings (V4-DELTA §1.1)
  originalFir?: string; // H1.1 — parent FIR for re-registered/transferred dockets
  cioId?: string | null; // H5.1 — Case Investigating Officer (CioRecord id)
  complainant?: string; // H5.2 — name & address of complainant
  trialCourtName?: string; // H5.3 — name of the trial court
  brief?: string; // §3.6 Brief of the case
  trialStatus?: string; // §3.10 Status of trial
  // §3.8 Progress of investigation + §3.13 Plan of action live as DATED LOGS on
  // the aggregate (progressLog / planLog) — not free-text fields.

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
  // FR review chain → MHA-sanction pipeline (V4-DELTA §2/§3, per the V6 preview):
  // FR-I submitted (internal, up the chain — distinct from the court chargesheet)
  // → DG approval (≤7d of FR-I, hard) → IR for MHA (≤7d of DG, hard) → MHA sanction.
  frISubmittedDate?: ISODate | null;
  frIIFiledDate?: ISODate | null;
  spRemarksDate?: ISODate | null; // UAPA-only step (due on the 150-day line)
  custodyExtFiledDate?: ISODate | null; // UAPA custody-extension 90→180 filed (day-75 reminder)
  dgApprovedDate?: ISODate | null;
  irForMhaDate?: ISODate | null;
  mhaSanctionDate?: ISODate | null;
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

  // Sanctions (§5) — open list per V4-DELTA §3.
  sanctions?: SanctionItem[];
  sanctionNote?: string;
  place?: PlaceOfOccurrence;

  // Supervision
  status: CaseStatus;
  category?: CaseCategory; // officer-set Cat I–V facet (default "I")
  demo?: boolean; // sample/demo case — the only kind that may be deleted (V7-9)
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
  accusedStatus?: AccusedStatus; // §11 — the officer's 12-value status (for role=accused)
  firstTimeOffender?: boolean;
  otherPendingCases?: boolean; // s.479 / s.480 disqualifier
  custodyStatus?: "in_custody" | "released";
  securedSummonedStatus?: "secured" | "summoned" | "pending";
  loc?: LocNotice[]; // §5 — LOC / Interpol notices
  custodyHistory?: CustodyHistoryEntry[]; // §4.1 — previous custody
  // T3 / V6 PW table (role === "witness"): what this witness proves + examination state.
  relevance?: string;
  examined?: boolean;
  // Per-accused clocks (V4-DELTA N6/N7 + V7-8) — the FR anchor is the EARLIEST
  // accused arrest; each in-custody accused carries its own custody-end reminder.
  arrestDate?: ISODate | null; // starts FR & custody clocks for this accused
  custodyEndDate?: ISODate | null; // current spell ends → produce/extend, 1-day-prior reminder
  bailPending?: boolean; // live bail matter for this accused …
  bailDate?: ISODate | null; // … heard on this date (drives the BAIL deadline)
  othersNote?: string; // LOC / MLA / Interpol free text (heading 12 "Others")
  // Conviction sub-record (Q3/Q7): forum-accurate default appeal window, editable.
  sentence?: string;
  sentenceDate?: ISODate | null;
  appealBy?: ISODate | null;
}

/**
 * Accused who are ARRESTED but not yet covered by any chargesheet (review fix:
 * a partial chargesheet must NOT close the FR/default-bail clock case-wide).
 * Coverage semantics: a chargesheet listing specific accusedIds covers those;
 * a chargesheet with an EMPTY accusedIds list is case-wide (legacy/V6 `csFiled`
 * semantics — old vaults migrate their single filing date to such a row).
 */
export function uncoveredArrestedAccused(
  persons: PersonRecord[],
  chargesheets: ChargesheetRecord[],
): PersonRecord[] {
  const arrested = persons.filter((p) => p.role === "accused" && p.arrestDate);
  if (chargesheets.some((cs) => cs.accusedIds.length === 0)) return [];
  const covered = new Set(chargesheets.flatMap((cs) => cs.accusedIds));
  return arrested.filter((p) => !covered.has(p.id));
}

/** Earliest per-accused arrest (fallback: case-level arrestDate) — the officer's
 * FR-clock anchor (V4-DELTA §2). */
export function earliestArrest(c: CaseRecord, persons: PersonRecord[]): ISODate | null {
  const dates = persons
    .filter((p) => p.role === "accused" && p.arrestDate)
    .map((p) => p.arrestDate as ISODate)
    .sort();
  return dates[0] ?? c.arrestDate ?? null;
}

/** H7 status-count table (V7-7): the standard supervisor breakdown, computed. */
export function accusedStatusCounts(persons: PersonRecord[]): { label: string; count: number }[] {
  const accused = persons.filter((p) => p.role === "accused");
  const n = (pred: (p: PersonRecord) => boolean) => accused.filter(pred).length;
  const is = (...s: AccusedStatus[]) => (p: PersonRecord) => s.includes(p.accusedStatus as AccusedStatus);
  return [
    { label: "Total", count: accused.length },
    { label: "Arrested (PC + JC)", count: n(is("police_custody", "judicial_custody")) },
    { label: "Absconder", count: n(is("absconding")) },
    { label: "Killed", count: n(is("killed")) },
    { label: "Charge-sheeted", count: n(is("charge_sheeted")) },
    { label: "Under investigation", count: n(is("under_investigation")) },
    { label: "Convicted", count: n(is("convicted")) },
    { label: "Acquitted", count: n(is("acquitted")) },
    { label: "Approver", count: n(is("approver")) },
    { label: "Dropped", count: n(is("dropped")) },
  ];
}

/**
 * Default appeal-by date for a convicted accused (V4-DELTA §5.2): forum-accurate
 * window from the sentence date — 30d magistrate→Sessions, 60d sessions→HC (30d
 * if death sentence) — falling back to 90d marked "verify" when the forum is unknown.
 */
export function defaultAppealWindowDays(c: CaseRecord): { days: number; verified: boolean } {
  if (c.trialCourtLevel === "magistrate") return { days: 30, verified: true };
  if (c.trialCourtLevel === "sessions") return { days: c.deathSentence ? 30 : 60, verified: true };
  return { days: 90, verified: false };
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
  // V4-DELTA §2: the officer's dormancy threshold is 30 days (V6 STALE_DAYS).
  untouchedDays: 30,
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
