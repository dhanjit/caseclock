# PLAN.md — CaseClock v1 (Core Cockpit)

> Build plan for **CaseClock** — a local-first, single-user, encrypted statutory-deadline + case-supervision cockpit for Indian police investigators.
> **Decisions locked:** name = **CaseClock** (`caseclock.dhanjit.me`) · scope = **Core cockpit** · legal defaults = **state-agnostic + configurable**.
> Authoritative design context: [RESEARCH.md](RESEARCH.md). This file is the *how/when*; RESEARCH.md is the *what/why*.

> **Rev 2 — patched after a 5-lens adversarial review** (scope/sequencing, data-model+rules, security, legal-fidelity, tech-feasibility). Material changes:
> 1. **Sequencing:** added **M0.5 encrypted-Wasm + native-SQLCipher + mobile-alarm spike**; the **agenda/AlertState state machine** now lands *before* the dashboard that consumes it; the **web↔native cipher round-trip** moved to the Android milestone (it can't run before Android exists); **types split from repositories** so the rules engine can start against an in-memory repo.
> 2. **Schema:** added the missing anchor columns the in-scope clocks need (UAPA PP-report, sanction Rule-3/4, appeal forum + death-sentence, accused first-appearance) + a working-day/holiday basis + a deadline **reconcile contract** that preserves snooze/ack.
> 3. **Rules:** mutually-exclusive UAPA-vs-BNSS guards; **default-bail modeled as states** (claimable / extinguished-by-filing / approaching), not a bare countdown; UAPA PP-report hard day-90 boundary (PP, not IO); appeal split by forum×outcome×death-sentence; added efir-3day, sexual-offence, s.479, discharge rules to the corrected scope.
> 4. **Crypto honesty:** biometric is an **accelerator over** the Argon2id passphrase (never a replacement); wipe-after-N and duress are scoped to what they actually defend (live guessing, not an imaged device); **passphrase entropy floor + SENSITIVE-class Argon2id** is named as the load-bearing control; export header bound as **AAD** with a downgrade floor + rollback guard.
> 5. **Stack:** **Capacitor 8** (GA Dec 2025); encrypted-Wasm flagged as a custom build with a fallback; cross-platform cipher format chosen explicitly; OPFS needs **no COOP/COEP** (documented so it isn't broken later).

---

## 0. Scope — what v1 is and isn't

**IN (v1 Core cockpit):**
- Manual case capture (progressive wizard) + "my supervised cases" list.
- Rules engine computing the high-consequence statutory clocks:
  - Chargesheet **60/90-day default-bail** clock (BNSS 187(3), anchored on **first remand**), modeled as **states** (see §4), with manual track override for the "10-years" edge.
  - Police-custody **40/60-day** window (band-guarded, same discriminator as chargesheet).
  - **24h production** as a true *timestamp* clock (informational; carries "excludes journey time" + "first production in person").
  - **e-FIR 3-day** signature check.
  - **UAPA** track: 90→180 extension governed by the **PP-report-before-day-90** boundary + **s.45 sanction** (Rule 3 / Rule 4, *working-day* basis). UAPA rules **override** the ordinary 60/90 (mutually-exclusive guards).
  - Bail-hearing prep + court-hearing prep; **s.479** undertrial-release thresholds (1/3 first-timer, 1/2 general).
  - Victim **90-day** update (193(3)(ii)), document supply **14d**, committal, judgment **30/45**, **appeal** (forum×outcome×death-sentence, Limitation-Act-sourced, **condonable**), discharge-60 (directory).
  - Sexual-offence **2-month investigation** + **2-month trial** clocks, scoped to **BNS 64–68/70/71 + POCSO 4/6/8/10 (s.69 excluded)**, severity "directory".
  - Supervisory **review-overdue**, **case-untouched-N-days**, daily caseload digest.
- Bail track + UAPA track + supervisory-note timeline + **context-restore header** on reopen.
- **Agenda (system of record)**: Today/Upcoming/Overdue computed every app open, with persistent statutory OVERDUE + snooze/ack state machine.
- **Dashboard** (consumes agenda) + **Review view** (crime-conference mode).
- **Alerts**: in-app agenda (primary, web+mobile) + best-effort mobile OS notifications (bounded daily-OVERDUE run; see §8).
- **Security**: whole-file-encrypted SQLite, Argon2id (SENSITIVE-class) two-key envelope with **enforced passphrase entropy floor**, biometric as a warm-session accelerator, auto-lock, honestly-scoped wipe-after-N, **encrypted offline export/import** (the only backup path).
- **Settings**: configurable cadences/thresholds, **holiday calendar / working-week**, auto-lock timeout, wipe-after-N, passphrase policy; state-agnostic defaults.
- **Landing page** on Cloudflare at `caseclock.dhanjit.me` (PWA install + direct APK; store buttons stubbed).
- **Android** build via Capacitor (APK). iOS scaffolded, built post-v1.

**OUT (deferred to v2), each surfaced honestly so the officer is never falsely reassured:**
- Full **NSA / state-PSA** preventive-detention track. **A missed NSA clock voids the detention** — so v1 shows a **non-dismissable "NSA/PSA clocks are NOT tracked in this version — track manually"** banner whenever a preventive-detention flag is set. (Model leaves an additive migration seam.)
- **UAPA 30-day police-custody cap** (distinct from the BNSS 15-day window) — deferred; noted here so it isn't assumed present.
- **Mercy-petition** 30/60-day clock — deferred.
- Deep court/prosecution workflows (witness-securing pipeline, attachments/blob store, agency-coordination depth).
- Human-readable **handover snapshot** export (encrypted full export ships in v1; pretty handover doc is v2).
- Any **LLM** assist.
- Play Store / App Store **submission** (APK + PWA cover v1).

**Cut-lines if time-boxed** (drop in this order; each still leaves a usable app):
1. **Review VIEW** (the dedicated screen) — *but the review-overdue rule, `next_review_date`, long-pending buckets, and `reason_for_delay` are NOT cuttable: they feed Cases-needing-attention and context-restore.*
2. Court-hearing-prep depth → 3. M5b secondary tabs → 4. iOS scaffold.
**Duress passphrase** is **not in the default cut chain — it is OUT of v1 unless its mechanics ship correctly** (see §6.5). The chargesheet/default-bail + UAPA clocks, context-restore, dashboard agenda, and encryption are **non-negotiable core**.

---

## 1. Tech stack (pinned intent)

| Layer | Choice | Notes |
|---|---|---|
| Build/app | Vite 5 + React 18 + TypeScript 5 (strict) | PWA day one. |
| Native shell | **Capacitor 8** (GA Dec 2025) — `@capacitor/core@^8`, `/android`, `/ios` | Needs **Node 22+**; iOS uses SPM (CocoaPods deprecated). Chosen over Cap 7 because the load-bearing `@capacitor-community/sqlite@^8` needs core ≥8, and iOS is deferred anyway. **No bare "7."** Hard-pin every `@capacitor/*` + plugins to their ^8 line. |
| UI | Tailwind CSS 3 + shadcn/ui (Radix) + lucide-react | Identical web ↔ WebView. |
| Routing | React Router (data router) | Web + WebView. |
| State | Zustand (UI/session) | Keep light. |
| DB (both targets) | **`@sqlite.org/sqlite-wasm`** (official, current SQLite) run **in-memory** in a **Web Worker** | Same wasm runs on web and in the Capacitor WebView. **DECIDED at M0.5** — replaces the custom encrypted-Wasm build (de-risked). Exclude from Vite dep pre-bundling so the `.wasm` serves with the right MIME. |
| Encryption-at-rest | Whole serialized DB → **one AES-256-GCM vault blob** (DEK wrapped by Argon2id KEK), persisted to **OPFS (web)** / **`@capacitor/filesystem` (native)** | `src/crypto/envelope.ts`. No SQLCipher; no cipher-portability problem. OPFS async API needs **NO COOP/COEP**. |
| Crypto | WebCrypto (AES-256-GCM) + `libsodium-wrappers` (Argon2id) | Audited primitives. |
| Keys/lock | `@capacitor/preferences` + secure-storage/Vault (Keychain/Keystore, StrongBox where available); WebAuthn PRF **additive only** + passphrase on web | Hardware-backed wrap; **passphrase (Argon2id) is the mandatory path**. |
| Notifications | `@capacitor/local-notifications@^8` (mobile OS alarms) + SW `showNotification()` best-effort (web) | No server ⇒ no web push. |
| Dates | `date-fns` on **local calendar dates** for day-counts + a **working-day helper** (skip weekends + configurable holiday list) for the s.45 sanction clocks; **timestamps** only for sub-day clocks (24h production) | Off-by-one here is the worst bug. |
| Validation | Zod (forms + import-file *post-decrypt* schema validation) | Header integrity is enforced by AAD, not Zod (§6.6). |
| Tests | Vitest (unit, esp. rules engine) + Playwright (smoke) | Golden-date tests for every clock; cipher round-trip; downgrade/rollback; no-egress. |
| Landing | Astro static site on Cloudflare Workers static assets | Separate `apps/landing`. |
| Lint/format | ESLint + Prettier + typecheck in CI | Solo-dev guardrails. |

**Pin exact versions at scaffold; commit the lockfile.** Audit the SQLite/crypto deps (the supply-chain-sensitive ones) and use the `--ignore-scripts` posture per standing infra prefs.

---

## 2. Repo structure

```
caseclock/                         # the repo (git init here)
├─ docs/
│  ├─ RESEARCH.md  PLAN.md
│  ├─ legal-rules.md               # frozen source: each rule_id → exact lawRef string → verified? → anchor → severity
│  └─ wasm-build.md                # pinned recipe for the encrypted wa-sqlite build (from M0.5)
├─ apps/
│  ├─ app/
│  │  ├─ src/
│  │  │  ├─ db/                    # sqlite worker, schema, migrations, repo interface, encrypted-repo, in-memory-repo
│  │  │  ├─ crypto/                # argon2id envelope, lock/unlock, wipe, export/import (AAD-bound)
│  │  │  ├─ rules/                 # PURE rules engine + RULE_REGISTRY + reconcile + tests
│  │  │  ├─ domain/                # types (no DB dependency) — consumed by rules + repos
│  │  │  ├─ alerts/                # agenda projection + AlertState state machine + OS-notification materializer
│  │  │  ├─ features/              # case-add, case-detail, dashboard, review, settings, lock-screen
│  │  │  ├─ components/ui/         # shadcn
│  │  │  ├─ lib/                   # date + working-day helpers, severity, formatting
│  │  │  └─ app.tsx, main.tsx, sw.ts
│  │  ├─ capacitor.config.ts, android/, ios/, vite.config.ts, tailwind.config.ts
│  └─ landing/                     # Astro → caseclock.dhanjit.me
├─ packages/rules-core/ (optional) # framework-free rules, importable by tests
├─ .github/workflows/ci.yml
├─ wrangler.toml                   # landing deploy
├─ package.json (pnpm workspaces)
└─ README.md
```

---

## 3. Data model (v1 SQLite schema)

Whole DB encrypted; **bold** columns drive alerts. Legal day-count dates = `TEXT` ISO **local date** (`YYYY-MM-DD`); sub-day clocks (24h production) = epoch-ms **timestamp**; ordering timestamps = epoch-ms.

- **`cases`** — identity: `id`, `fir_number`, **`fir_datetime`**, `police_station`, `district`, `zero_fir`, `efir`, **`efir_signed_date`**. Offence: `bns_sections`(json), `uapa_sections`(json), `other_acts`(json), **`punishment_band`**, **`track_override`**(60/90/null), `nia_scheduled`, `uapa_flag`, `seven_year_plus`, `sexual_offence_in_scope`(BNS 64–68/70/71 + POCSO 4/6/8/10 only). Supervision: `io_name/contact`, **`priority_heinous`**, **`status`**, **`last_touched_at`**, **`next_review_date`** *(denormalized from the latest `supervision_entries.next_review_date`, refreshed on insert; review-overdue reads this case-level field)*, `reason_for_delay`. Anchors: `arrest_datetime`(ts), **`first_remand_date`**(primary anchor), `custody_status`, `pc_days_used`, `chargesheet_filed_date`, `investigation_completion_date`. **UAPA track:** `uapa_pp_report_filed_date`(nullable date), `uapa_extension_granted`(nullable bool). **Sanction track:** `evidence_to_authority_date`, `rule3_recommendation_date`, `rule4_sanction_date`, `sanction_annexed`(bool). Court: `cognizance_date`, `accused_first_appearance_date`(anchors doc-supply-14), `court`, `trial_court_level`(Magistrate/Sessions/HC), `committal_order_date`, `charge_framing_date`, `arguments_concluded_date`, `judgment_date`, `outcome`(conviction/acquittal/…), `death_sentence`(bool), `acquittal_reason`, `appeal_forum`, `appeal_decision`. `created_at`, `updated_at`.
- **`persons`** — `id`, `case_id`, `role`, `name`, `aliases`(json), `identifiers`, `org_affiliation`, `prior_convictions`, **`first_time_offender`**, `other_pending_cases`(s.479/480 disqualifier), `custody_location`, `bail_status`, `secured_summoned_status`.
- **`hearings`** — `id`, `case_id`, **`hearing_date`**, `court`, `purpose`, `witnesses_due`(json), `exhibits_needed`, `what_court_wants_next`, `adjournments_used`, `outcome_note`.
- **`tasks`** — `id`, `case_id`, `title`, `owes_who`, **`due_date`**, `dependency_type`, `status`, `created_at`.
- **`supervision_entries`** — `id`, `case_id`, **`created_at`**, `entry_type`, `last_action_text`, `note_text`, `next_action_text`, `next_action_owes`, `next_review_date`, `compliance_of_last_order`. *(append-only; spine of context restore.)*
- **`deadlines`** — `id`, `case_id`, `rule_id`, `type`, **`due_at`**, `severity`(statutory-critical/statutory/statutory-condonable/court/soft/directory), `law_ref`, `lead_offsets`(json), `activates_at`, `state`(latent/active/overdue/done/na/extinguished/window-open), `verified`(confirmed/corrected/uncertain). *(derived; reconciled on edit — never hand-entered. See §4 reconcile contract.)*
- **`alert_state`** — key **(`case_id`,`rule_id`,`occurrence_date`)**, `state`(pending/snoozed_until/acknowledged/escalated), `os_notification_ids`(json).
- **`settings`** — single row: review buckets, untouched-days, lead-time overrides, **`holidays`(json) + `working_week`**, auto-lock seconds, **max-unlock minutes**, wipe-after-N, passphrase-policy (min zxcvbn score / diceware words), argon2 params, duress-enabled, defaults version.
- **`meta`** — `schema_version`, **`cipher_params_fingerprint`** (incl. `plaintext_header_size=0`, raw-key mode, kdf params), install salt ref, **`last_modified_seq`** (monotonic; rollback guard for imports).

**v2 seams (designed, not created in v1):** `nsa_track`, `agency_coordination`, `attachments`. Migration runner makes adding them additive.

---

## 4. Rules engine (the legal heart)

Each rule = a **pure function** `(case, persons, hearings, settings) → DeadlineEvent[]`, in a `RULE_REGISTRY` keyed by `rule_id`, each carrying `lawRef` (exact string), `verified` status, `severity`, default `leadOffsets`, and an **`applies(case)` guard**. Runs on app open, on any case edit (recompute that case), and in the rare SW periodic-sync. Background scheduling is never the source of truth.

**Reconcile contract (not delete+insert).** On recompute, **diff** new `DeadlineEvent`s against existing `deadlines` rows on (`case_id`,`rule_id`); **upsert** `due_at`/`state` in place; when an occurrence's date shifts, **migrate the `alert_state`** row to the new `occurrence_date` rather than orphaning it. Statutory OVERDUE **must never silently clear**. (Test: snooze a clock → edit an unrelated field → snooze survives; correct an anchor → ack/snooze migrates; OVERDUE persists.)

**Mutually-exclusive guards.** BNSS `chargesheet-60/90` and ordinary `default-bail-risk` carry `applies = !uapa_flag`; all `uapa-*` carry `applies = uapa_flag`. A UAPA case must produce **exactly one** chargesheet ceiling + **one** default-bail row, from the UAPA track. PC-window rules share the same band+override discriminator as chargesheet.

**Default-bail is a state machine, not a countdown.** Keyed on `chargesheet_filed_date` vs the 60/90-day risk date, emit:
- **APPROACHING** — clock running pre-deadline.
- **WINDOW-OPEN** — not filed, day ≥ 60/90 → "default bail now *claimable by the accused* — file chargesheet / be ready to oppose."
- **EXTINGUISHED-BY-FILING** — chargesheet filed on/before the day → resolved, no exposure.
Copy frames it as the accused's *claimable* right (indefeasible but must be claimed before a valid chargesheet is filed). Golden tests for chargesheet-filed-first extinguishment.

**UAPA PP-report boundary.** `uapa-pp-report-window` attributes the report to **PP (owesWho=PP, not IO)**; day 90 is a **hard boundary** — report filed/heard **on or after** day 90 = invalid → emit default-bail exposure. `default-bail-risk` (UAPA) = day 90 **unless** (`uapa_pp_report_filed_date` < day 90 **AND** `uapa_extension_granted`) → day 180 (absolute max). Golden tests: filed day 88 = valid → 180; day 90/91 = fatal → exposure.

**v1 rule set** (each gets golden-date tests): `efir-3day`, `production-24h`(timestamp), `chargesheet-60`, `chargesheet-90`, `default-bail-risk`(state machine), `pc-window-40`, `pc-window-60`, `uapa-90`, `uapa-180`, `uapa-pp-report-window`, `sanction-rule3`(7 *working* days from `evidence_to_authority_date`), `sanction-rule4`(7 *working* days from `rule3_recommendation_date`), `victim-90`(193(3)(ii)), `doc-supply-14`(anchored on `accused_first_appearance_date`), `committal-90`, `discharge-60`(directory caveat), `judgment-30/45`, `sexual-offence-invest-2mo`, `sexual-offence-trial-2mo` (both directory, row-16 section guard), `s479-undertrial-release`(1/3 first-timer / 1/2 general, band arithmetic, death/life + multi-case exclusions), **appeal split**: `sessions-appeal-30`, `hc-appeal-60`, `hc-appeal-death-30`(Art.115(a) inversion), `acquittal-hc-90`, `acquittal-sessions-30` (all severity **statutory-condonable**, cite **Limitation Act** articles not BNSS), `bail-hearing-prep`, `court-hearing-prep`, `review-overdue`, `untouched-N`, `daily-digest`.

**Uncertain items** (`forensic-7yr+` rollout, `discharge-60`, long-pending buckets, state PSAs, bail-disposal timeline, the 10-year 60/90 edge) render with a **"verify before relying"** badge and are **never** presented as hard statutory bars; thresholds configurable. `forensic-7yr+` is a **checklist trigger, not a day-count**.

**`legal-rules.md` is a frozen source of truth.** A CI test asserts every registry rule has an entry **and that its `lawRef` string exactly matches** the table (so a *wrong-but-present* clause fails CI). Pinned corrected refs: e-FIR **173(1)(ii)**, victim **193(3)(ii)**, NSA approval **s.3(4)+proviso**, sexual-offence scope **BNS 64–68/70/71 + POCSO 4/6/8/10, s.69 excluded**.

---

## 5. Milestones / build order

Each milestone ends **green** (typecheck + tests + app runs) and is independently demoable. Domain **types** are framework-free and land at the end of M0, so the rules engine can be built and tested against an **in-memory repo** before encryption is finished — killing the "long no-demo runway."

| # | Milestone | Output | Verify gate |
|---|---|---|---|
| **M0** | Scaffold + types | pnpm workspace, Vite+React+TS+Tailwind+shadcn, **Capacitor 8** config (Node 22+), ESLint/Prettier, CI, docs moved in, `git init`; **framework-free `domain/` types** | `pnpm dev` serves a shell; CI green; types compile |
| **M0.5** | **De-risk spike (time-boxed)** | (a) **Encrypted wa-sqlite Wasm** opens in an OPFS worker with chosen cipher params, read/write passing; recipe pinned in `wasm-build.md`. (b) **Native `@capacitor-community/sqlite` SQLCipher** opens an empty DB with the *same* params on Android. (c) **One Android local-notification fires when the app is closed.** | All three proofs pass. **Failure on (a)/(b) ⇒ stack decision** (PowerSync's cipher fork, or decouple backup to an own-AES-GCM dump — §6.2 option b) before M1 |
| **M1** | Encrypted storage foundation | Web encrypted-SQLite worker + native capacitor-sqlite behind **one repo interface**; **throwaway in-memory repo** behind the same interface; Argon2id envelope; unlock/lock; lock-screen UI; `temp_store=MEMORY` pinned | Create→lock→unlock→read round-trips; wrong passphrase fails; in-memory repo swappable |
| **M2** | Repositories + CRUD | DB-backed repository fns for all v1 tables; seed/dev fixtures | Repository unit tests (run against both in-memory + encrypted impls) |
| **M3** | Rules engine | Pure rules + `RULE_REGISTRY` + reconcile contract + `legal-rules.md` + **golden-date tests** (built against in-memory repo/types) | **Explicit golden tests all pass:** (a) clock from **first-remand not arrest**, (b) exactly-10yr→90 track, (c) override forces 60, (d) UAPA overrides ordinary (one ceiling+one default-bail), (e) default-bail extinguishment-by-filing, (f) UAPA PP-report day-89 valid / day-90 fatal, (g) sanction working-day span over a weekend, (h) appeal death-sentence-Sessions=30 inversion, (i) day-of vs day-after off-by-one, (j) device-TZ-change recompute, (k) month-end/Feb/leap, (l) snooze survives unrelated edit / migrates on anchor change |
| **M4** | Case add wizard + list | Progressive wizard; live derived-track + default-bail-date preview; "my supervised cases" list (demoable early via in-memory repo, then encrypted) | Add a UAPA + an ordinary case; deadlines seed correctly |
| **M5** | Case detail **spine** + context restore | Read-only clocks strip, Overview, Timeline, **log-supervisory-note**, **context-restore header** | Reopen-after-gap shows correct restore block (last action / next action / overdue / what's next) |
| **M5b** | Secondary case-detail tabs | People / Hearings / Tasks / Bail / UAPA / Deadlines tabs; NSA "not tracked" banner when a preventive-detention flag is set | Each tab CRUDs; banner shows |
| **M6** | **Agenda + AlertState state machine** (system of record) | Agenda projection (Today/Upcoming/Overdue) from deadlines; per-(case,rule,occurrence) snooze/ack/**persistent-OVERDUE**; reconcile-safe | Agenda matches computed deadlines; OVERDUE never auto-clears; snooze/ack survive recompute |
| **M7** | Dashboard + Review view | Overdue(persistent)→Today→Needing-attention→Upcoming→Stats; crime-conference review mode (consume M6) | Dashboard + review group/sort correctly off the agenda |
| **M8** | Mobile OS-notification materializer | 30-day horizon, **severity-prioritized against iOS 64-cap**, **bounded daily-OVERDUE run** (re-materialized each open), Android **exact-alarm** check (`checkExactNotificationSetting`) + revocation recovery; snooze/ack via notification actions | On-device: a scheduled alarm fires when closed; snooze/ack updates agenda; OVERDUE re-notifies within the bounded horizon |
| **M9** | Encrypted backup | Export/import single file; **header bound as AAD**, downgrade floor, **rollback guard** (`last_modified_seq`), Zod post-decrypt; **web→web round-trip** test | Export→import restores identically on web; tampered header / lowered params / stale-rollback all rejected |
| **M10** | Security hardening | Auto-lock on background + idle + **`pagehide`/`freeze`** + **hard max-unlock**; **biometric as warm-session accelerator** (Argon2id mandatory on cold start/reboot/after N hrs — BFU vs AFU); **passphrase entropy floor + SENSITIVE-class Argon2id calibration**; wipe-after-N (honest scope); WebView `FLAG_SECURE`/app-switcher blur/disk-cache off/clear React state on lock; **duress decision** (ship decoy-DEK design or leave OUT) | Cold start requires passphrase; failed-attempts crypto-erase works (live-guess); background locks; weak passphrase rejected |
| **M11** | Android build + **cross-platform gate** + landing | Signed APK; **authoritative web↔native cipher round-trip hard gate**; Astro landing on Cloudflare at `caseclock.dhanjit.me` (PWA install + APK link) | APK installs + runs; **web export imports on Android (and reverse)**; landing live, links resolve |
| **M12** | Polish + a11y + verify | Empty/error states (incl. **Safari-incognito OPFS-unavailable** handled state), large tap targets, keyboard/contrast, final end-to-end verification, README | Full smoke pass on web + Android |

iOS (`cap add ios`, TestFlight; needs Mac + $99/yr Apple account) is a **post-v1** follow-up; the codebase stays iOS-ready throughout.

---

## 6. Security implementation checklist

**Principle: confidentiality is structural — data never leaves the device and is never plaintext at rest. The app's own crypto stands alone; OS full-disk encryption is not relied upon. Against an *imaged* device, the only load-bearing control is passphrase-entropy × Argon2id-cost — everything else (wipe-after-N, biometric, duress) defends weaker adversaries and is labeled as such.**

### 6.1 Storage — DECIDED at M0.5: in-memory SQLite + own-AES-GCM vault blob
The M0.5 spike landed on encrypting the **whole serialized SQLite database as one AES-256-GCM blob** (see `src/crypto/envelope.ts`), instead of a custom encrypted-Wasm SQLite + byte-compatible native SQLCipher. The live DB runs **in memory** (stock `@sqlite.org/sqlite-wasm`; a single officer's caseload is small — tens of MB at most); we persist a debounced encrypted snapshot to **OPFS (web)** / **`@capacitor/filesystem` (native)**. Crucially the *same* TS+wasm runs on web **and inside the Capacitor WebView** — one code path; only the persistence sink differs, behind the repo interface. No `@capacitor-community/sqlite`, no SQLCipher.
- **No plaintext at rest** — not even a SQLite header; the whole DB is one opaque ciphertext blob.
- Snapshot durability: write the encrypted snapshot **synchronously on each mutation** (fast for small data) + on `visibilitychange`/lock, so a crash between snapshots can't lose committed edits.
- Plaintext pages live only in memory while unlocked (same posture as SQLCipher); zero the DEK + drop the in-memory DB on lock.
### 6.2 Cipher format — RESOLVED: our crypto, not two cipher impls agreeing
The whole-blob AES-256-GCM format is the **same on web and native** (a universal primitive), so the web↔native byte-portability problem (RESEARCH §13.2 silent-restore-failure) **disappears** — and so does the custom-encrypted-Wasm-build risk. Export/import (§6.6) reuses this exact format. Proven at M0.5: a Node pipeline test (`src/db/sqlite-blob.test.ts`: SQLite⇄vault round-trip + tamper rejection) and an in-browser probe (sqlite-wasm under Vite + OPFS round-trip). The earlier SQLite3-Multiple-Ciphers legacy-param path is retained only as a documented fallback if in-memory ever proves too small for the caseload (it won't at this scale).
### 6.3 Key envelope
- `KEK = Argon2id(passphrase, per-install salt, **SENSITIVE-class** mem/iters, calibrated to slowest target within acceptable unlock latency)`; random 256-bit `DEK`; `wrapped-DEK = AES-256-GCM(KEK, DEK)`. Disk holds salt+nonce+wrapped-DEK+params, **never the DEK**. DEK only in worker memory while unlocked; zero KEK/DEK on lock/background.
### 6.4 Passphrase policy (the load-bearing control)
- Enforce an entropy floor (reject low zxcvbn score / mandate a diceware multi-word phrase). Document that a strong passphrase is the *only* thing protecting an imaged device.
### 6.5 App lock + biometric (accelerator, not replacement)
- Biometric gates a Keystore/Keychain key (StrongBox + `setUserAuthenticationRequired`, short validity) that wraps the **passphrase-derived KEK** — an **accelerator over** the passphrase path, never a stored plaintext-DEK that bypasses Argon2id. **Argon2id passphrase mandatory on cold start / after reboot / after N hours** (BFU vs AFU); biometric only re-unlocks a warm session.
- WebAuthn PRF (web) is **additive only** — HKDF-combined with the Argon2id output, never the sole KEK; require a **device-bound (non-synced)** credential if used (synced passkeys move secrets off-device). Passphrase path implemented first, PRF behind capability detection.
- Auto-lock: Capacitor `appStateChange→background` + web `visibilitychange`/`blur`/**`pagehide`/`freeze`** + idle timeout (default 60s, high-security shorter) + **hard max-unlock wall-clock**: close DB, zero keys. Documented best-effort on web ("DEK resident until process death" residual-risk row).
### 6.6 Export / import
- Bind the **entire header** (version, KDF id+params, salt, nonce, cipher suite) into the AEAD as **AAD** → any header tamper fails the GCM tag. **Refuse imports below a hardcoded version/param floor** (not whatever the header claims). Export KDF pinned to the same SENSITIVE Argon2id cost. **Rollback guard:** monotonic `last_modified_seq`/timestamp; warn/block importing an export older than the store. Separate strong backup passphrase; offline channels only. Tests: flipped version byte, lowered params, stale-but-valid rollback.
### 6.7 Wipe-after-N + duress (honest scope)
- Tamper-resistant signed counter in Keychain/Keystore; after N (default 10) delete wrapped-DEK + secure entry → crypto-erase. **Defends live on-device guessing only — NOT an imaged-device offline attack.** **No secure-element counter on web** → there, scope to "live-session, best-effort, resettable" or drop it. State this in §9/threat table.
- **Duress: OUT of v1 unless shipped as an indistinguishable same-KDF decoy-DEK unlock** that silently marks the real wrapped-DEK for destruction (no second stored verifier; ineffective once an image is taken — true of all crypto-erase). Otherwise omit.
### 6.8 Presentation-layer leaks
- Disable WebView disk cache; Android `FLAG_SECURE` + iOS app-switcher snapshot blur; clear in-memory React state on lock.
### 6.9 No egress
- No telemetry, no network calls from the app. CI asserts no external `fetch`/`XMLHttpRequest` in the app bundle.

### 6.10 Threat model — seized device (honest)
| Threat | Defense / honest limit |
|---|---|
| Device seized, **imaged** | Only AES-256 ciphertext + wrapped-DEK + no plaintext metadata. **Sole control = passphrase entropy × Argon2id cost.** Wipe-after-N/biometric/duress do NOT help here. |
| Offline passphrase brute-force | SENSITIVE-class Argon2id + enforced entropy floor. A weak passphrase defeats everything. |
| Coerced / lifted / sleeping-finger biometric | Defeats biometric; mitigated by Argon2id-mandatory on cold start/reboot/N-hrs (warm-session-only biometric). |
| Repeated **live** guessing | Wipe-after-N crypto-erase (mobile, tamper-resistant counter). |
| Secure-element extraction (Cellebrite/GrayKey-class) | Biometric is an accelerator, not a plaintext-DEK store → no Argon2id-free key path. |
| Tampered / downgraded / stale import | Header-as-AAD + param floor + rollback guard. |
| Residual plaintext (temp/WAL/cache/switcher) | `temp_store=MEMORY`, encrypted WAL, no intermediate plaintext DB, `FLAG_SECURE`/blur. |
| Live-process RAM capture while unlocked | DEK in worker memory, zeroed on lock; **best-effort** (JS/Wasm zeroization imperfect) — minimize key lifetime. |
| Cloud/server breach | No server exists. |
| Synced-passkey leak | PRF additive + device-bound only. |

---

## 7. Testing strategy

- **Rules engine = priority.** The explicit M3 golden-test checklist (above) is mandatory, each a required passing test. A wrong deadline is the worst defect.
- **Cipher round-trip:** **web→web** in CI at M9; **web↔native** as a hard gate at M11 (can't run before Android exists). Asserts identical params incl. `plaintext_header_size=0`, raw-key mode, WAL/temp encryption.
- **Export integrity:** AAD-bound header (flipped byte rejected), downgrade floor (lowered params rejected), rollback guard (stale-but-valid rejected), Zod post-decrypt.
- **Reconcile/AlertState:** snooze survives unrelated edit; ack/snooze migrates on anchor change; statutory OVERDUE never clears.
- **`legal-rules.md` doc-sync:** every registry rule present **and exact `lawRef` match**.
- **Repository** unit tests (both impls); **Playwright** smoke (add → deadline → note → reopen restore → lock/unlock).
- **No-egress** assertion.
- **Manual on-device checklist** (OS alarms can't be fully automated): Android exact-alarm fire + revocation recovery + OEM battery-killer note; iOS 64-cap prioritization; bounded daily-OVERDUE.

---

## 8. Alerts — platform reality

In-app agenda (M6) is the **system of record**, recomputed every app open (the guaranteed-attention moment); OS notifications (M8) are a **best-effort projection**. Honest ceiling: if the officer never opens the app **and** background notifications fail, a statutory deadline can pass silently → mobile is the strongly-recommended path for active tracking.
- **Mobile:** `@capacitor/local-notifications` exact alarms; **iOS keeps only the 64 soonest** → bounded 30-day horizon, severity-prioritized; **persistent "until acknowledged" is delivered as a bounded daily-OVERDUE run (e.g. 14 occurrences), cancel+reschedule each open** — not an OS guarantee. Android exact-alarm permission can be revoked (restarts app, deletes alarms) → `checkExactNotificationSetting()` on launch + re-materialize; OEM battery-killers can still kill alarms.
- **Web:** no server ⇒ no web push; Periodic Background Sync is Chromium-only/opportunistic/**absent on iOS/Safari** → **non-load-bearing** (documented in code). The agenda + a red badge on open is the reliable surface.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wrong legal day-count | Golden-date tests + frozen `legal-rules.md` exact-`lawRef` CI assertion + `verified?` badges; uncertain items never hard bars |
| Encrypted-Wasm build is a custom artifact | **M0.5 spike** with pinned recipe + fallback (PowerSync fork / own-AES-GCM backup) before committing to M1 |
| Cipher param drift web↔mobile (silent restore failure) | One pinned format (§6.2), `meta` fingerprint, round-trip test **written first (red)**, web↔native gate at M11 |
| iOS 64-cap / Android exact-alarm revocation | Bounded severity-prioritized horizon, re-materialize each open, `checkExactNotificationSetting()` |
| Web background notifications unreliable | Agenda is system-of-record; web background explicitly best-effort |
| Imaged-device attack | Passphrase entropy floor + SENSITIVE Argon2id as the *named* load-bearing control; wipe/biometric/duress scoped honestly |
| AlertState lost on recompute | Reconcile-by-upsert contract + migration of occurrence + tests |
| Capacitor version mismatch | Cap 8 pinned everywhere; Node 22+; plugins `^8` |
| Solo-dev scope creep | Strict cut-lines (Review VIEW only, machinery kept); NSA/PSA + attachments behind additive seams; in-memory repo kills the no-demo runway |
| Memory zeroization imperfect | Minimize key lifetime; unwrap in worker; overwritable typed arrays; residual-risk row acknowledged |
| Mac dependency for iOS | iOS deferred post-v1; Android + PWA cover launch |

---

## 10. Definition of done (v1)

- An officer can, on web and on an Android device: add cases manually; see correct, verified statutory countdowns (chargesheet/default-bail **as states**, UAPA 90→180 governed by the PP-report-before-90 boundary, sanction Rule-3/4 on a working-day basis, bail/court/victim/judgment/appeal); log supervisory notes; reopen a case after a gap and instantly see "where I left it / what's next / what's overdue"; get a daily digest + escalating alerts with persistent statutory OVERDUE; review caseload crime-conference style; be **warned that NSA/PSA is not tracked**; all data encrypted at rest behind a passphrase (+ optional biometric accelerator); back up/restore via an AAD-bound encrypted offline file.
- `caseclock.dhanjit.me` is live with PWA install + APK download.
- CI green: typecheck, lint, rules-engine golden tests, exact-`lawRef` doc-sync, cipher round-trip (web→web; web↔native at M11), export-integrity (AAD/downgrade/rollback), reconcile/AlertState, no-egress.
