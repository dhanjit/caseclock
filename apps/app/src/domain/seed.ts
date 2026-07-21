/**
 * Demo seed data — the two acceptance fixtures from docs/sample-cases.md, encoded
 * field-for-field so every Tier-1 module is demonstrable end-to-end (REQUIREMENTS V3 /
 * V3-BUILD-PLAN §1.5). Pure data only; the loader (state/seed.ts) persists them.
 *
 * Reference date in the fixtures is 26 Jun 2026 — the forwarding / expected-response
 * dates below are chosen so the named RED alerts fire around that date:
 *   · Case 1 device-imaging report (forwarded 2024) → expert-report 2-day OVERDUE
 *   · Case 2 passport-forgery report (forwarded 10 Jun 2026) → expert-report 2-day OVERDUE
 *   · Case 2 FRRO/MEA verification (expected 20 Jun 2026) → process-request OVERDUE
 *   · Case 2 A-1 custody ends 27 Jun 2026 → production reminder 1 day prior
 *
 * Both cases are flagged priority per the prompt + V3-BUILD-PLAN Tier-1 acceptance
 * ("priority pinning for both"); the non-priority silent path is covered by agenda.test.ts.
 * All names, numbers, coordinates and dates are fictitious (see sample-cases.md).
 */

import { monthsBetween } from "@/rules/dates";
import type { CaseAggregate } from "./repository";
import type { CaseRecord, ChargesheetRecord, CioRecord, PersonRecord, ProcessRequestRecord } from "./types";

/** Banned-org names to seed onto the global watchlist (auto-RED system-wide, §5). */
export const SAMPLE_WATCHLIST = ["ULFA-I"];

/** CIO master-list seed (V7-6) — fixed ids so the sample cases can reference them. */
export const SAMPLE_CIO: CioRecord[] = [
  { id: "cio-seed-1", name: "Insp. R. Kalita", rank: "Inspector" },
  { id: "cio-seed-2", name: "SI D. Rao", rank: "Sub-Inspector" },
];

// ============================ CASE 1 ============================
// Chargesheeted, trial ongoing, SLP at Supreme Court (bail). UAPA / arms / RDX.
const C1 = "case-sample-1";
const c1Persons: PersonRecord[] = [
  {
    id: "c1-a1", caseId: C1, role: "accused", name: "Jahnabi Boro", accusedStatus: "judicial_custody",
    arrestDate: "2024-03-09",
    custodyHistory: [
      { id: "c1-a1-h1", kind: "police", from: "2024-03-09", to: "2024-03-16" },
      { id: "c1-a1-h2", kind: "judicial", from: "2024-03-17", to: null },
    ],
  },
  {
    id: "c1-a2", caseId: C1, role: "accused", name: "Hiren Das", accusedStatus: "judicial_custody",
    arrestDate: "2024-03-09",
    // Live bail matter (heading 12): SLP (Crl) bail pending before the SC — drives
    // the per-accused BAIL row (V4-DELTA N6) alongside the superior-court listing.
    bailPending: true, bailDate: "2026-07-09", othersNote: "SLP (Crl) bail pending @ Supreme Court",
    custodyHistory: [
      { id: "c1-a2-h1", kind: "police", from: "2024-03-09", to: "2024-03-15" },
      { id: "c1-a2-h2", kind: "judicial", from: "2024-03-16", to: null },
    ],
  },
  {
    id: "c1-a3", caseId: C1, role: "accused", name: "Montu Rabha", accusedStatus: "charge_sheeted",
    arrestDate: "2024-03-11",
    custodyHistory: [{ id: "c1-a3-h1", kind: "judicial", from: "2024-03-11", to: null }],
  },
  {
    id: "c1-a4", caseId: C1, role: "accused", name: "Sanjib (absconder)", accusedStatus: "absconding",
    othersNote: "LOC issued; Interpol RCN requested",
  },
  { id: "c1-a5", caseId: C1, role: "accused", name: "Pranab Kalita", accusedStatus: "under_investigation" },
];

/** Chargesheet register (V4-DELTA N1): main CS-1 (3 accused) + supplementary CS-2
 * (the absconder) — mirrors the V6 preview seed. */
const c1Chargesheets: ChargesheetRecord[] = [
  { id: "c1-cs1", caseId: C1, kind: "main", date: "2024-09-04", court: "NIA Spl. Court, CC 09/2024", accusedIds: ["c1-a1", "c1-a2", "c1-a3"] },
  { id: "c1-cs2", caseId: C1, kind: "supplementary", date: "2025-02-20", court: "NIA Spl. Court, CC 09/2024", accusedIds: ["c1-a4"] },
];

const c1Requests: ProcessRequestRecord[] = [
  {
    id: "c1-r1", caseId: C1, type: "LOC", accusedIds: ["c1-a4"], refNo: "LOC-2210/24",
    dateRaised: "2025-01-18", authority: "Bureau of Immigration / FRRO", status: "executed",
    note: "Standing LOC for the proclaimed absconder.",
  },
  {
    id: "c1-r2", caseId: C1, type: "interpol_red", accusedIds: ["c1-a4"], refNo: "NCB-Req/77",
    dateRaised: "2025-01-22", authority: "Interpol — NCB New Delhi", status: "pending",
    expectedResponseDate: "2025-03-22", note: "Red Corner Notice request — follow-up due.",
  },
  {
    id: "c1-r3", caseId: C1, type: "custom", customLabel: "Sanction (UAPA prosecution)",
    accusedIds: ["c1-a1", "c1-a2", "c1-a3", "c1-a4"], refNo: "SANC-09/24", dateRaised: "2024-08-28",
    authority: "Competent Authority (MHA)", status: "granted", note: "UAPA s.45 sanction — obtained 28 Aug 2024.",
  },
];

const c1Case: CaseRecord = {
  id: C1,
  firNumber: "NIA 04/2024 · FIR 112/2024",
  firDate: "2024-03-09",
  policeStation: "PS Latasil, Guwahati",
  district: "Kamrup (M)",
  // V7 docket-of-record fields (H1.1 / H5.1–5.3)
  originalFir: "FIR 112/2024, PS Latasil, Guwahati (re-registered as Special NIA Case 04/2024)",
  cioId: "cio-seed-1",
  complainant: "State — Insp. R. Kalita, PS Latasil (suo motu, on recovery)",
  trialCourtName: "NIA Special Court, Guwahati · CC 09/2024",
  category: "II", // Cat II — active further investigation (supplementary probe qua A-5)
  demo: true,
  identity: "Recovery of RDX-laden IED & seizure of arms from a proscribed-outfit module at Fancy Bazar.",
  sectionsOfLaw: "UA(P)A 1967 ss.16,18,20,38,39; Explosive Substances Act 1908 ss.3,4,5; BNS 2023 ss.113,61(2); Arms Act ss.25,27.",
  occurrenceDate: "2024-03-08",
  brief:
    "On a specific input, a joint team intercepted a vehicle near Fancy Bazar and recovered an assembled IED (~2.5 kg RDX), two pistols and ammunition. Three persons were arrested at the spot; interrogation revealed linkage to a proscribed organisation [ULFA-I] and a wider conspiracy to target a public gathering. Chargesheet filed against 4 accused; one absconder declared PO; investigation kept open qua one accused.",
  investigationProgress:
    "Scene of crime examined; IED defused by BDDS; exhibits seized under seizure memo dated 08 Mar 2024. Samples forwarded to FSL (explosives) and CFSL; arms forwarded to ballistic expert. UAPA sanction obtained; chargesheet filed 04 Sep 2024. Supplementary investigation continuing qua A-5; LOC and Interpol RCN sought for absconder A-4.",
  trialStatus: "Charges framed 12 Dec 2024 before NIA Special Court; prosecution evidence stage — 6 of 18 PWs examined.",
  planOfAction:
    "File counter-affidavit in SLP (bail) before SC; pursue pending device-imaging report (overdue) — reminder to CFSL; execute LOC/RCN follow-up for absconder A-4; complete supplementary investigation qua A-5.",
  punishmentBand: "10plus",
  uapaFlag: true,
  sexualOffenceInScope: false,
  eFirFlag: false,
  arrestDate: "2024-03-09",
  firstRemandDate: "2024-03-09",
  custodyStatus: "in_custody",
  chargesheetFiledDate: "2024-09-04", // derived from the register on hydration
  // FR → MHA pipeline (V4-DELTA §2) — fully traversed before the chargesheet;
  // MHA sanction 28 Aug 2024 matches the sanction request in the tracker.
  frISubmittedDate: "2024-08-10",
  dgApprovedDate: "2024-08-16",
  irForMhaDate: "2024-08-20",
  mhaSanctionDate: "2024-08-28",
  spRemarksDate: "2024-08-12",
  firstPrFiledDate: "2024-03-20",
  // Every Court-PR month back-filled except the current one → Jun-2026 Court PR shows overdue.
  prFiledMonths: monthsBetween("2024-03", "2026-05"),
  sanctionStatutory: "obtained",
  sanctionDg: "na",
  sanctionNote: "Statutory (UAPA s.45) obtained 28 Aug 2024; DG sanction not required for this case.",
  place: { label: "Fancy Bazar, Guwahati", lat: 26.1869, lng: 91.7407 },
  status: "trial",
  lastTouchedAt: "2026-06-26",
  outcome: "pending",
  priority: true,
};

const case1: CaseAggregate = {
  case: c1Case,
  persons: c1Persons,
  hearings: [
    { id: "c1-h1", caseId: C1, hearingDate: "2026-07-04", purpose: "trial", court: "NIA Special Court", tier: "routine" },
    { id: "c1-h2", caseId: C1, hearingDate: "2026-07-09", purpose: "slp", court: "Supreme Court of India", tier: "superior", forum: "SC" },
    { id: "c1-h3", caseId: C1, hearingDate: "2024-12-14", purpose: "framing", court: "NIA Special Court", disposed: true },
    { id: "c1-h4", caseId: C1, hearingDate: "2026-02-20", purpose: "bail", court: "Gauhati High Court", tier: "superior", forum: "HC", disposed: true },
  ],
  supervisionEntries: [
    {
      id: "c1-e1", caseId: C1, createdAt: "2026-06-26T09:00:00.000Z", entryType: "supervisory-note",
      lastActionText: "Reviewed CD; 6 of 18 PWs examined",
      noteText: "Device-imaging report from CFSL still awaited — overdue. Counter to SLP (bail) to be filed before SC.",
      nextActionText: "Chase CFSL report + file SLP counter", nextActionOwes: "FSL", nextReviewDate: "2026-07-03",
    },
  ],
  tasks: [],
  evidence: [
    { id: "c1-ev1", caseId: C1, description: "RDX sample (M-1)", reportToObtain: "FSL Explosives report", status: "received", reportKind: "expert", forwardedDate: "2024-03-10", receivedDate: "2024-04-02", witnesses: 2 },
    { id: "c1-ev2", caseId: C1, description: "Two pistols + 9 rounds", reportToObtain: "Ballistic report", status: "received", reportKind: "expert", forwardedDate: "2024-03-12", receivedDate: "2024-04-19", witnesses: 2 },
    { id: "c1-ev3", caseId: C1, description: "Seized mobile phones (×3)", reportToObtain: "Device imaging / CFSL cyber report", status: "pending", reportKind: "expert", forwardedDate: "2024-03-15", witnesses: 1 },
    { id: "c1-ev4", caseId: C1, description: "Vehicle (offending)", reportToObtain: "MVI mechanical report", status: "received", reportKind: "other", forwardedDate: "2024-03-10", receivedDate: "2024-03-15", witnesses: 1 },
    { id: "c1-ev5", caseId: C1, description: "Seizure witnesses", reportToObtain: "Independent panch evidence (statements u/s 180 BNSS)", status: "received", reportKind: "other", witnesses: 4 },
  ],
  processRequests: c1Requests,
  chargesheets: c1Chargesheets,
};

// ============================ CASE 2 ============================
// PRIORITY running case — 3 remanded foreign nationals, active FICN investigation.
const C2 = "case-sample-2";
const c2Persons: PersonRecord[] = [
  {
    id: "c2-a1", caseId: C2, role: "accused", name: "A-1 (foreign national)", accusedStatus: "police_custody",
    custodyStatus: "in_custody", arrestDate: "2026-06-04",
    // Per-accused custody end (V4-DELTA §2) — drives the 1-day-prior production reminder.
    custodyEndDate: "2026-06-27", othersNote: "LOC issued (entry trace)",
    custodyHistory: [{ id: "c2-a1-h1", kind: "police", from: "2026-06-04", to: "2026-06-27" }],
  },
  {
    id: "c2-a2", caseId: C2, role: "accused", name: "A-2 (foreign national)", accusedStatus: "judicial_custody",
    custodyStatus: "in_custody", arrestDate: "2026-06-04", othersNote: "LOC issued; bail opposed",
    custodyHistory: [
      { id: "c2-a2-h1", kind: "police", from: "2026-06-04", to: "2026-06-10" },
      { id: "c2-a2-h2", kind: "judicial", from: "2026-06-11", to: null },
    ],
  },
  {
    id: "c2-a3", caseId: C2, role: "accused", name: "A-3 (foreign national)", accusedStatus: "judicial_custody",
    custodyStatus: "in_custody", arrestDate: "2026-06-04", othersNote: "LOC issued; RCN under consideration",
    custodyHistory: [
      { id: "c2-a3-h1", kind: "police", from: "2026-06-04", to: "2026-06-09" },
      { id: "c2-a3-h2", kind: "judicial", from: "2026-06-10", to: null },
    ],
  },
];

const c2Requests: ProcessRequestRecord[] = [
  {
    id: "c2-r1", caseId: C2, type: "LOC", accusedIds: ["c2-a1", "c2-a2", "c2-a3"], refNo: "LOC-0613/26",
    dateRaised: "2026-06-04", authority: "Bureau of Immigration", status: "executed",
    note: "Entry-trace LOC for all three foreign nationals.",
  },
  {
    id: "c2-r2", caseId: C2, type: "MLA_LR", accusedIds: [], refNo: "Draft (target dispatch 30 Jun 2026)",
    dateRaised: "2026-06-30", authority: "MHA / originating country", status: "pending",
    expectedResponseDate: "2026-08-14", note: "45 days from dispatch — clock starts on dispatch (target 30 Jun).",
  },
  {
    id: "c2-r3", caseId: C2, type: "custom", customLabel: "FRRO / MEA foreigner verification",
    accusedIds: ["c2-a1", "c2-a2", "c2-a3"], refNo: "REF-FR/12", dateRaised: "2026-06-05",
    authority: "FRRO / MEA", status: "pending", expectedResponseDate: "2026-06-20",
    note: "15-day expected response — awaited (overdue from 20 Jun).",
  },
  {
    id: "c2-r4", caseId: C2, type: "interpol_red", accusedIds: ["c2-a3"], status: "requested",
    note: "Red Corner Notice under consideration for A-3.",
  },
];

const c2Case: CaseRecord = {
  id: C2,
  firNumber: "Case 21/2026 · FIR 058/2026",
  firDate: "2026-06-02",
  policeStation: "PS Paltan Bazar, Guwahati",
  district: "Kamrup (M)",
  // V7 docket-of-record fields (H1.1 / H5.1–5.3)
  originalFir: "FIR 058/2026, PS Paltan Bazar, Guwahati",
  cioId: "cio-seed-2",
  complainant: "State — SI D. Rao, PS Paltan Bazar (on source information)",
  trialCourtName: "CJM Court, Kamrup (M)",
  category: "I", // Cat I — under active investigation
  demo: true,
  identity: "Recovery of fake Indian currency & detention of three foreign nationals in a cross-border FICN racket.",
  sectionsOfLaw: "BNS 2023 ss.178,179,180,61(2); Foreigners Act 1946 ss.14,14A,14B; Passport Act 1967 s.12; UA(P)A s.15(1)(a)(iiia) (high-quality FICN).",
  occurrenceDate: "2026-06-02",
  brief:
    "Acting on intelligence, a team apprehended three individuals at a hotel in Paltan Bazar and recovered high-quality FICN of face value ₹8.6 lakh, two foreign passports and a courier consignment note. Preliminary inquiry indicates the trio are foreign nationals who entered on lapsed visas and are linked to a trans-border counterfeit network. All three were arrested and remanded; investigation is at an early, time-critical stage with multiple statutory clocks running.",
  investigationProgress:
    "FICN seized & counted before magistrate; sample notes forwarded to FSL/RBI note-examination. Foreigner status verification with FRRO; reference to MEA initiated; passports sent for forgery examination. First PR filed within 15 days; monthly PR cycle running. MLA request being prepared; device imaging of two phones forwarded.",
  trialStatus: "Pre-chargesheet — investigation stage; no charges framed. Custody & FR clocks are the governing deadlines.",
  planOfAction:
    "Ensure timely production of A-1 on 27 Jun (custody ends) — reminder fires 26 Jun; oppose A-2 bail on 02 Jul; chase overdue passport forgery report; complete FRRO/MEA verification; finalise & dispatch MLA request; work to buffered FR-I target.",
  punishmentBand: "10plus",
  // Decision #6: UAPA s.15 (FICN) is charged → uapaFlag set so custody lands on the
  // UAPA 150/90 track, not the scheduled 60/45 default.
  uapaFlag: true,
  sexualOffenceInScope: false,
  eFirFlag: false,
  arrestDate: "2026-06-04",
  firstRemandDate: "2026-06-04",
  custodyStatus: "in_custody",
  // custody end lives on the accused row (c2-a1) per V4-DELTA §2 — no case-level dup
  firstPrFiledDate: "2026-06-15",
  prFiledMonths: ["2026-06"],
  sanctionStatutory: "pending",
  sanctionDg: "pending",
  sanctionNote: "Statutory (UAPA s.45, if FICN s.15 retained) required & pending; DG sanction required & pending.",
  place: { label: "Paltan Bazar, Guwahati", lat: 26.1833, lng: 91.7538 },
  status: "custody",
  lastTouchedAt: "2026-06-26",
  outcome: "pending",
  priority: true,
};

const case2: CaseAggregate = {
  case: c2Case,
  persons: c2Persons,
  hearings: [
    { id: "c2-h1", caseId: C2, hearingDate: "2026-06-30", purpose: "remand", court: "CJM Court, Kamrup(M)" },
    { id: "c2-h2", caseId: C2, hearingDate: "2026-07-02", purpose: "bail", court: "CJM Court" },
    { id: "c2-h3", caseId: C2, hearingDate: "2026-06-27", purpose: "remand", court: "CJM Court — production / custody end (A-1)" },
  ],
  supervisionEntries: [
    {
      id: "c2-e1", caseId: C2, createdAt: "2026-06-26T09:00:00.000Z", entryType: "supervisory-note",
      lastActionText: "3 remanded; FICN counted before magistrate",
      noteText: "A-1 custody ends 27 Jun — ensure production. Passport forgery report overdue. FRRO/MEA verification awaited.",
      nextActionText: "Produce A-1; chase forgery + FRRO/MEA", nextActionOwes: "IO", nextReviewDate: "2026-06-29",
    },
  ],
  tasks: [],
  evidence: [
    { id: "c2-ev1", caseId: C2, description: "FICN notes (₹8.6 L)", reportToObtain: "FSL / RBI note-examination report", status: "pending", reportKind: "expert", forwardedDate: "2026-06-26", witnesses: 3 },
    { id: "c2-ev2", caseId: C2, description: "Two foreign passports", reportToObtain: "Forgery / questioned-document report", status: "pending", reportKind: "expert", forwardedDate: "2026-06-10", witnesses: 2 },
    { id: "c2-ev3", caseId: C2, description: "Two mobile phones", reportToObtain: "Device imaging report", status: "pending", reportKind: "expert", forwardedDate: "2026-06-26", witnesses: 1 },
    { id: "c2-ev4", caseId: C2, description: "Courier consignment note", reportToObtain: "Handwriting comparison", status: "pending", reportKind: "expert", forwardedDate: "2026-06-18", witnesses: 1 },
  ],
  processRequests: c2Requests,
};

/** The two acceptance fixtures, ready to persist as demo data. */
export function sampleAggregates(): CaseAggregate[] {
  return [case1, case2];
}
