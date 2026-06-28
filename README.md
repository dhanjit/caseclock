# CaseClock

> Local-first, single-user, **encrypted** statutory-deadline + case-supervision cockpit for **Indian police investigators**.
>
> Web first → Android → iOS, from one TypeScript codebase. **No cloud. All data stays on the device, encrypted at rest.**

CaseClock computes the Indian statutory clocks that the official systems (CCTNS/ICJS) ignore — the **60/90-day chargesheet → default-bail** clock, the **UAPA 90→180** extension governed by the PP-report-before-day-90 boundary, the **s.45 sanction** clocks, bail/court/victim/judgment/appeal — alerts ahead of each, and **restores full case context** the moment a case is reopened after a gap. Built on the law in force: **BNSS / BNS / BSA 2023**, **UAPA 1967**, **NIA Act 2008**, **NSA 1980**.

It is **India-specific** and **state-agnostic** (central-law defaults that work in any state; state-specific knobs — PSAs, review cadences, forensic rollout — are configurable).

## Status

Early build. See [`docs/PLAN.md`](docs/PLAN.md) for the milestone plan and [`docs/RESEARCH.md`](docs/RESEARCH.md) for the verified design brief (every statutory deadline adversarially fact-checked against current law).

- **M0 — scaffold** ✓ (Vite + React + TS + Tailwind v4, Capacitor 8, CI)
- **M0.5 — encrypted-storage spike** ✓ (decided the storage architecture; see below)
- **M1+** — in progress

## Architecture (decided at M0.5)

- **App:** Vite + React + TypeScript PWA, wrapped with **Capacitor 8** for Android/iOS. The *same* code runs on web and inside the Capacitor WebView.
- **Storage:** stock `@sqlite.org/sqlite-wasm` run **in-memory**; the whole serialized DB is encrypted as **one AES-256-GCM vault blob** (DEK wrapped by an **Argon2id** KEK) and persisted to **OPFS** (web) / **Filesystem** (native). No plaintext at rest — not even a SQLite header. One portable format across web ⇄ mobile, so there is no cross-platform cipher-compatibility problem.
- **Security:** passphrase (Argon2id, entropy-floored) is the load-bearing control; biometric is a warm-session accelerator, never a key path that skips Argon2id. Header bound as AAD with a downgrade floor; encrypted offline export is the only backup path.
- **Alerts:** a pure rules engine → in-app "Today/Upcoming" agenda (system of record) + best-effort mobile OS notifications.

## Develop

```bash
corepack enable    # or: npm i -g pnpm   (Node 22+ required)
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # rules engine + crypto envelope + storage pipeline
pnpm typecheck
```

`?spike=1` mounts the M0.5 storage spike in-browser.

## Repo layout

```
apps/app       # the PWA / Capacitor app
apps/landing   # marketing site → caseclock.dhanjit.me (PWA install + APK download)
docs/          # REQUIREMENTS.md (V3 spec, LOCKED), V3-BUILD-PLAN.md (V2→V3 delta),
               # sample-cases.md (+ spec/ source docx), RESEARCH.md, PLAN.md, legal-rules.md
```

## Privacy

No telemetry, no servers, no cloud sync. The only data egress is a user-initiated, separately-encrypted, offline export file. Trade-off: no remote wipe / no server backup — mitigated by encryption, biometric app-lock, wipe-after-N, and the encrypted export.
