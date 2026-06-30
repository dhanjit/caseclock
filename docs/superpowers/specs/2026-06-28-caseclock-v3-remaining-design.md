# CaseClock V3 — Remaining Modules: Design Spec (LOCKED)

> Date: 2026-06-28 · Branch: `claude/hungry-cannon-072874`
> Covers the remaining V3 work after Tier 1 (engine primitives + sample-case seed) shipped.
> Grounded in a 14-agent parallel code audit (workflow `caseclock-v3-understand`, run `wf_5367b0b8-44b`):
> 5 subsystem maps + a verified platform/dependency constraints sheet + 7 module blueprints + a gap/conflict critic.
> Authoritative requirements: [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md). Acceptance fixtures: [`docs/sample-cases.md`](../../sample-cases.md).

## 0. Locked product + architecture decisions

These resolve every conflict the audit critic surfaced. Build to these.

1. **Build order:** Tier 2 utilities first (search → briefing → .ics), then the DB **seam**, then attachment-store + gallery, then mind map, then the merged document/import/extraction module.
2. **Offline extraction stack:** heuristics + OCR + an **opt-in local LLM**. No online AI ever. Every extracted field is a **draft for the officer's confirmation**, never written as verified truth.
3. **Document ingestion is on-demand import, not a watched folder.** The officer triggers an import, points at files (or a folder where supported), the app scans once, extracts drafts, writes on accept. No persisted directory handle, no background watch, no re-sync.
4. **Import primitive:** `<input type=file multiple>` (the only universal one — **no Safari has `showDirectoryPicker`; `webkitdirectory` is broken on iOS Safari**). Desktop Chromium `showDirectoryPicker` and native `@capacitor/filesystem.readdir` are progressive enhancements only.
5. **Schema migration ownership (append order = version):** `applyMigrations` stamps `MIGRATIONS.length` (`db/schema.ts:67-69`), so the next appended step is index 2 = version 3, the one after is index 3 = version 4.
   - **Gallery owns `2→3`** (`attachments` table).
   - **Document module owns `3→4`** (`documents` table).
   - `SCHEMA_VERSION` const bumped to match each (3, then 4). Neither step hardcodes a version inside it.
6. **DB seam change is a standalone prerequisite** (land once, before gallery + extraction):
   - Widen `Bind` to `(string | number | null | Uint8Array)[]` at **all three sites**: `db/types.ts:9`, `db/schema.ts:45-46` (`MigrationIO`), `db/local-client.ts:47,50` (`dbIO`). The sqlite-wasm `oo1` engine already round-trips `Uint8Array` BLOBs at runtime; only the TS type blocks it.
   - Add `execMany(statements: {sql, bind?}[])` to `DbClient` + `LocalDbClient` (one `persist()` after a `SAVEPOINT`-wrapped batch) + `MemoryDbClient` (no persist). Fixes the O(N·dbSize) reseal cost of multi-row imports.
   - **First deliverable of the seam: a `MemoryDbClient` Uint8Array→BLOB→read round-trip test**, to confirm the "no engine change" premise before building on it.
   - `db/sqlite-blob.ts:54-72` `validateRestoredDb` hard-requires `meta`+`cases` only; new tables stay **optional** there (do not add to the required set).
7. **Binary storage — one strategy for both images and documents:**
   - **Big bytes** (image originals, document originals) → **content-addressed, AES-256-GCM sidecar files in OPFS** (one blob per object), reusing the `db/sqlite-blob.ts` OPFS helper (`opfsAvailable`/`writeOpfsFile`, `createWritable`→`syncAccessHandle` fallback). A shared `db/blob-store.ts` owns this for both modules.
   - **Small bytes** (downscaled thumbnails, ≤256px) + **all metadata** → BLOB/columns in the SQL vault. Keeps the per-`exec` whole-vault reseal cheap and auto-includes thumbnails in the `.ccbak` backup.
   - **Backup caveat (documented):** sidecar originals are **not** in `.ccbak` (the backup serializes only the SQLite DB); thumbnails + metadata are. Originals are re-importable. Acceptable for V3.
8. **Self-host everything; no CDN.** CSP `connect-src 'self'` (`apps/app/public/_headers`) blocks all default CDN fetches (tesseract traineddata, web-llm weights, transformers.js HF hub). All model/OCR/worker artifacts ship same-origin under `dist/` and are **excluded from the SW precache** (`public/sw.js`, `PRECACHE=[]`). `img-src 'self' data: blob:` and `worker-src 'self' blob:` are already present — object-URLs and blob workers are CSP-OK with no header change.
9. **Keep no-COOP/COEP.** All new WASM runs single-threaded (tesseract SIMD core, transformers.js `numThreads=1`). WebGPU (web-llm) does **not** need cross-origin isolation. Adding COOP/COEP would entangle the OpenStreetMap embed and need Safari re-testing — not worth it.
10. **Local LLM viability:** WebGPU **is** shipped on iPad Pro Safari 26 (Sep 2025). Default to a **2–3B int4** model (Phi-3.5-mini-int4 ~2GB or Qwen2.5-3B-q4f16) — the ~993MB Metal single-buffer cap rules out 7B+. **Capacitor WKWebView WebGPU is not guaranteed** → runtime-detect `navigator.gpu`; degrade to heuristics + OCR (+ transformers.js WASM) where absent. Weights lazy-download on explicit consent, cache in OPFS.
11. **Gallery + mind map are always reachable.** `case.priority` (§1) gates only whether heavier *upkeep is nudged/required*, not whether the UI opens. Mind-map TopBar button always shown; content always renders.
12. **Settings persistence:** accept `holidays:[]` (the `DEFAULT_SETTINGS` default) for V3; briefing + .ics read it directly. No settings store this round (noted follow-up).
13. **Closed cases:** included in **search** (it's a lookup tool); excluded by default from the **all-cases .ics** (matches dashboard/agenda semantics, `includeClosed` opt); **briefing** builds for whatever case is open (incl. closed).
14. **Already done (no work):** Tier 1.4 routine trial 15-day lead is shipped (`rules/engine.ts:87`, `LEAD_COURT=[15,10,7,3]`). The build-plan §1.4 text claiming `[10,7,3]` is stale.

### Shared-file edit coordination (single owner each)
Multiple modules touch these; to avoid clobbering, **the main orchestrator owns all cross-cutting wiring edits** (modules deliver only their own new files):
- `state/nav.ts` View union — each new view kind appends one variant; **every variant must get a matching `app.tsx` Shell `case`** (default falls through to Dashboard silently).
- `features/cases/CaseDetail.tsx` TopBar actions — fixed order `[Priority][Briefing][.ics][Mind map][Back][lock]`.
- `features/cases/CaseDetail.tsx` panel list — append `GalleryPanel`, then `DocumentsPanel`, after `ReferenceLawsPanel`.
- `features/settings/SettingsView.tsx` — append Sections in order: Calendar export, then Import documents.
- `db/schema.ts` `MIGRATIONS[]`/`SCHEMA_VERSION` — gallery appends first (v3), documents second (v4).
- `domain/types.ts` — additive interface fields only; each record interface gets its own append.

---

## A · Tier 2 — officer utilities (first; no migration, no deps)

### A0. Prerequisite refactor (lift UI helpers into pure domain)
So the pure briefing builder has zero UI dependency and the screen + printed note never drift:
- New `domain/evidence.ts` — pure `expertReportOverdue(e, today)`; `EvidencePanel.tsx` imports it and **re-exports** it (existing `import { expertReportOverdue } from "./EvidencePanel"` in `CaseFile.tsx` keeps working).
- New `domain/case-rollups.ts` — pure `custodySummary(p)` + `accusedNotices(p, requests)` moved out of `CaseFile.tsx`; `CaseFile.tsx` imports them. Screen rendering unchanged.

### A1. Global search (§9) — `domain/search.ts` + `features/search/SearchView.tsx`
- Pure `searchCases(aggregates, query, watchlistNames?): SearchHit[]`. Linear scan over in-memory aggregates (~30 cases, no index/table).
- **Structured fields only** (the load-bearing §9 guarantee — **never** brief/progress/plan free-text or any doc/OCR field): FIR/case no, identity, sections of law, accused names (`role==='accused'`), dates (raw ISO **and** `fmtDate` display form, incl. hearing dates), court matters (`HearingRecord.court`/`purpose`), **both** `ProcessRequestRecord.refNo` **and** `LocNotice.ref`, and watchlist/banned-org names.
- `SearchHit { caseId, caseLabel, field: 'firNumber'|'identity'|'section'|'accused'|'date'|'court'|'request'|'watchlist', snippet, matchedText, score }`.
- Ranking: field-class weight (FIR/refNo/accused exact > section/court substring > date) → prefix>substring → case recency.
- Includes closed cases. V1 deep-links to case top (`go({kind:'case', id})`); field-anchored scroll deferred.
- View: `{ kind:'search'; q?:string }`; `SearchView` route; a search box in the Dashboard TopBar → `go({kind:'search', q})`. Snippets via `<Highlighted>` so watchlist names auto-RED.
- **Tests** (`domain/search.test.ts`, pure, over `sampleAggregates()`): field coverage (each field class), ranking order, **no-doc-content** (a sentinel in `brief`/`investigationProgress`/`planOfAction` returns zero hits), normalization (case-insensitive, NFC, whitespace-only → `[]`), watchlist tagging.

### A2. Briefing-note generator (§8) — `domain/briefing.ts` + `features/cases/BriefingNote.tsx`
- Pure `buildBriefing(agg, today): BriefingNote` → header block (caseLabel, firDate, UAPA flag, default-bail line from `custodyLimits`) + the **13 headings in exact `CaseFile.tsx` order**, reusing the #7/#9/#11/#12 rollups (via the lifted pure helpers). No page cap (paging is CSS-only).
- Print view mounts via `createPortal` into a `#print-root` div (`index.html`). A body class `print-active` toggles `@media print` rules: `@page { size:A4; margin:18mm }`, hide `#root`, show `#print-root`, `break-inside:avoid` per heading, force black-on-white inside `.briefing-note` (opts out of the dark theme so the PDF is signature-ready).
- "Briefing note" TopBar action on CaseDetail flips `printing` state; `BriefingNote` owns the lifecycle: add `print-active`, `useLayoutEffect` → rAF → `window.print()`, on `afterprint` remove class + `onDone()`. **Fallback (iPad/WKWebView unverified):** a manual "Close" affordance + a timeout-clear, since `afterprint` may not fire in WKWebView. Real-device test needed.
- OS dialog gives Print **and** Save-as-PDF — no PDF library, fully offline.
- **Tests** (`domain/briefing.test.ts`, over both sample fixtures): exactly 13 headings in order with exact titles; #7/#9/#11/#12 rollups; expert-overdue badge; header default-bail line; determinism + non-mutation; minimal-aggregate edge (no evidence/hearings/accused → 13 headings with `—`).

### A3. .ics calendar export (§12) — `domain/ics.ts`
- Pure, dependency-free RFC-5545 generator: `buildCaseIcs(agg, settings, today, opts?)` + `buildAllCasesIcs(aggregates, settings, today, opts?)`. One all-day VEVENT per computed `DeadlineEvent` (anchored on `dueAt`) + per `HearingRecord`, each with **-P15D and -P1D** `VALARM`s (`ACTION:DISPLAY`).
- **Must** pass `agg.evidence ?? []` and `agg.processRequests ?? []` into `computeDeadlines` (the engine defaults them to `[]`, so expert-report + process-request events silently drop otherwise — regression-guarded by a test).
- RFC-5545 correctness in-module: 75-**octet** line folding (UTF-8-safe, no mid-codepoint split), text escaping (`\` first, then `,` `;` newline), `DTSTART;VALUE=DATE` all-day vs UTC `DTSTAMP` (injectable for deterministic tests), next-day exclusive `DTEND;VALUE=DATE`, stable deterministic `UID` (caseId + ruleId/hearingId + `@caseclock` suffix → idempotent re-export updates rather than duplicates), `PRODID`, `VERSION:2.0`, CRLF line endings.
- Skip `dueAt===null` and states `done`/`na`/`extinguished`/`latent` (mirror `agenda.bucketFor`). All-cases export excludes closed by default.
- Download in SettingsView (all cases) + per-case TopBar button, both reusing the existing `Blob → URL.createObjectURL → <a download> → revoke` idiom (`SettingsView.tsx:49-73`), MIME `text/calendar;charset=utf-8`.
- **Tests** (`domain/ics.test.ts`): escaping, octet folding (multibyte), `toIcsDate`, all-day DTSTART vs DTSTAMP, UID stability/uniqueness, both VALARMs, skip rules, evidence/processRequest threading, hearing escaping, includeClosed, structural balance, determinism, empty input.

**Tier-2 implementation method (ultracode):** the 3 pure cores + their tests + the 2 new view files are **disjoint new files** → built concurrently by 3 parallel agents (each self-runs its vitest), then the orchestrator does the cross-cutting wiring edits (`nav.ts`, `app.tsx`, `Dashboard`, `CaseDetail`, `SettingsView`, `index.html`, `index.css`) and full verification (typecheck + `vitest run` + preview-server screenshot). The A0 refactor + briefing files are owned by the briefing agent (only it touches `CaseFile.tsx`/`EvidencePanel.tsx`).

---

## B · DB seam (prerequisite for Tier 3) — `db/types.ts`, `db/schema.ts`, `db/local-client.ts`, `db/memory-client.ts`, new `db/blob-store.ts`
Per locked decision 6 + 7. Land + verify before gallery/extraction. Deliverables: widened `Bind` (3 sites), `execMany` (both clients), the BLOB round-trip test, and `blob-store.ts` (content-addressed AES-GCM sidecar OPFS, reusing the existing OPFS helper + envelope).

---

## C · Mind map + gallery (§10)

### C1. Attachment store + gallery (`2→3`)
- Migration step (index 2): `attachments(id TEXT PK, case_id TEXT, kind TEXT /* accused|place|evidence|doc */, ref_id TEXT, mime TEXT, thumb BLOB, blob_ref TEXT, created_at INTEGER)`. **Thumb in-vault; original via `blob-store.ts` sidecar** (`blob_ref` = content hash). `SCHEMA_VERSION=3`.
- `AttachmentRepository` + a per-case **Gallery panel**: `<input type=file accept=image/* multiple>` (web + iPad Files + native), client-side canvas downscale to thumbnail, batched write via `execMany`, thumbnail grid, tag each image → accused/place/evidence/doc.
- Selector `thumbsForCase(caseId): Map<refId, blobUrl>` (defined here, consumed by mind map + EvidencePanel).
- **EvidencePanel/heading #9** renders linked exhibit thumbnails beside the report row (sample-cases.md lines 91, 171 require exhibit photos tied to FSL/ballistic reports). Gallery owns this render.

### C2. Mind map (`features/cases/MindMap.tsx`, new `{kind:'mindmap'; id}` view)
- Hand-rolled radial SVG (no graph lib): central node = FIR no + identity; **13 fixed first-level branches** mirroring the headings; accused leaves coloured via `accusedStatusMeta`; banned-org/watchlist nodes RED; node thumbnails from `thumbsForCase`; evidence-image node ties to its `EvidenceRecord` status + witness count. Touch-friendly pan/zoom, large tap targets (iPad). Pure layout function unit-tested. Always reachable (decision 11).

---

## D · Document repository + on-demand import + offline extraction (§7) — merged module (`3→4`)
The §7-metadata and §7-extraction blueprints are **one module** (the critic flagged the `DocumentsPanel.tsx` name collision + duplicate `documents` migration). Landed in layers; each layer ships independently.

- **Layer 1 — store + manual:** `DocumentRecord { id, caseId, letterNo?, dateOnDoc?, type?, subject?, forwardingDate?, status?, linkedAccusedId?, linkedEvidenceId?, source: 'manual'|'index'|'filename'|'pdftext'|'ocr'|'llm', confidence?, blobRef? }`. Migration index 3 → `documents` table (`SCHEMA_VERSION=4`), queryable (feeds §9 letter-no search phase-2, heading-9 evidence letter-nos, §6 refs). `DocumentsRepository` + `DocumentsPanel` (manual add/edit). Document originals → `blob-store.ts` sidecar (`blobRef`); same byte-storage model as gallery.
- **Layer 2 — on-demand import + heuristics:** `ImportSource` interface, backends: universal `<input type=file multiple>`; desktop `showDirectoryPicker` (progressive); native `@capacitor/filesystem.readdir` (progressive). One-shot scan. Heuristic extractors (all **draft**): index-file (CSV/JSON/md) parser; filename convention (`date_type_reference.pdf`); optional per-case-by-case-number folder mapping → match existing case or offer to create.
- **Layer 3 — text + OCR:** lazy `pdfjs-dist` (text layer; `GlobalWorkerOptions.workerSrc` set in the same module as `getDocument`), lazy `mammoth` (.docx); `tesseract.js` (single-thread SIMD WASM worker, traineddata self-hosted + IndexedDB-cached, downscale-before-OCR, progress/cancel) when no text layer.
- **Layer 4 — opt-in local LLM:** `@mlc-ai/web-llm` (WebGPU, runtime `navigator.gpu` gate + explicit "download model ~2GB" consent, weights self-hosted same-origin + OPFS-cached), transformers.js single-thread WASM fallback. Reads OCR/text → proposes structured 13-heading + document fields as a **draft diff**.
- **Confirm/merge UI** (`{kind:'import'}` view): scan → per-case detected docs → per-doc field draft (source + confidence badges) → officer accepts/edits → writes `DocumentRecord`s + optional case-field patch (the 7 editable headings via `useCases.patch`; derived headings get underlying records created as drafts). **Nothing writes unconfirmed.** A new case can be created from a detected case-number folder.
- **Draft layer:** imported records carry a draft/confidence marker until accepted (no such flag exists today — built here). Accepted doc letter-no/date surface under the relevant headings (#9 evidence letter-nos, #11 court matters).

---

## Acceptance
V3-complete when, for **both** sample cases: every 13-heading field round-trips; the expert-report 2-day RED alert fires/clears; all §6 requests (incl. MLA/LR 45-day, FRRO/MEA 15-day) alert on expected-response; a case can be flagged priority and pin to the top; **global search** finds ULFA-I / accused / section / ref-no across cases; a printable A4 13-heading **briefing note** generates; deadlines **export to .ics**; the **mind map** renders 13 branches with colour-coded accused + RED banned-org nodes + linked exhibit thumbnails; the **gallery** stores photos tagged accused/PO/evidence; and **on-demand import** ingests letter numbers/dates/subjects from files as drafts the officer confirms (heuristics + OCR + opt-in local LLM, fully offline).
