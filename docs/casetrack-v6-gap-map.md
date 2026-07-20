# CaseTrack V6 → CaseClock — end-to-end integration map

> **What this is.** On 2026-07-20 Taposh handed over `CaseTrack html 3.html` — a
> self-contained single-file React app he built **with Claude** as an expression of
> his requirement. It is archived verbatim at
> [`spec/CaseTrack-preview-v6.html`](spec/CaseTrack-preview-v6.html) (open it in any
> browser; it runs fully offline). This document maps everything in it against
> CaseClock's current code and says, feature by feature: **adopt / adapt / skip /
> ask — and why.** No code changes have been made from this analysis yet.

## 1. Provenance — why this file is authoritative requirement signal

- The app titles itself **"CaseTrack — Case & Trial Monitoring System (Preview · V6)"**.
  Our locked spec ([REQUIREMENTS.md](REQUIREMENTS.md)) is **V3** of the *same* document
  lineage ("Case & Trial Monitoring System — Requirement Specification… Version 3").
  This preview is therefore the officer's requirement **three iterations past what
  CaseClock implements**.
- Its hardcoded clock is `TODAY = "2026-06-26"` — the exact date the V3 docx was
  provided. It was produced in the same requirement-drafting effort, then iterated.
- Its seed data is **the same two sample cases** as
  [sample-cases.md](sample-cases.md): Special NIA Case 04/2024 (RDX IED, Fancy Bazar)
  and Case 21/2026 (FICN, Paltan Bazar) — down to FIR numbers, coordinates, and
  accused rosters, but **extended** with new structures (chargesheets, custody
  ledger, CDR/IPDR/IMEI/tower registers, report observations). Those extensions are
  the requirement delta, expressed as data.
- Its header comment is effectively the officer's own V6 changelog:
  *"Overview + sub-pages · in-case & app-wide search · edit-only entries ·
  movement-ledger custody · report observations · 4 comms tables auto-feeding link
  map · Confidential — single-user · offline by design."*

**How to read it:** it is a *requirements artifact, not a codebase to port*. The
implementation is chat-preview-grade (inline React without JSX, `prompt()`/`alert()`
dialogs, a frozen `TODAY`, custody end-dates regex-parsed out of free text, no
tests). We take the **concepts, fields, and rules**; we keep CaseClock's
architecture, crypto, and engine discipline.

## 2. The delta at a glance

Five genuinely **new modules**, several **refinements** of existing ones, a small
set of **rule conflicts** that need the officer's word, and a list of places where
**CaseClock is already ahead** and must not regress.

| # | CaseTrack V6 feature | CaseClock today | Verdict |
|---|---|---|---|
| N1 | Chargesheet register (main + supplementary, court/CC no., accused covered) | single `chargesheetFiledDate` | **Adopt** |
| N2 | Chain-of-custody movement ledger per exhibit (Malkhana⇄FSL⇄Court, seal flag) | — | **Adopt** |
| N3 | Comms registers: CDR / IPDR / IMEI / Tower dump with pendency + expected dates | — | **Adopt** |
| N4 | Interconnectivity map — cross-case identifier matcher (auto-fed from N3) | — | **Adopt** |
| N5 | Report observations (High/Normal-flagged remarks on received reports) | — | **Adopt** |
| N6 | Per-accused arrest dates; FR clock anchored on **earliest arrest** | case-level `arrestDate` | **Adopt** |
| N7 | Per-accused conviction record + 12th status "Convicted" + appeal window | case-level `outcome` + forum-accurate appeal rules | **Adapt** (merge) |
| N8 | Case categories Cat I–V (UI/AFI/PFI/Dormant/Closed) + counts strip + filter | `CaseStatus` (different taxonomy) | **Adapt** (add facet) |
| N9 | Integrity checks panel — NEXT DATE? / CLOCK NOT RUNNING / DORMANT | pieces exist, not surfaced as a panel | **Adopt** |
| N10 | MHA-sanction pipeline stepper (FR-I → DG → IR-to-MHA → MHA sanction, gated) | s.45 rule3/rule4 clocks exist; no IR step, no stepper UI | **Adapt** |
| N11 | Progress-of-investigation as dated+tagged log with routing (H8) | single free-text field + separate supervision timeline | **Adapt** (decide) |
| N12 | Plan of action as dated log (H13) | single free-text field | **Adopt** |
| N13 | In-app month calendar + agenda | .ics export only | **Adopt** |
| N14 | Reference acts refresh: Immigration & Foreigners Act **2025**; BNSS ready-reckoner; Emigration Act dropped | 1946 Foreigners Act + Emigration Act present | **Adopt** |
| N15 | Word-openable `.doc` export of briefing note + full case export | print/PDF only | **Adopt** |
| N16 | Edit-only records (no delete; audit trail) | mixed | **Ask** (policy) |
| N17 | Priority hard cap at 10 ("demote one first") | priority flag, no cap | **Adopt** |
| N18 | Punctuation-tolerant number search (`normNum`, ≥3 chars) | plain text search | **Adopt** |
| N19 | In-case search with jump-to-heading | global search only | **Adopt** |
| N20 | Dashboard: 3 reminder buckets + Superior zone + heat-tile grid | agenda list with track pills | **Adapt** (partial) |
| N21 | PW examined toggle + ▲▼ re-ranking; accused re-ranking (Sl. No.) | witnesses as count only | **Adopt** |
| N22 | Documents register (exhibit-numbered, report-mapped, like MO) | attachments repository (different concept) | **Adapt** |
| — | Vault UX: idle auto-lock, encrypted backup, disk-file link, no-lockout unlock | all built (`useAutoLock`, `backup.ts`, `fs-sink.ts`) | **Built** — copy nudge text only |

## 3. New modules in detail — what to build and why

### N1 · Chargesheet register

**V6 shape:** `chargesheets[] = { type: "Main (CS-1)" | "Supplementary (CS-n)", date,
court/CC no., accused: [names] }` shown as a register at the top of the case file.
`csFiled(c)` (≥1 chargesheet) **closes the FR pipeline** and feeds a
"Chargesheeted" phase filter in the index.

**Why it matters:** UAPA/NIA cases routinely have supplementary chargesheets —
sample case 1 itself carries CS-1 (3 accused) + CS-2 (the absconder). A single
`chargesheetFiledDate` cannot express "probe open qua A-5 after CS-1". Per-accused
coverage is what tells the engine which accused still have a live FR clock.

**CaseClock integration:** new `ChargesheetRecord {id, caseId, kind, date, court,
accusedIds[]}`; keep `chargesheetFiledDate` derived (earliest CS date) for the
existing rules; FR/default-bail rules consult per-accused coverage once N6 lands.

### N2 · Chain-of-custody movement ledger

**V6 shape:** per exhibit, unlimited legs `{exhibitNo, nature, out, back, from, to,
purpose (FSL/Court/…), seal Yes/No}`. Open leg (no `back`) shows a red **OUT**
pill with a "returned" action that asks *"Seal intact on return?"*. Evidence
summary shows "N out of Malkhana". Rows are searchable.

**Why it matters:** chain-of-custody integrity is where trials are lost. The
officer's own seed data flags it — case 2's progress log: *"tamper seal broken at
handover — recorded & flagged; rectify chain"*, and the E-2 passports leg carries
`seal: "No"`. Nothing in CaseClock records exhibit movement today.

**CaseClock integration:** new `CustodyMovementRecord` keyed to `EvidenceRecord`
(or free exhibit no. for exhibits not in the evidence table); rollups: open-legs
count, seal-broken flag → case-file badge + search. No deadline rule needed
initially (the OUT state is itself the alert).

### N3 · Comms registers — CDR / IPDR / IMEI / Tower dump

**V6 shape:** three identifier registers `{ref (letter no. · date), numbers[],
recv count, expected date}` — pendency = numbers − received, **overdue when
pending > 0 past expected** — plus a tower-dump register `{ref, site/BTS, time
window, status, expected}`. A summary strip (requests / numbers / received /
pending) per register. Explicit scope note: **"No raw CDR is ingested; the map
reflects only what is entered."**

**Why it matters:** this is the officer's daily chase list — which service-provider
replies are pending against which letter. It also feeds N4, and its pendency rows
are the third dashboard reminder bucket ("Expert-report pendency · FSL · ballistic
· imaging · CDR/IPDR/IMEI/tower").

**CaseClock integration:** new `CommsRequestRecord {kind: cdr|ipdr|imei, ref,
numbers[], receivedCount, expectedDate}` + `TowerDumpRecord`; engine rule
`comms-pending` (track: investigation-report, due = expectedDate); dashboard
bucket. The privacy posture (identifiers only, never CDR content) matches
CaseClock's local-first stance — keep the scope note verbatim in the UI.

### N4 · Interconnectivity map (cross-case links)

**V6 shape:** a `Links` top-level view. Every identifier from every case's
CDR/IPDR/IMEI registers is normalized (`normNum` — lowercase, strip spaces /
dashes / parens) and matched **across cases**; any identifier appearing in ≥2
cases renders as a hub node linked to its case nodes, with an "in N cases" red
pill and one-tap open of each case. Toggle to show all identifiers.

**Why it matters:** this is the single biggest conceptual addition in V6 — the
moment a shared handset/SIM surfaces across two dockets, that is an
investigative lead. It converts CaseClock from per-case bookkeeping into a small
intelligence tool, at zero extra data-entry cost (auto-fed from N3).

**CaseClock integration:** pure derived computation over vault data (no schema);
a `crossCaseLinks()` domain function + a Links view. List-first; the SVG graph is
garnish and can come later. Works only if N3 lands first.

### N5 · Report observations

**V6 shape:** when a report is marked received, the app prompts for the officer's
observation and a **High/Normal** flag; observations live on the MO row (📝/⭐
indicators), have their own sub-page (High sorted first), and **High observations
are pulled into the briefing note** under "Key report observations".

**Why it matters:** the finding inside an FSL report ("Confirms RDX with high
purity — links to military-grade source. Central to conspiracy charge") is more
valuable than the received-status. Today CaseClock records receipt only; the
analytic layer has nowhere to live.

**CaseClock integration:** `observations[] {date, flag, text}` on
`EvidenceRecord`; receipt flow offers (not forces) an observation; briefing
builder gains the High section.

## 4. Refinements to existing modules

### N6 · Per-accused arrest dates (FR anchor)

V6 stores `arrestDate` per accused; the FR clock anchors on the **earliest**
arrest (`frAnchor`); each in-custody accused row shows its own "FR ⏱ Nd left"
pill; status changes into custody **prompt for the arrest date**; an in-custody
accused without an arrest date is a "CLOCK NOT RUNNING" integrity gap.
CaseClock's single case-level `arrestDate` under-models multi-accused cases
(case 2 has three arrests on different remand tracks). Migration: copy case
`arrestDate` to arrested accused; keep case-level value as the derived anchor.

### N7 · Conviction per accused + appeal window

V6 adds a 12th accused status **"Convicted"** (the locked V3 list has 11) with a
conviction sub-row: sentence text, sentence date, appeal-by date (**default 90d**,
editable) feeding an APPEAL deadline. CaseClock tracks outcome at case level and
already has **forum-accurate** appeal windows (30d magistrate / 60d sessions /
90d HC acquittal-appeal + death variants) — legally better than V6's flat 90d.
**Merge:** per-accused conviction record from V6 + CaseClock's forum-accurate
windows computing the default appeal-by. Needs officer sign-off on the 12th
status (spec change).

### N8 · Case categories Cat I–V

V6 classifies every case as **Cat I — under active investigation · Cat II —
active further investigation · Cat III — passive further investigation
(long-term) · Cat IV — dormant · Cat V — closed**, with a counts strip on
dashboard + index and an index filter. This is a supervision workload facet —
*how much attention does this case get* — orthogonal to CaseClock's procedural
`CaseStatus` (where the case *is* in the CrPC lifecycle). **Add as a separate
field**; do not replace `CaseStatus`. Keep both visible.

### N9 · Integrity checks ("silence is not safety")

A dashboard + case-file panel of three negative-space alerts:

1. **NEXT DATE?** — a hearing date has passed without disposal or a next date;
   inline "enter next date" rollover action (V6's court table keeps the matter,
   writes the new date). CaseClock's `disposed` flag keeps such hearings overdue
   in the agenda, but there is no consolidated prompt-to-roll-over.
2. **CLOCK NOT RUNNING** — anchor gaps: no registration date; accused in
   custody/charge-sheeted without arrest date (needs N6); case in trial/appeal
   with no future hearing entered. CaseClock has one such guard
   (`uapaSectionWithoutFlag`); generalize into an `anchorGaps()` domain function.
3. **DORMANT** — untouched > N days. Already built (`untouched` rule,
   configurable, default 14; V6 uses 30) — just surface it in this panel.

Why: the engine can only warn about dates it has. The officer's phrase names the
failure mode of every reminder system — this panel is what makes missing data
loud.

### N10 · MHA-sanction pipeline stepper

V6 models the UAPA prosecution-sanction chain as a **gated stepper** on the case
file: FR-I submitted → (UAPA) custody-extension filed by day 75 → FR-II → SP
remarks → DG approval → **IR for MHA sanction (≤7d of DG approval)** → **MHA
sanction** — each step a date, later steps disabled until earlier ones are set,
with the footer *"Chargesheet may be filed after MHA sanction."* CaseClock
already has the s.45 working-day clocks (`sanction-rule3`/`rule4`,
`evidenceToAuthorityDate` → recommendation → sanction) and the FR chain rules —
most of this is **relabeling + one new step (IR-to-MHA) + the stepper UI + the
gating message**. Note the two rule conflicts in §6 before wiring.

### N11 · Progress of investigation as a log (H8) — decide the shape

V6's heading 8 is a **dated, tagged log** (tags: General/Sections/Arrest/
Evidence/Court/FSL/Custody/Sanction/Intel) with two routing tricks: a
**Court-tagged entry auto-creates a Court-matter row** (stamped "↳ from Progress
of investigation"), and an entry can optionally append itself to Sections (H3),
Brief (H6), or Trial status (H10) as a dated `[Update …]` suffix. CaseClock has
heading 8 as one free-text field **plus** a separate append-only
`SupervisionEntryRecord` timeline. These are one concept wearing two coats —
**decide before building** (see Q5): either H8 *renders* the supervision
timeline (filtered to io-update/court-note) or the timeline gains tags+routing
and becomes H8. Building V6's log as a third structure would be wrong.

### N12–N15, N17–N22 (smaller)

- **N12 Plan of action as dated log** — same treatment as H8 but simple dated
  entries; no routing.
- **N13 Calendar view** — month grid (events per day, +N more, today
  highlighted) + 50-item agenda + the existing .ics export button in one view.
  All data already exists (`gatherEvents` ≈ engine output + hearings).
- **N14 Reference acts refresh** — add **Immigration and Foreigners Act, 2025**
  (repeals Foreigners Act 1946, Registration of Foreigners 1939, Passport (Entry)
  1920, Carriers' Liability 2000 — with the officer's verify-before-court-use
  note); add the **BNSS custody/report ready-reckoner** card; **drop the
  Emigration Act** (V6 note: *"Emigration of Indian citizens for overseas work is
  a separate subject — not covered here"*). Content-only change but it edits the
  locked §5 list — needs sign-off (Q6).
- **N15 `.doc` export** — the briefing note and a full-case export as
  Word-openable HTML-in-`.doc` (V6's `downloadDoc`). The officer works in Word —
  V6's edit placeholder literally says *"Paste from your Word doc…"*. Cheap and
  high-affinity alongside existing print.
- **N17 Priority cap** — hard cap at 10 with "Priority capped at 10 cases.
  Demote one first." V3 said "~10"; V6 makes it exact.
- **N18 `normNum` search** — punctuation-tolerant matching for numbers ≥3 chars
  (phone/IMEI/FIR formats vary by punctuation).
- **N19 In-case search** — search within the open case with jump-to-heading
  anchors.
- **N20 Dashboard buckets** — V6 groups reminders into exactly three titled
  categories (1 · Court matters / 2 · Investigation follow-up / 3 ·
  Expert-report pendency) under a pinned Superior Court Zone, plus a case-heat
  tile grid (worst-severity color per case, ★ priority section above Monitored).
  CaseClock's agenda has the data; this is presentational regrouping — adopt the
  buckets, treat the tile grid as optional polish.
- **N21 Witness list upgrades** — PW rows: examined Yes/No toggle (examined
  count feeds trial readiness), ▲▼ re-ranking with Sl. No.; same re-ranking on
  accused. CaseClock's evidence rows carry only a witness *count*.
- **N22 Documents register** — V6 mirrors the MO table for documents (D-1…,
  report-required mapping, received status). CaseClock's DocumentsPanel is an
  *attachments* repository (files + metadata). Adapt: an exhibit-style document
  register whose rows can *link* to attachments, rather than a second file store.

## 5. Where CaseClock is already ahead — do not regress

| Area | CaseClock | V6 prototype |
|---|---|---|
| Statutory truth | buffered target **and** true statutory date shown (`custodyLimits`, UAPA 90→180 gated on PP-report extension) | buffered target only |
| Appeal windows | forum-accurate 30/60/90 + death variants | flat 90d default |
| Custody production | explicit `custodyEndDate` field | regex-parses "ends DD Mon YYYY" out of free text |
| Requests tracker | authority, date raised, per-accused links, custom types | type/ref/status/expected only |
| Rules breadth | 30 rules incl. e-FIR-3d, victim-90, doc-supply-14, committal-90, discharge-60, judgment-30, sexual-offence 2-mo clocks, s.479 undertrial | ~12 deadline kinds |
| Crypto & persistence | envelope + atomic `fs-sink` with `.bak`/`.tmp` recovery, tests; auto-lock, backup/restore, FSA disk file all built | PBKDF2/AES-GCM but naive single-write persistence |
| Place of occurrence | embedded OSM map + external links | gradient placeholder |
| Alert hygiene | AlertState dedup, notification wiring, working-day clocks with holidays | none |
| Engine testing | golden tests | none |

Also **not** to copy: `prompt()`/`alert()` interaction patterns, the frozen
`TODAY`, single-file architecture, monthly-PR rule that only ever looks at the
current month, FR-II/SP due dates collapsing onto the same 150-day line.

## 6. Open questions — need Taposh's (officer's) answer before the affected work

> **RESOLVED 2026-07-20** — Dhanjit: *"prefer Taposh's version on the gaps
> wherever possible."* Decisions + the resulting change contract live in
> [REQUIREMENTS-V4-DELTA.md](REQUIREMENTS-V4-DELTA.md) (§1 maps each question to
> its decision; §5 lists the four exceptions where V3/CaseClock stands). The
> questions below are kept for the record.

1. **Expert-report alert window:** locked V3 says RED once pending **> 2 days**
   from forwarding (CaseClock ships this). V6 prototype uses **7 days**. Which is
   the working rule? (Cheap either way; could be a setting.)
2. **DG clock anchor:** V3: DG order hard-flag **7d after SP remarks** (CaseClock
   ships this). V6: DG approval due **7d after FR-I submission**. Which anchor?
3. **12th accused status "Convicted"** (with sentence/appeal sub-record): confirm
   the locked 11-status list grows to 12.
4. **Edit-only policy:** V6 forbids deleting any record entry (edits only; only
   demo data deletable) — *"the record is preserved as an audit trail."* Adopt
   globally in CaseClock? (Today most entities are deletable.)
5. **H8 log vs supervision timeline:** one structure or two? (Recommendation:
   one — the timeline gains tags + routing and renders as heading 8.)
6. **Reference-law list change:** confirm dropping the Emigration Act and adding
   the Immigration & Foreigners Act 2025 + BNSS ready-reckoner (edits locked §5).
7. **Appeal-window default:** keep CaseClock's forum-accurate windows as the
   default for per-accused conviction records (rather than V6's flat 90d), with
   an editable appeal-by date? (Recommended yes.)
8. **Cat I–V semantics:** confirm the categories are a manual supervision facet
   (officer sets them), not derived from `CaseStatus`.

## 7. Proposed build order (after answers)

Dependency-ordered; each tier is independently shippable.

- **Tier 1 — extend existing spines (low risk):** N1 chargesheet register → N6
  per-accused arrests → N7 conviction/appeal (needs Q3/Q7) → N9 integrity panel
  → N17 priority cap → N14 reference refresh (Q6) → N18/N19 search upgrades.
- **Tier 2 — the new intelligence modules:** N3 comms registers → N4
  interconnectivity map (depends on N3) → N2 custody ledger → N5 report
  observations (+ briefing note section) → N10 sanction stepper (Q2).
- **Tier 3 — views & logs:** N13 calendar view → N11/N12 logs (Q5) → N20
  dashboard buckets → N15 .doc export → N21 witness upgrades → N22 documents
  register rethink → N16 edit-only policy (Q4).

**Spec hygiene:** REQUIREMENTS.md is LOCKED V3 — do not rewrite it. Adopted items
become a **V4 delta spec** (`docs/REQUIREMENTS-V4-DELTA.md`) citing
`spec/CaseTrack-preview-v6.html` as source, mirroring how V3 superseded V2.
Update `docs/legal-rules.md` for any rule-change answers (Q1/Q2).

## 8. Per-module source map (for implementers)

Everything below cites the archived file `spec/CaseTrack-preview-v6.html`; the
app module starts at the `__def("app", …)` block (~line 17172 of the original).

| Concern | Where in the V6 file |
|---|---|
| Deadline engine (`computeDeadlines`, `frLimit`, `frAnchor`, FPR/PR/FR/CUSTEXT/DG/IRMHA/MHA/APPEAL/CUSTODY/REPORT/comms kinds) | `/* ENGINES */` section |
| Integrity checks (`anchorGaps`, `lapsedHearings`, `isStale`) | same section |
| Cross-case matcher (`caseIdentifiers`, `crossCaseLinks`, `normNum`) | `/* cross-case matcher */` |
| Search (`searchCase`, `searchAll`, jump anchors) | `/* SEARCH */` |
| Categories (`CATEGORIES`, `CategoryStrip`) | `/* CASE CATEGORIES */` |
| Reference acts incl. 2025 Act text | `REFERENCE_ACTS` |
| Chargesheet register UI | `CaseOverview` ("Chargesheet register") |
| MO/Documents/PW/custody tables (edit-only, re-rank, recd flow) | `MOTable`, `PWTable`, `CustodyTable` |
| Accused roster + conviction row | `AccusedTable`, `ConvictionRow` |
| Court matters lapse/rollover/dispose | `CourtTable` |
| Sanction pipeline stepper | `PanelsOverview` → `PipeStep` grid |
| Comms registers | `NumbersTable`, `CommsPage` |
| Observations page | `ObservationsPage` |
| Progress/plan logs + routing | `ProgressLog`, `PlanLog` |
| Briefing note + .doc export | `buildCaseText`, `downloadDoc`, `BriefingNote` |
| Links view | `LinkMap` |
| Calendar + .ics | `CalendarView`, `buildICS`, `gatherEvents` |
| Vault/lock/backup UX (reference only) | `App`, `CreateScreen`, `UnlockScreen`, `BackupBar` |
