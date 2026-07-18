# DEPLOY.md — how CaseClock ships (all three surfaces)

> The ops runbook. Product/architecture live in [README](../README.md) /
> [PLAN.md](PLAN.md); the iOS bring-up history lives in
> [ios-native-handoff.md](ios-native-handoff.md). This file is only *how things
> get to users*, and it supersedes the older TestFlight notes in the handoff.

## Topology

One monorepo, three ship surfaces:

```
github.com/dhanjit/caseclock
│
├── apps/landing/ ──(auto: push to main)──▶ Worker caseclock-landing ─▶ caseclock.dhanjit.me
│                                            (root wrangler.toml)        marketing + /privacy
│
├── apps/app/ ────(manual: wrangler)──────▶ Worker caseclock-app ─────▶ app.caseclock.dhanjit.me
│      │                                     (apps/app/wrangler.toml)    hosted PWA
│      │
│      └─(Capacitor wrap)─▶ Xcode archive ─▶ App Store Connect ───────▶ TestFlight (iPad)
│                                             native build, local assets — does NOT load the PWA URL
```

The native app bundles the same `dist/` the PWA serves, but locally — a
TestFlight install works fully offline and is **not** updated by a web deploy.

## 1. Landing — `caseclock.dhanjit.me` (auto-deploy)

- Config: root [`wrangler.toml`](../wrangler.toml) → worker `caseclock-landing`,
  serves `apps/landing/` as static assets. No build step (raw HTML).
- **Git-connected** (Cloudflare Workers Builds, set up 2026-07-17): every push
  to `main` auto-deploys. Build command: *(empty)*; deploy command:
  `npx wrangler deploy`; root directory: `/`.
- Manual fallback: `npx wrangler deploy` from the repo root.
- `/privacy` (`apps/landing/privacy.html`) is the **App Store Connect privacy
  policy URL** — TestFlight external testing and any App Store submission point
  at it. Don't remove or rename it; keep its "no collection" claims true.

## 2. Hosted PWA — `app.caseclock.dhanjit.me` (manual)

```bash
cd apps/app
pnpm build            # bundle-ocr + tsc + vite build → dist/
npx wrangler deploy   # worker caseclock-app, serves dist/ (SPA fallback)
```

Not Git-connected (deliberate for now — connect it the same way as the landing
if wanted). Security headers/CSP come from `apps/app/public/_headers`, which
Cloudflare parses out of the assets dir; they do **not** apply inside the
native WebView.

### Cloudflare auth

`wrangler login` (browser OAuth) persists for months in
`~/Library/Preferences/.wrangler/`; occasional re-login is normal when the
refresh token lapses. **Claude Code cannot complete this login** — the OAuth
callback to `localhost:8976` can't reach its sandbox — so when auth is needed,
the owner runs `npx wrangler login` in a normal terminal, then any shell
(including Claude's) is authed.

## 3. Native iOS → TestFlight

### Identity (do not drift)

| Thing | Value |
|---|---|
| Bundle id (everywhere) | `me.dhanjit.caseclock` |
| Apple Developer team (paid, Individual) | `9C4V758A55` — dhanjitdas1@gmail.com |
| App Store Connect record / product name | **CaseFiles** ("CaseClock"/"App" were taken on the store; `PRODUCT_NAME = CaseFiles` in the pbxproj) |
| On-device name (`CFBundleDisplayName`) | **CaseClock** |
| Versions (pbxproj) | `MARKETING_VERSION` (user-facing, e.g. 1.0) + `CURRENT_PROJECT_VERSION` (build no.) |
| Export compliance | pre-answered: `ITSAppUsesNonExemptEncryption = false` in Info.plist |

Ignore any `Apple Development: Dhanjit Das (2ZNP95QF26)` cert — that's the old
*free* personal team, not the paid team. Automatic signing on team `9C4V758A55`
is the path; no Fastlane, no manual certs.

### Ship a build

```bash
pnpm --filter @caseclock/app ios:sync   # pnpm build && cap sync ios — ALWAYS before archiving
pnpm --filter @caseclock/app ios:open   # opens Xcode
```

In Xcode: bump **build number** (`CURRENT_PROJECT_VERSION`) — every upload
needs a higher one for the same marketing version — then
**Product → Archive → Distribute App → App Store Connect → Upload**.
Processing on Apple's side takes ~5–15 min before the build is usable in
TestFlight.

### Distribute (TestFlight)

- **External testing** is the only way to get a shareable
  `testflight.apple.com/join/…` public link. One-time prerequisites, all in
  App Store Connect → TestFlight:
  - **Test Information** filled: beta description, feedback email
    (`dhanjitdas1@gmail.com`), privacy policy URL
    (`https://caseclock.dhanjit.me/privacy`), review contact.
  - A group (e.g. "Friends") with the build added → first build triggers
    **Beta App Review** (~hours–1 day, one-time per version; later builds of
    the same version usually clear in minutes).
  - Then enable the group's **Public Link** and share it. Testers install the
    TestFlight app, open the link, done. Public link keeps serving the latest
    approved build.
- **Internal testing** is instant (no review) but has no link — testers must be
  added as App Store Connect users (Users and Access), which grants limited
  account access. Fine for yourself; not for handing out.
- TestFlight builds expire after **90 days** — upload a fresh build before then
  for active testers.
- Review notes worth repeating on submissions: fully local app, no server/
  account; passphrase is user-chosen; demo cases auto-load on first run.

### OTA (Capgo) — present but OFF

`@capgo/capacitor-updater` is a dependency and `CapacitorUpdater.autoUpdate`
is `false` in `capacitor.config.ts` — the plugin is inert. Activation
(`npx @capgo/cli init`, account + API key) is the handoff's Task 14, still
deferred. Until then, **every** app change reaches TestFlight users only via a
new archive/upload. After activation, web-layer changes go OTA; native
plugin/dep changes still need a TestFlight build.

## Not shipped

Android APK: planned (landing buttons stubbed), no build pipeline yet.
