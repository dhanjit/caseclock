# REQUIREMENTS-V4-DELTA.md — adoptions from the officer's V6 preview

> **Status: decisions recorded, implementation pending.** On 2026-07-20 Dhanjit
> resolved the open questions in [casetrack-v6-gap-map.md](casetrack-v6-gap-map.md)
> with one directive: **"prefer Taposh's version on the gaps wherever possible."**
> This document is the resulting change contract. [REQUIREMENTS.md](REQUIREMENTS.md)
> (V3) stays LOCKED and untouched; where this delta contradicts V3, **this delta
> wins**. Source of record for every item:
> [`spec/CaseTrack-preview-v6.html`](spec/CaseTrack-preview-v6.html).
>
> Four narrow exceptions (§5) keep the CaseClock behaviour because the V6
> alternative would regress statutory correctness or the officer's own locked
> words — "wherever possible" read as "unless objectively unsafe".

## 1. Resolved questions (was gap-map §6)

| # | Question | Decision |
|---|---|---|
| Q1 | Expert-report alert: 2d (V3) vs 7d (V6) after forwarding | **7 days** (V6) |
| Q2 | DG clock anchor: SP remarks (V3) vs FR-I submission (V6) | **FR-I submission + 7d** (V6); SP-remarks becomes a UAPA-only step due on the 150-day line |
| Q3 | 12th accused status "Convicted" | **Adopt** — status list grows to 12, with per-accused conviction sub-record |
| Q4 | Edit-only records (no delete) | **Adopt globally** — entries are edited or disposed, never deleted; only demo/seed cases deletable |
| Q5 | H8 progress log vs supervision timeline | **Adopt V6's log as heading 8**: dated + tagged entries with routing. The internal supervision timeline stays for the review feature (CaseClock extra, no conflict); do not build a third structure |
| Q6 | Reference-law list | **Adopt V6 list**: add Immigration & Foreigners Act 2025 + BNSS ready-reckoner; drop Emigration Act; keep NIA + UAPA |
| Q7 | Appeal-window default: flat 90d (V6) vs forum-accurate 30/60/90 | **Exception — keep forum-accurate** (see §5); V6's editable per-accused `appealBy` field adopted, 90d used only when the forum is unknown (labelled "verify") |
| Q8 | Cat I–V semantics | **Manual officer-set facet**, alongside (not replacing) `CaseStatus` |

### 1.1 V7 additions ("CaseTrack 4.html", 2026-07-21 — all adopted)

Second drop, archived at [`spec/CaseTrack-preview-v7.html`](spec/CaseTrack-preview-v7.html);
itemized in [casetrack-v6-gap-map.md](casetrack-v6-gap-map.md) §8. Adds, on top
of everything above: **H1.1 Original FIR** · **H5.1 Name of CIO** (dropdown from
a new app-level **CIO master list** {name, rank}) · **H5.2 complainant name &
address** · **H5.3 trial-court name** · **H7 as a computed status-count table**
(Total / Arrested PC+JC / Absconder / Killed / Charge-sheeted / Under
investigation / Convicted / Acquitted / Approver / Dropped) · explicit
arrest-date inputs on accused rows · delete guard scoped to sample-vs-entered
cases. His briefing note doesn't yet print the new fields — ours will (prototype
lag, not a decision).

## 2. Rules-engine changes

Changes to existing rules (golden tests update with each):

| Rule today | Change | Per V6 |
|---|---|---|
| `expert-report-2day` | threshold 2d → **7d** after `forwardedDate`; rename `expert-report-pending`; still clears instantly on received | `addDays(rp.fwd, 7)` |
| `fr-dg-order` | anchor `spRemarksDate` → **`frISubmittedDate` + 7d**, all tracks | `DG approval of FR-I — pending` |
| `fr-sp-remarks` | becomes **UAPA-only**, due on the 150-day line from arrest | SP step only when `track === "UAPA"` |
| `fr1-chargesheet` | FR anchor becomes **earliest per-accused arrest date** (fallback: case `arrestDate`); closes per accused once a chargesheet covers them | `frAnchor` + `csFiled` |
| `custody-production` | computed **per accused** from that accused's current custody-spell end date (explicit field, not regex); still 1-day-prior | per-accused `ends …` |
| `court-hearing-prep` | routine lead 10d → **15d** (also closes the V3 §2 [partial] note) | `inWindow ≤ 15` |
| `uapa-pp-report-window` | gains an explicit **"custody extension 90→180 filed" date field**; reminder runs from **day 75**, hard | `CUSTEXT` step, due day 75 |
| `untouched` | default `untouchedDays` 14 → **30** (still a setting) | `STALE_DAYS = 30` |
| `appeal-conviction-*` | fan out **per convicted accused**, due = accused `appealBy` (default per §5 exception) | `APPEAL` per accused |
| `bail-hearing-prep` | also fed by per-accused `bailPending`/`bailDate` (no hearing record required) | `BAIL` from accused row |

New rules:

| New rule | Behaviour |
|---|---|
| `fr-ir-mha` | IR for MHA sanction due **7d after DG approval** (hard) |
| `mha-sanction-pending` | nudge 7d after IR submitted while sanction outstanding; UI notes "chargesheet blocked until obtained" |
| `comms-pending` | per CDR/IPDR/IMEI register row: pending = numbers − received; **overdue past `expectedDate`** while pending > 0 |
| `tower-pending` | tower-dump row not Received past `expectedDate` |

New domain checks (not deadlines — integrity panel, dashboard + case file):

- `anchorGaps()`: no registration date · in-custody/charge-sheeted accused without arrest date · trial/appeal case with no future hearing → **CLOCK NOT RUNNING**.
- `lapsedHearings()`: past, undisposed hearing → **NEXT DATE?** with one-tap next-date entry (recorded as a new hearing row — see §5.4).
- Existing `untouched` surfaces here as **DORMANT**.

## 3. Data-model changes (schema migration required)

**CaseRecord**

- `category: "I"|"II"|"III"|"IV"|"V"` (default "I") — officer-set supervision facet.
- V7 docket fields: `originalFir?`, `cioId?` (FK → cio list), `complainant?`,
  `trialCourtName?` — rendered as sub-headings H1.1 / H5.1 / H5.2 / H5.3 and
  included in the briefing note.
- Split FR-I from court filing: new `frISubmittedDate` (internal submission up the
  chain — DG clock anchor); `chargesheetFiledDate` becomes **derived** = earliest
  chargesheet-register date.
- FR/sanction pipeline dates: `custodyExtFiledDate`, `dgApprovedDate` (absorbs
  `dgOrderDate`), `irForMhaDate`, `mhaSanctionDate`. Existing s.45 fields map onto
  the pipeline (`evidenceToAuthorityDate` ≈ IR-to-MHA, `rule4SanctionDate` ≈ MHA
  sanction) — one set of fields, relabelled; the rule3/rule4 working-day clocks
  keep running underneath.
- `sanctions: SanctionItem[] {id, kind, state: pending|required|obtained, date}` —
  replaces the two fixed fields `sanctionStatutory`/`sanctionDg` (migrated in as
  two list items).
- `demo?: boolean` — only demo cases are deletable (Q4).

**PersonRecord (accused)**

- `arrestDate` (per accused — the FR anchor input), `bailPending: boolean`,
  `bailDate`, `othersNote` (LOC/MLA/Interpol free text), conviction sub-record
  `{sentence, sentenceDate, appealBy}`; `accusedStatus` gains `"convicted"` (+
  status colour).

**New tables**

| Table | Shape (per V6) |
|---|---|
| `chargesheet` | kind (main/supplementary), date, court/CC no., `accusedIds[]` |
| `custody_movement` | exhibitNo/evidenceId, nature, out, back, from, to, purpose, seal Y/N |
| `comms_request` | kind (cdr/ipdr/imei), ref (letter no. · date), numbers[], receivedCount, expectedDate |
| `tower_dump` | ref, site/BTS, timeWindow, status, expectedDate |
| `evidence_observation` | evidenceId, date, flag (high/normal), text |
| `progress_entry` (H8) | date, tag (General/Sections/Arrest/Evidence/Court/FSL/Custody/Sanction/Intel), note, optional `routedTo` |
| `plan_entry` (H13) | date, note |
| `cio` (app-level) | name, rank, sortOrder — master CIO list feeding every case's H5.1; reference data, **deletable** (unlike case records) |

**EvidenceRecord** — add `exhibitNo` (M-1/D-1 style); heading-8/9 free-text fields
(`investigationProgress`, `planOfAction`) migrate into one seed `progress_entry` /
`plan_entry` each, then retire.

## 4. UI changes

- **Dashboard** (restructure to V6 order): global search bar → macro stat tiles
  (Cases · Priority n/10 · SC/HC · Overdue · Due ≤15d) → **Cat I–V strip** →
  **integrity checks card** (NEXT DATE? / CLOCK NOT RUNNING / DORMANT) →
  case-heat tile grid (★ Priority section, then Monitored) → pinned **Superior
  Court Zone** → three reminder buckets: *1 · Court matters / 2 · Investigation
  follow-up / 3 · Expert-report pendency* (window ≤ 15d).
- **Case index**: master register table; sort (case no. / newest / phase /
  priority); filters: phase (All/Investigation/Chargesheeted/Trial/Appeal —
  mapped from `CaseStatus` + chargesheet register) and category; category strip;
  quick add (case number only — details filled in-place later); delete only on
  demo rows, others badge "edit-only".
- **Case file**: chargesheet register block above heading 1; three-column
  engine panel (Court / Investigation / Reports); heading 8 = progress log with
  tags + routing (Court-tag auto-creates a court-matter row stamped "↳ from
  Progress"; optional dated append to H3/H6/H10); heading 13 = plan log;
  heading 9 cards MO / Documents / PW / Custody with sub-pages; per-accused
  roster with arrest pill + per-accused FR countdown, bail fields, conviction
  row; FR→MHA **pipeline stepper** (steps gated in order, each a date, footer
  "Chargesheet may be filed after MHA sanction"); FPR + monthly-PR card with
  one-tap "mark filed" (PR1, PR2 … numbering); sanctions list with tap-to-cycle
  state; in-case search with jump-to-heading.
- **New views**: **Links** (cross-case identifier map: list-first, "in N cases"
  red pill, per-case open buttons, show-all toggle; auto-fed from comms
  registers, scope note *"No raw CDR is ingested"*) and **Calendar** (month grid
  + agenda + existing .ics export).
- **Sub-pages** (case-scoped): Progress · Plan · MO · Documents · PW · Custody
  ledger · Court matters · Accused · Observations · Comms (4 registers).
- **Briefing note**: add chargesheet register, key High observations, comms
  summary, banned-orgs footer; **.doc export** (briefing + full case) alongside
  print.
- **Search**: `normNum` punctuation-tolerant number matching (≥3 chars) + hit
  highlighting + per-case grouped results.
- **Priority**: hard cap 10 — "Priority capped at 10 cases. Demote one first."
- **Edit-only sweep**: remove hard deletes on entries; court matters get
  *dispose*; witnesses/accused get ▲▼ re-rank with Sl. No.; PW examined toggle.
- **Copy**: backup tip ("Keep 3 copies on 2 media, 1 offsite…"), unlock note
  ("Unlimited attempts — no lockout, no wipe"), edit-only footnotes.

## 5. Exceptions — where V3/CaseClock stands (and why)

1. **Statutory + buffered dual display stays.** V6 renders only the buffered
   target, but V3's locked text — the officer's own words — requires both "as a
   safeguard" (§4.1). V6's omission is prototype silence, not a decision.
2. **Forum-accurate appeal windows stay** (30d magistrate / 60d sessions / 90d
   HC + death variants) as the *default* for the new per-accused `appealBy`;
   flat 90d only when the forum is unknown. V6's flat default would warn 60 days
   late on a magistrate conviction.
3. **Banned-org watchlist stays global** (V3 §5: "linked system-wide"); V6's
   per-case list is a simplification. The per-case add box feeds the global
   watchlist; accused rows red-flag on watchlist match.
4. **Hearing rollover preserves history**: "enter next date" creates a new
   hearing row and disposes the lapsed one, rather than overwriting the date in
   place (V6 overwrites — which contradicts its own edit-only/audit principle).
   Same one-tap UX either way.

Also not ported (implementation artifacts, not requirements): `prompt()`/`alert()`
flows, frozen `TODAY`, regex-parsed custody end dates, single-write persistence,
current-month-only PR check.

## 6. Migration notes — OBSOLETE (prototype mode)

> **2026-07-22 (Dhanjit): "No migration hacks — we are still prototype
> designing."** All legacy-compat machinery was removed (the `legacyMigrated`
> one-time copies, dgOrderDate/sanction-field/arrest copy-down, free-text →
> log seeding, legacy chargesheet-date → register synthesis, and the
> deprecated fields themselves). The current schema is the only schema; old
> prototype vaults are simply re-seeded ("Clear & start fresh" → "Load sample
> cases"). The one derivation that stays is `chargesheetFiledDate` = earliest
> register row — that's the data model, not compat. Re-introduce a real
> migration strategy only when there are production vaults to protect.
> The notes below are kept for the record.

### Original notes (historical)

- Vault schema migration (additive tables + column adds + two field migrations:
  sanctions → list; H8/H13 text → seed log entries). Follow `db/migrate.ts`
  conventions; never break `fs-sink` atomicity invariants.
- `arrestDate` (case) copies to each accused currently marked
  arrested/in-custody; case-level value retired to derived
  anchor-of-earliest-arrest.
- Existing single `chargesheetFiledDate` becomes chargesheet-register row #1
  (kind: main).
- `dgOrderDate` → `dgApprovedDate` rename-in-migration.
- Settings: `untouchedDays` default 30 for new vaults; existing vaults keep
  their stored value.
- Update `docs/legal-rules.md` for Q1/Q2 rule changes; note both as
  officer-directed (V6) departures from V3.

## 7. Build order (green-lit sequence)

> **Status 2026-07-21: T1 + T2 SHIPPED** (branch `claude/casetrack-html-review-5decb1`,
> commits `5d199df`→`15c2297`). T1: schema/domain, engine rewires + 4 new rules,
> integrity checks, normNum search, reference refresh, ledger design system, all
> T1 screens. T2: comms registers (CDR/IPDR/IMEI/tower) + pendency rules, the
> cross-case **Links** map, custody movement ledger, report observations (High →
> briefing note), FR→MHA pipeline stepper, sanctions[] list panel, briefing note
> V7 sub-headings + registers; `window.confirm` eliminated app-wide.
>
> **2026-07-21: 4-agent independent review + remediation** (commit `26d12a3`).
> Fixed: 3 criticals (cross-case edit-buffer bleed; stale InvestigationPanel
> buffer wiping pipeline dates; partial chargesheet closing the FR clock
> case-wide — coverage is now per-accused with FR pills on the roster) + 8
> majors (one-time hydration migrations so cleared dates stay cleared, legacy
> filing date → register row, editable register rows, per-accused
> production-24h, appeal double-count, custody double-fire, demo-only delete
> guards + insert-only seed, light-theme track pills, commit-on-blur inputs) +
> minors. 288 tests + typecheck green; criticals re-verified live.
>
> **Deferred to T3 (from the review):** one-tap NEXT-DATE rollover + per-case
> integrity card; search result grouping/highlighting + in-case search; DORMANT
> in the integrity card; `untouchedDays` settings UI.
> **Q9 RESOLVED (Dhanjit, 2026-07-21): Wadhawan convention adopted.** The
> remand/arrest day counts in the statutory period (ED v. Kapil Wadhawan, 2023),
> so every statutory display now shows the last SAFE day = anchor + N − 1,
> labelled "counting the remand day — Wadhawan": fr1's note, the Investigation
> panel row, the briefing default-bail line, and `uapa-pp-report-window`'s due
> date (anchor+89) are all on one convention. The 75-vs-150 SP-remarks line
> (statutory-correct 90→180 gating vs the officer's flat 150) remains recorded
> as intentional.
>
> **2026-07-22: T1+T2 MERGED & DEPLOYED** to app.caseclock.dhanjit.me, then
> **T3 SHIPPED & DEPLOYED** (commits e34e081..c4aefa7, merge c580dc3):
> calendar view (month grid + agenda + .ics), H8/H13 dated logs with
> Court-tag routing + legacy-text migration, PW witness panel
> (relevance/examined/re-rank), .doc briefing export, dashboard heat tiles +
> DORMANT in the integrity card, per-case integrity card with one-tap
> NEXT-DATE rollover, grouped + query-marked search incl. comms identifiers,
> dark ledger theme, configurable dormancy threshold, two-step delete
> confirms on hearings/requests. Remaining (minor, unscheduled):
> documents-register rework (existing DocumentsPanel judged sufficient for
> now), case-index register view variant, gallery/attachment delete
> confirms.

1. **T1 — spines** (schema migration + low-risk extensions): chargesheet
   register · per-accused arrest/bail · conviction + appeal (Q3/Q7) · integrity
   panel · priority cap · reference refresh · search upgrades · rule-parameter
   changes (7d, DG anchor, 15d lead, stale 30) · V7 docket fields (H1.1,
   H5.1–5.3) + CIO master list + H7 status-count table.
2. **T2 — new modules**: comms registers → Links map · custody ledger · report
   observations (+ briefing sections) · FR→MHA pipeline stepper.
3. **T3 — views & polish**: calendar view · H8/H13 logs + routing · dashboard
   restructure + Cat I–V · .doc export · witness/accused re-rank + examined ·
   edit-only sweep · documents register rework · copy changes.

Each tier: TDD per repo convention, golden-test updates alongside rule changes,
sample-cases seed extended with the V6 structures so both demo cases exercise
every new module (V6's own seed is the fixture source).
