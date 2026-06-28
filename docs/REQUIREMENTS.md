# REQUIREMENTS.md — the authoritative build target (V3, LOCKED)

> Verbatim-faithful transcription of the officer's **"Case & Trial Monitoring System —
> Requirement Specification & Confirmed Build Plan, Version 3 — Final Draft, All
> Specifications Locked"**. This is the **absolute floor**: the product must implement all
> of it. Extras are allowed only when they do not dilute or hide what the officer needs.
>
> Source of record: [`spec/Case-Monitoring-Plan-Record-v3.docx`](spec/Case-Monitoring-Plan-Record-v3.docx)
> (provided 26 Jun 2026). Two dummy cases that exercise every module:
> [`sample-cases.md`](sample-cases.md) ← [`spec/Sample-Case-Files.docx`](spec/Sample-Case-Files.docx).
>
> **Build sequence** (tiered, grounded in the V2→V3 code audit): [`V3-BUILD-PLAN.md`](V3-BUILD-PLAN.md).
> **Supersedes** the Version-2 transcription that previously lived here. The V2 deadline-engine
> core is built and golden-tested; V3 adds the second half (Process & Requests, document
> repository, briefing note, search, mind map) plus the priority model and the expert-report
> 2-day alert. Each section below is tagged **[built] / [partial] / [new]** against the current code.
>
> **⚠ Section numbering changed from V2.** Existing code comments cite the V2 numbers (e.g.
> `REQUIREMENTS §6` in `domain/accused.ts`, `AccusedPanel.tsx`). Mapping: V2 §6 "Accused Status" →
> **V3 §11**; V3 **§6** is now the new "Process & Requests Tracker". V2 §7 "Build phases" is dropped
> here (build order now lives in `V3-BUILD-PLAN.md`). §3 (13 headings), §4.1/§4.2 (engines), and §5
> (panels) keep their numbers, so those code citations remain accurate. Reconcile the §6→§11
> comments when the accused/requests code is next touched.

---

## 1. Purpose & Scope

- A **follow-up and reminder mechanism for every case** — FIR registration through investigation, charge sheet, and trial monitoring.
- **Scale & use:** single-user (the investigator's own consumption); up to **~30 cases** monitored at a time, of which up to **~10 are actively prioritised**.
- **Macro view** — a unified dashboard: all cases, deadlines, court priorities at a glance. **[built]**
- **Micro view** — drill into any single case down to minute detail: every letter, date, accused, custody history, evidence-report status, as and when required. **[partial — per-letter document/order numbers not yet captured]**
- **Input method:** the user feeds the case brief (FIR dates, arrests, evidence, pointers) and updates daily, case-wise.
- **Priority marking:** the user can flag up to **~10 priority cases** at any time (fluid — promote/demote as cases flare up or go quiet). Priority cases **pin to the top** of the dashboard with **fuller detail and all engines firing**; lighter cases still carry **auto-computed deadlines** (e.g. trial dates) and **alert silently**, but need not carry the heavier upkeep (mind-map / gallery / granular registers) until promoted. **[new — `priorityHeinous` is dead code; no pin/cap/tier/silent path]**

## 2. Priority & Reminder Logic

- **Superior Court Zone** (top priority, separately highlighted): SLPs at Supreme Court, Writ Petitions and similar SC & HC matters. Distinct highlight wherever a matter is taken up with SC or HC. **[built — pinned red zone, 15-day lead, SC/HC forum]**
- **Routine court matters** (under Court Matters, with dates): bail objection, remand extension etc. **[built]**
- Standard reminders begin **15 days before** due; **custody production reminder 1 day prior**. **[partial — custody-1-day built + Superior 15-day built; routine trial hearings currently cap at a 10-day lead, not 15]**

## 3. Fixed Case Structure (13 Headings) — **[built]**

Every case carries these headings, in this exact order:

1. Case number
2. Identity of the case (1 line)
3. Sections of law
4. Date of occurrence
5. Date of registration
6. Brief of the case
7. Number of accused
8. Progress of investigation
9. Evidences collected (with report mapping + No. of witnesses column)
10. Status of trial
11. Court matters (with dates)
12. List of accused with status (incl. LOC / Interpol + custody history)
13. Plan of action

## 4. Two Deadline Engines → One Dashboard

Two distinct engines feed the same dashboard, **visually tagged** (investigation vs trial vs court vs SC/HC) so they are told apart at a glance. **[built — track pills on every agenda row]**

### 4.1 Investigation Deadline Engine

- **Progress Reports (PR):** First PR ≤ 15 days of registration; monthly PR from the 1st of each month; **critical by the 7th** (never pending beyond 7 days). Court PR after charge sheet of all accused or closure. **[built]**
- **Final Reports (FR):** by date of arrest (table below). FR-II simultaneous; SP comments ≤ 1 week of FR-II; hierarchy SP→DIG→IG→ALA→LA→ADG/SDG→DG **indicative only**. **Hard flag:** if DG order not passed within **7 days** of SP remarks. **[built — DG-7-day hard flag]**
- **Custody (BNSS):** statutory limit **180 / 90 / 60 days** by arrest + offence type; user feeds **custody end date** → remind **1 day prior**; previous custody recorded. **[built]**
- **Expert-report follow-up:** FSL, ballistic, device imaging, etc. — alert fires **automatically once pending beyond 2 days from the forwarding date**; alert switches **off** the moment the report is marked received. **[new — no forwarding date on EvidenceRecord, no rule, evidence never reaches the engine; blocks the headline RED alert in BOTH sample cases]**

| Case type | Statutory limit | Buffered target |
|---|---|---|
| UAPA cases | 150 days (5 months) from arrest | 150 days (as specified) |
| Scheduled offence (higher) | 90 days from arrest | 75 days from arrest |
| Scheduled offence (lower) | 60 days from arrest | 45 days from arrest |

Both the buffered target and the **true statutory date** are shown as a safeguard. **[built — `custodyLimits()`; UAPA statutory shown as 90→180 governed by the PP-report-before-90 boundary]**

### 4.2 Court Trial Deadline Engine — **[partial]**

Separate module, connected to the dashboard: next hearing date · bail hearing date (if any) · witness examination/deposition dates · charge framing date · final arguments · judgment/order date · any **superior-court (SC/HC) listing** — distinct highlight + 15-day reminder. **[partial — anchors + Superior Zone built; routine trial events surface only as generic hearing rows with a 10-day lead, not individually highlighted milestones with the 15-day lead]**

## 5. Attached Panels (per case)

- **Reference Laws** (preloaded, read-only, source-cited): NIA Act 2008 as amended by NIA (Amendment) Act 2019 + Scheduled Offences; Foreigners Act; Emigration Act. **[built — incl. UAPA bonus, India Code links]**
- **Banned Organisations / Terrorists:** manual entry; **linked system-wide** — any fed name appears **RED** wherever mentioned, incl. the case structure. **[built — global watchlist + `Highlighted`]**
- **Evidence ↔ Report mapping** with **No. of Witnesses** column and **expert-report pending status**. **[partial — mapping + witnesses built; the expert-report pending/overdue status is the §4.1 2-day gap]**
- **Sanctions:** statutory + DG — required / pending / obtained. **[built]**
- **Place of Occurrence** on Google Map. **[built — embedded OSM map + external Google/OSM links]**
- **LOC / Interpol Notices** per accused. **[built as per-accused notes — see §6 for the superset]**

## 6. Process & Requests Tracker — **[new]**

Per-case tracker for formal requests raised during arrest / investigation, **linked to the accused**:

- **Types:** LOC (Look-Out Circular); MLA / Letters Rogatory; Interpol notices (Red / Blue etc.); NBW / proclamation / attachment; plus **custom types**.
- **Each entry:** type, linked accused, reference/letter no., date raised, authority addressed, status (requested / pending / granted / executed / rejected), expected-response date.
- **Alerts:** flag when pending past the expected-response date set per request; optional standard default if none set.

> **[new]** Today only a per-accused `LocNotice {type, ref, status}` exists (no date raised / authority / expected-response). The two sample cases need the full tracker (Case 1: LOC + RCN + sanction; Case 2: LOC×3 + MLA/Letters-Rogatory 45-day + FRRO/MEA 15-day + RCN proposed).

## 7. Connected Document Repository (Local Server) — **[new]**

- User maintains a **case-wise folder** on their own computer acting as the local server.
- **Standard layout (proposed):** parent folder → one sub-folder per case named by case number → an **index file** the app reads for letter numbers / dates / subjects.
- **Real-time ingestion:** the app reads and inculcates details at the point documents are uploaded into the case folder — letter numbers, dates, references — and affixes them under the relevant case headers on the dashboard.
- **Auto-fetch model (what is realistic):** (i) from the **index file** — letter numbers, dates, subjects, direction: dependable; (ii) from a **consistent file-naming convention** (e.g. `date_type_reference.pdf`): parsed automatically; (iii) from **inside PDF/Word text**: possible only on the deployed machine and never fully reliable — always treated as a **draft for the user's confirmation**, never as verified truth. The user enters only what could not be fetched.
- **Go-forward data strategy (legacy backlog):** do **not** back-fill everything. Adopt a **cutoff** — new documents are saved and indexed properly from day one; old files pulled in only if/when a case becomes active or priority. For old cases enter only the 13-heading 'spine' at summary level plus live forward dates (next hearing, pending FR, custody). Index/point to where documents already live rather than importing every scanned page. Seed the **~10 priority cases first**.
- **Deployment note:** live folder fetch runs when the app is executed on the user's machine. In the chat preview the same app runs with **manual entry / attach**; the data model and dashboard behaviour are **identical**. Folder-sync switches on at deployment without a rebuild.

## 8. Briefing Note Generator — **[new]**

- Produces a concise briefing note in the **same 13-heading format**, on demand.
- Not limited to a single physical page: runs to the **minimum number of pages** (more than one as needed) required to fill all 13 headings with their relevant details.
- For quick reference / briefing report.
- **Printable and downloadable** (clean A4 layout, ready for signature / circulation).

## 9. In-App Search Engine — **[new]**

- **Global search** across all cases for easy in-app guidance.
- **Scope:** structured fields — case number, letter/reference number, accused name, section of law, date, banned-org name, court matter.
- **Does not** peer inside document contents (by design).

## 10. Mind Map (per case) — **[new]**

- **Central node:** case number (with identity line).
- **First-level branches** mirror the 13 headings.
- **Colour coding:** accused by status; banned-org / terrorist nodes in **RED**.
- **Images on nodes:** upload accused photos, place of occurrence, evidence/exhibit pictures — shown as thumbnails on their respective nodes.
- **Linked evidence:** an exhibit image ties to its evidence→report entry, showing linked report status and witness count.
- Plus a **per-case image gallery** (all photos tagged accused / PO / evidence) alongside map thumbnails.

## 11. Accused Status — 11 Values — **[built]**

| # | Status | Meaning |
|---|---|---|
| 1 | Police custody | In police custody. |
| 2 | Judicial custody | In judicial custody. |
| 3 | Not arrested | Named but not yet arrested. |
| 4 | Absconding | Evading arrest / whereabouts unknown. |
| 5 | Killed / Dead | Deceased. |
| 6 | Surrendered | Voluntarily surrendered. |
| 7 | Approver | Turned approver / prosecution witness. |
| 8 | Charge-sheeted | Charge sheet filed against accused. |
| 9 | Under investigation | Role still under investigation. |
| 10 | Acquitted | Court tried and found not guilty. |
| 11 | Dropped | Removed / not sent for trial by investigation. |

## 12. Status — **[new: .ics export]**

- All specifications are **finalised**.
- **Pending decision: Google Calendar linking** — recommended **.ics one-way export first**; live sync on server deployment.
- Awaiting the build order.

---

*All names, numbers, coordinates and dates in the sample files are fictitious, created only to populate and demonstrate the system. Statutory references are indicative and to be verified against the preloaded, user-checked law panel.*
