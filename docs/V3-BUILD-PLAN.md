# V3-BUILD-PLAN.md — the V2 → V3 delta, sequenced

> How CaseClock gets from the built **V2 deadline core** to the **V3 locked spec**
> ([`REQUIREMENTS.md`](REQUIREMENTS.md)), verified against the two acceptance fixtures
> ([`sample-cases.md`](sample-cases.md)). Every "current state" line below is backed by a
> file:line citation from the V2→V3 code audit (workflow `caseclock-v2-v3-gap-audit`,
> 26 Jun 2026). This is the *how/when*; REQUIREMENTS.md is the *what*. Build order, not yet built.

## Where we are

The V2 engine core is built and golden-tested: 13 headings, 11 accused statuses, custody/PR/FR
clocks (incl. the DG-7-day hard flag), UAPA PP-report day-90 boundary, s.45 working-day sanction,
Superior Court Zone (pinned, 15-day, SC/HC), banned-org auto-RED, sanctions (statutory+DG), an
embedded place map, and reference laws (NIA/Foreigners/Emigration/UAPA).

**Persistence is JSON-aggregate-in-column** (`apps/app/src/domain/repository.ts:40` serializes the
whole `CaseAggregate`; `apps/app/src/db/schema.ts` `cases` table = `id/fir_number/uapa/status/data/updated_at`).
**Consequence that shapes this whole plan:** adding fields to existing aggregates is **purely
additive — no SQL migration**. Only a brand-new *queryable* table (global search index, image-blob
store) warrants a `SCHEMA_VERSION` bump.

## The delta at a glance

| Tier | Area (V3 §) | Status | Effort | Migration? | Blocks a sample case? |
|---|---|---|---|---|---|
| 1 | Expert-report 2-day alert (§4.1) | new | M | no | **yes — both** (headline RED alert) |
| 1 | Process & Requests tracker (§6) | new | M | no | **yes — both** |
| 1 | Priority / pin model (§1) | new | M | no | **yes — both** (both are PRIORITY/pinned) |
| 1 | Routine trial 15-day lead (§4.2) | partial | S | no | minor — both |
| 2 | In-app global search (§9) | new | M | optional | exercised by both |
| 2 | Briefing-note generator (§8) | new | M | no | exercised by both |
| 2 | .ics calendar export (§12) | new | S | no | exercised by both |
| 3 | Mind map + image gallery (§10) | new | L | yes (image store) | yes — both |
| 3 | Document repository / folder-sync (§7) | new | L | yes (documents) | yes — both |

**Sequencing rationale.** Tier 1 is four additive, low-risk changes that share three new primitives
(an evidence forwarding-date, a `ProcessRequestRecord`, a real priority flag) and together make
**both sample cases fully representable with their named alerts firing** — the natural first
milestone. Tier 2 is three self-contained, dependency-free officer utilities that read existing data
(search, briefing note, .ics) and don't touch the engine. Tier 3 is the two heavy modules that each
need a **new storage layer** (encrypted image blobs; a documents table) and are explicitly gated
behind the priority flag from Tier 1; §7's folder-sync only activates at deployment, so it can land
last without blocking the preview build.

---

## Tier 1 — engine primitives + seed the sample cases

### 1.1 Expert-report 2-day auto-alert (§4.1, §5 heading 9)

- **Current:** `EvidenceRecord` (`domain/types.ts:57-64`) has only `status: "pending"|"received"` — **no forwarding date**. `computeDeadlines(case, persons, hearings, settings, today)` (`rules/engine.ts:646`) **never receives the evidence list**; `CaseAggregate.evidence` (`repository.ts:23`) is loaded but never threaded in. `buildAgenda` (`rules/agenda.ts:64-99`) likewise ignores evidence. `Owes="FSL"` (`types.ts:213`) is a dead enum reserved for exactly this.
- **Change:**
  - `EvidenceRecord` += `forwardedDate?: ISODate | null`, `reportKind?: "expert" | "other"` (or an `isExpertReport` flag) and keep `status` (toggling to `received` sets the done state). Optionally `receivedDate?`.
  - Thread `evidence` into `computeDeadlines` + `buildAgenda` signatures (and the `CaseDetail.tsx:48` call site).
  - New rule `expert-report-2day` in `RULE_REGISTRY`: `applies` when `reportKind==="expert"` (or any forwarded report) && `status==="pending"`; fires `state="overdue"` once `today ≥ forwardedDate + 2`; `state="done"` when `received`; `severity: "statutory"`, `owes: "FSL"`, `track: "investigation"`, `leadOffsets: [1]`. RED on the dashboard via existing severity styling.
  - Surface the forwarding-date input + the overdue badge in `features/cases/EvidencePanel.tsx` and heading #9 (`CaseFile.tsx`).
- **Effort:** M · **Migration:** none (additive) · **Tests:** golden — forwarded day-0 → active; +2 → overdue; received → done.
- **Done when:** Case 1 "Device imaging / CFSL — PENDING overdue" and Case 2 "passport forgery — PENDING overdue" both light RED automatically from their forwarding dates, and clear on receipt.

### 1.2 Process & Requests tracker (§6)

- **Current:** only a per-accused `LocNotice {type, ref, status}` (`types.ts:67-72`, nested under `PersonRecord.loc` `types.ts:198`, edited in `AccusedPanel.tsx:130-149`). No date raised / authority / expected-response; `status` is free text. No case-level requests collection on `CaseAggregate` (`repository.ts:17-24`). Greps for `Rogatory/proclamation/FRRO/MEA/expectedResponse` = **0 hits**.
- **Change:**
  - New `ProcessRequestRecord { id, caseId, type: "LOC"|"MLA_LR"|"interpol_red"|"interpol_blue"|"NBW"|"proclamation"|"attachment"|"custom", customLabel?, accusedIds: string[], refNo?, dateRaised?, authority?, status: "requested"|"pending"|"granted"|"executed"|"rejected", expectedResponseDate?, note? }`.
  - `CaseAggregate += processRequests: ProcessRequestRecord[]` (`repository.ts`), serialized with the aggregate (no migration).
  - New rule `process-request-overdue`: `applies` when `expectedResponseDate` set && status ∈ {requested, pending}; fires overdue once `today > expectedResponseDate`; `track: "court"` (or a new `"process"` track + pill in `lib/format.ts`); optional standard-default window when none set.
  - New `features/cases/RequestsPanel.tsx` (CRUD mirroring `EvidencePanel`/`AccusedPanel`: type select, accused multi-select, ref/letter no., date raised, authority, status, expected-response date), wired into `CaseDetail.tsx:202-215` with a `saveRequests` handler.
  - **Decision:** keep `LocNotice` as a derived per-accused view of the new tracker (avoid double entry) — see Open Decisions.
- **Effort:** M · **Migration:** none · **Done when:** Case 1 (LOC A-4, Interpol RCN A-4, sanction) and Case 2 (LOC×3, MLA/LR 45-day, FRRO/MEA 15-day, RCN proposed) all enter as requests, and the 45-day / 15-day expected-response clocks alert when overdue.

### 1.3 Priority / pin model (§1)

- **Current:** `CaseRecord.priorityHeinous?: boolean` (`types.ts:185`) is **dead** — zero readers/writers in `src`. No pin section, no cap, no detail tiers, no silent path. `buildAgenda`/`bucketFor` (`agenda.ts:48-99`) bucket purely by state/severity. Dashboard (`Dashboard.tsx`) renders agenda buckets, not a per-case priority list.
- **Change:**
  - Replace/rename `priorityHeinous` → `priority?: boolean` (or a `priorityRank?: number` for pin ordering) on `CaseRecord`. (Reconcile the "heinous-crime" naming — it conflated heinousness with V3's fluid user priority.)
  - Priority toggle in `CaseWizard` + `CaseDetail`; promote/demote in `state/cases.ts` with a **~10 soft cap** (warn, don't hard-block).
  - A pinned **"Priority cases"** section atop `Dashboard.tsx` (distinct from the hearing-tier Superior Court Zone, which stays).
  - **Tiered upkeep:** gate the heavy modules (mind-map/gallery, §1.x granular registers) behind `priority`; add a **silent** (non-OVERDUE, no escalation) alert path for non-priority cases in `agenda.ts`/`engine.ts` so lighter cases still auto-compute deadlines but don't shout.
- **Effort:** M · **Migration:** none · **Done when:** Case 1 and Case 2 can be flagged priority and pin to the top with fuller detail; a non-priority case still computes its deadlines but alerts silently.

### 1.4 Routine trial 15-day lead (§4.2)

- **Current:** only `superior-court` carries a 15-day lead (`engine.ts:558`). Routine `court-hearing-prep` uses `LEAD_COURT=[10,7,3]` (`engine.ts:98,538`), `bail-hearing-prep` `[5,3,1]` (`engine.ts:519`), `judgment-30` `[5]` (`engine.ts:392`). Charge-framing / deposition / final-arguments surface only as generic `Court hearing — ${purpose}` rows.
- **Change:** add `15` to the trial-track leads (`LEAD_COURT`, bail/judgment), or introduce a standard 15-day lead for the trial track. Optionally promote charge-framing / final-arguments / deposition to individually-labelled milestones.
- **Effort:** S · **Migration:** none · **Done when:** Case 1's non-superior "NIA Special Court next hearing" alerts at 15 days, not 10.

### 1.5 Seed the two sample cases

- After 1.1–1.4, add `sample-cases.md` as importable demo fixtures (a dev seed path or an "load sample data" action), so both cases populate end-to-end and every panel/engine is demonstrable.

**Tier 1 acceptance:** both sample cases in [`sample-cases.md`](sample-cases.md) are representable field-for-field, and every alert named in their "Attached Panels" sections fires correctly.

---

## Tier 2 — officer utilities (net-new, self-contained, no heavy deps)

### 2.1 In-app global search (§9)

- **Current:** no search surface anywhere — `nav.ts:3-8` has no `search` kind; `cases` store exposes only `getById` (`state/cases.ts:62-64`). All `<input>`s are forms.
- **Change:** add a `search` view (`nav.ts` + `app.tsx`), a search box in `TopBar`/`Dashboard`, a **pure matcher** over the structured fields only — case no, letter/ref no (from §6 requests once built), accused name, section of law, date, banned-org name, court matter — and a results list linking to `go({kind:"case", id})`. **Must not** search document contents. ~30 cases in memory → no index needed for correctness (a queryable table is optional, defer).
- **Effort:** M · **Migration:** none (read-only over in-memory aggregates).

### 2.2 Briefing-note generator (§8)

- **Current:** the 13 headings render on-screen (`CaseFile.tsx:123-179`) but there's no generate/print/PDF path; the only download is the encrypted `.ccbak` backup (`db/backup.ts`). No PDF dep.
- **Change:** a pure `briefing.ts` builder (CaseAggregate → 13 headings, reusing CaseFile's ordering + the #7/#9/#11/#12 rollups), a print-only `BriefingNote.tsx` styled with `@media print` + `@page { size: A4; margin: 18mm }` and `page-break-inside: avoid` per heading, and a "Briefing note" action on `CaseDetail` TopBar that opens it and calls `window.print()`. The OS dialog gives **both** print and Save-as-PDF — **no library, stays offline**.
- **Effort:** M · **Migration:** none.

### 2.3 .ics calendar export (§12)

- **Current:** nothing — greps for `.ics/ical/VEVENT/DTSTART` = 0 source hits.
- **Change:** a small generator emitting `VEVENT`s over the computed `DeadlineEvent`s + hearings (with 15-day/1-day `VALARM`s), one-way export via a download button in Settings (and/or per-case). Live Google Calendar sync stays deferred to server deployment per §12.
- **Effort:** S · **Migration:** none.

---

## Tier 3 — heavy modules (new storage; gate behind priority)

### 3.1 Mind map + image gallery (§10)

- **Current:** no image storage, no graph lib (`package.json` has no reactflow/d3/cytoscape), no node model. `Highlighted` RED exists only as inline text. Heaviest module.
- **Change (3 layers):**
  1. **Storage** — encrypted image-attachment store: schema `2 → 3` adding an `attachments` table holding **content-addressed AES-256-GCM blobs** (reuse the libsodium envelope + `sqlite-blob` pattern; **not** base64-in-JSON, to keep the vault performant). Add `Attachment`/`ImageRef` type + link fields on `EvidenceRecord` (exhibit→report image), `PersonRecord` (accused photo), `PlaceOfOccurrence` (place image).
  2. **Gallery** (do first — lighter): a per-case gallery panel — file-picker (`@capacitor/filesystem`, already a dep), thumbnail grid, tag image to accused/place/evidence.
  3. **Mind map**: root = `firNumber` + identity; **13 fixed first-level branches** mirroring the headings (structure already known from `CaseFile.tsx`); accused nodes coloured via existing `accusedStatusMeta`; banned-org nodes RED via the watchlist; thumbnails on nodes; an evidence-image node links to its `EvidenceRecord` status + witness count. **Hand-rolled radial SVG** (fixed 1-root/13-branch tree) — no heavy graph dep, PWA/iPad-friendly, offline.
- **Effort:** L · **Migration:** yes (`attachments` table, `SCHEMA_VERSION` 3) · **Gate:** priority cases only (§1).

### 3.2 Connected document repository / folder-sync (§7)

- **Current:** entirely absent. `@capacitor/filesystem` is declared but **unused** in `src`; the only FS code writes the one encrypted vault blob (`db/sqlite-blob.ts`). No `DocumentRecord`, no letter-number/subject fields.
- **Change (additive seam):**
  1. `DocumentRecord { id, caseId, letterNo?, dateOnDoc?, type?, subject?, forwardingDate?, status?, linkedAccusedId?, linkedEvidenceId?, source: "manual"|"index"|"filename"|"pdftext", fileRef? }`; a `documents` table (schema `→ 3`/`4`) is cleaner than JSON for §9 letter-number search.
  2. **Dual-mode source behind one interface:** `ManualAttachSource` (preview — `<input type=file>`/drag-drop, identical data model) and `FolderSyncSource` (deployment — File System Access `showDirectoryPicker` on web, or `@capacitor/filesystem` on native: parent → per-case-by-case-number → index file).
  3. **Three parsers → same `DocumentRecord`:** index-file parser, filename-convention (`date_type_reference.pdf`) parser, and a **deploy-only** PDF/Word text parser (add pdf.js; always draft-for-confirmation per spec).
  4. Wire documents into §9 search (letter/ref no.), heading-9 evidence letter numbers, and §6 request ref numbers. Legacy strategy: cutoff + seed ~10 priority cases first.
- **Effort:** L · **Migration:** yes (`documents` table) · **Note:** folder-sync activates **only at deployment**; the manual-attach path keeps the preview build identical, so this can land last.

---

## Consolidated data-model additions

| Type | Field(s) | Tier | Migration |
|---|---|---|---|
| `EvidenceRecord` | `forwardedDate?`, `reportKind?`/`isExpertReport`, `receivedDate?` | 1.1 | none |
| `CaseRecord` | `priority?` / `priorityRank?` (replaces dead `priorityHeinous`) | 1.3 | none |
| new `ProcessRequestRecord` + `CaseAggregate.processRequests[]` | — | 1.2 | none |
| `computeDeadlines` / `buildAgenda` signatures | accept `evidence` (+ `processRequests`) | 1.1/1.2 | n/a |
| new `Attachment` + link fields on Evidence/Person/Place | content-addressed encrypted blobs | 3.1 | **yes (table)** |
| new `DocumentRecord` + `documents` table | — | 3.2 | **yes (table)** |

## Open product decisions

1. **LocNotice vs unified tracker (§6).** Recommend: migrate LOC/Interpol into `ProcessRequestRecord` (with `accusedIds`) and keep the per-accused LOC view as a *derived* read — avoids double entry. Confirm before touching `AccusedPanel`.
2. **Priority field semantics (§1).** `priority: boolean` (simple) vs `priorityRank: number` (explicit pin ordering). Recommend boolean + recency sort first; add rank only if manual ordering is wanted.
3. **Image storage (§10).** Encrypted content-addressed blobs in a new table (recommended) vs base64-in-JSON (simpler, bloats the vault). Recommend the blob table.
4. **Search index (§9).** In-memory matcher over ~30 cases (recommended, no migration) vs a queryable table. Defer the table until letter-number search (§7) needs it.
5. **Calendar (§12).** Ship `.ics` one-way export now; live Google Calendar sync stays a deployment-time follow-up.
6. **`custodyCaseType` for multi-statute cases.** Case 2 (BNS+Foreigners+Passport+UAPA s.15) lands on the right UAPA 150/90 track **only if `uapaFlag=true`** is set on entry; otherwise it silently defaults to scheduled_lower (60/45). Recommend a small (S) guard/warning when a UAPA section is present but `uapaFlag` is unset.

## Acceptance — the two sample cases

The build is V3-complete when, for **both** [`sample-cases.md`](sample-cases.md):
every 13-heading field round-trips; the evidence forwarding-date drives an automatic 2-day RED
expert-report alert that clears on receipt; all Process & Requests entries (incl. MLA/LR 45-day and
FRRO/MEA 15-day) persist and alert on expected-response; the case can be flagged priority and pins
to the top with fuller detail (lighter cases alert silently); global search finds ULFA-I / accused /
section / ref-no across cases; a printable A4 13-heading briefing note generates; deadlines export to
.ics; the mind map renders the 13 branches with colour-coded accused + RED banned-org nodes + linked
exhibit thumbnails; and (at deployment) the per-case folder ingests letter numbers/dates/subjects.
