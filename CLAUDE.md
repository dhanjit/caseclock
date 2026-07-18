# CaseClock — Claude Code notes

Local-first, encrypted statutory-deadline cockpit for Indian police
investigators (iPad-first). Monorepo: `apps/app` (the PWA/Capacitor app),
`apps/landing` (marketing site). Product spec is **LOCKED** in
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md); read it before changing rules
engine or UI behavior.

## Commands

```bash
pnpm dev         # app dev server (5173)
pnpm test        # vitest: rules engine, crypto envelope, storage pipeline
pnpm typecheck
pnpm build       # bundle-ocr + tsc + vite build → apps/app/dist
pnpm --filter @caseclock/app ios:sync   # pnpm build && cap sync ios — REQUIRED before any Xcode run
pnpm --filter @caseclock/app ios:open
```

## Ship surfaces — see [docs/DEPLOY.md](docs/DEPLOY.md) for the full runbook

| Surface | How it deploys |
|---|---|
| `caseclock.dhanjit.me` (landing, worker `caseclock-landing`) | **auto** on push to main (Cloudflare Git integration) |
| `app.caseclock.dhanjit.me` (PWA, worker `caseclock-app`) | manual: `cd apps/app && pnpm build && npx wrangler deploy` |
| iPad native (TestFlight) | Xcode archive → App Store Connect; OTA (Capgo) installed but disabled |

Facts that are easy to get wrong:

- App Store Connect record + `PRODUCT_NAME` = **CaseFiles** (store name was
  taken); on-device display name = **CaseClock**; bundle id
  `me.dhanjit.caseclock`; Apple team `9C4V758A55` (paid — ignore stale free-team
  cert `2ZNP95QF26`).
- Every App Store upload needs a bumped `CURRENT_PROJECT_VERSION` (build no.).
- `caseclock.dhanjit.me/privacy` is referenced by App Store Connect — keep it
  live and truthful.
- `wrangler login` is browser-OAuth and **cannot be completed from Claude's
  sandbox** (callback can't reach it). Ask the owner to run it in their
  terminal; the token then works for Claude's shells too.

## Conventions

- TDD; tests colocate as `*.test.ts`. Never weaken the crypto/persistence
  invariants (no plaintext at rest, atomic vault writes with `.bak`/`.tmp`
  recovery — see `apps/app/src/db/fs-sink.ts`).
- The native WebView serves assets locally: web CSP (`public/_headers`) and the
  service worker do not apply there; native hardening goes in
  `capacitor.config.ts` / Info.plist.
- Don't flip `server.iosScheme` / storage location after data exists on
  devices.
