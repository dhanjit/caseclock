# iOS native — handoff for the Mac session

> **Read this first, Claude.** This repo was taken from "bare PWA" to "polished,
> installable, fast-updating iPad **PWA**" on a Windows box (no Mac there). The
> next phase — wrapping it as a **native iOS app for TestFlight** — must happen on
> the Mac (Xcode). This file is the baton. Work top-to-bottom; the **Critical
> verifications** section is where the real risk is, not the happy path.

---

## ⏱ STATUS — 2026-07-17: **SHIPPED to App Store Connect.** Build 1.0 (1) uploaded; TestFlight external testing in progress. This file is now the historical baton — current release process lives in [DEPLOY.md](DEPLOY.md), which supersedes the "Ship to TestFlight" section below.

## ⏱ STATUS — 2026-07-09 (historical): the **code layer is built**. Only Xcode/device/account work remains.

Executed on `claude/ipad-os-app-readiness-d59f08` (16 commits; **234 tests green**, typecheck clean, `pnpm build` succeeds). Full task-by-task detail + the exact code lives in [docs/superpowers/plans/2026-07-09-ipad-native-app.md](superpowers/plans/2026-07-09-ipad-native-app.md).

**Done in code (no Mac needed, already committed):**
- Native deps installed + pinned (`@capacitor/ios`, `local-notifications`, `splash-screen`, `privacy-screen`, `@capgo/capacitor-updater`, dev `sharp`/`@capacitor/assets`); `capacitor.config.ts` has the `SplashScreen` (dark `#0b1120`) + `CapacitorUpdater` (autoUpdate off) blocks.
- **Filesystem vault sink** behind a new `VaultSink` seam (`src/db/sink.ts` / `fs-sink.ts`) — the durable-storage fix for WKWebView. Web still uses OPFS; native uses `@capacitor/filesystem` (vault → `Library`, blobs → `LibraryNoCloud`). A review caught + we fixed a **silent-vault-loss bug** here (fail-loud on I/O error).
- **Full M8 notification system**: pure `planNotifications` materializer (30-day horizon, iOS-64-cap severity-prioritized, bounded 14-day OVERDUE digest, snooze/ack), `alert_state` table, LocalNotifications adapter (cancel+reschedule), tap→case deep-link + locked-vault ack/snooze queue, the unlock/data-change pipeline, a Settings toggle + test-alarm button. A review caught + we fixed a **cross-occurrence keying collision** (co-accused / same-day hearings) and two race/isolation issues.
- App icon (1024²) + dark splash (2732²) rendered to `assets/` from `icon-square.svg`.

**Done since (2026-07-12, on the Mac — no Xcode needed):**
- ~~`pnpm exec cap add ios`~~ — `ios/` scaffolded, synced, and committed (5 plugins picked up via SPM).
- ~~`capacitor-assets generate --ios`~~ — icon + light/dark splash rendered into `Assets.xcassets`, committed.
- ~~HIGH deferred finding (code half)~~ — `unlock()` now retries the `.bak` generation on decrypt failure via a new `VaultSink.loadVaultBackup` seam, and self-heals the primary on the post-unlock persist; `createVault()` routed through the write mutex; `missing()` matches the structured `OS-PLUG-FILE-0008` code. The **on-device half remains**: add the "corrupt-the-primary → confirm .bak recovery" row to the Task 12 matrix.

**NOT done — needs full Xcode (App Store, not just CLT), your iPad, and Apple/Capgo accounts:**
1. Xcode signing (`pnpm run ios:open`) → run on the iPad → **the vault-durability matrix** (kill / reinstall / reboot / corrupt-primary→.bak recovery — the #1 risk below), plus splash/blur/auto-lock checks. *(plan Task 12)*
2. On-device **notification verification** (permission, killed-app alarm, deep-link, ack, snooze, toggle). *(plan Task 13)*
3. **Capgo OTA activation** — `npx @capgo/cli init` (your account/API key), verify the OTA loop. *(plan Task 14)*
4. **TestFlight** — archive, upload, deliver to the friend's iPad. *(plan Task 15)*
5. Remember `pnpm build && pnpm exec cap sync ios` before every Xcode run — the scaffold ships whatever `dist/` it last copied.

---

## Where things stand (original baton — background)

- **Product:** CaseClock — local-first, encrypted statutory-deadline cockpit (see [PLAN.md](PLAN.md) / [RESEARCH.md](RESEARCH.md)). iPad Pro is the target device.
- **PWA is live** at `app.caseclock.dhanjit.me` (Cloudflare). The native app loads the *same* `dist` build inside a Capacitor WebView — same UI, same code.
- **Capacitor 8 is already configured.** [`apps/app/capacitor.config.ts`](../apps/app/capacitor.config.ts): `appId = me.dhanjit.caseclock`, `appName = CaseClock`, `webDir = dist`. *(The `ios/` scaffold has since been generated and committed — `apps/app/ios/`.)*
- **Owner now has:** a Mac (primary machine), an iPhone, an iPad Pro, and an **enrolled Apple Developer account**. So: build/sign/run in Xcode locally — **no cloud CI, no Fastlane, no manual certificates.** Automatic signing in Xcode is the path.
- **Goal of this phase:** native CaseClock installed on the owner's iPhone/iPad, then delivered to **one friend's iPad via TestFlight**. Plus keep "fast updates" (Capgo OTA for the web layer).

## Mac prerequisites (check before starting)

- Xcode (current) + Command Line Tools; open Xcode once, accept license.
- Apple ID added in **Xcode → Settings → Accounts** (the Apple Developer account).
- Node 22+ and pnpm (`corepack enable`). CocoaPods is **not** required — Capacitor 8 iOS uses **SPM**, resolved by Xcode.
- `git pull` this branch (`claude/nervous-lamarr-55cf7b`) and `pnpm install`.

## Happy path — get it running on a device

```bash
cd apps/app
pnpm add @capacitor/ios@^8           # pin to the ^8 line (matches @capacitor/core@^8)
pnpm build                            # produce dist/ (the web app)
pnpm exec cap add ios                 # scaffold apps/app/ios/ (commit it)
pnpm exec cap sync ios                # copy dist/ + plugins into the native project
pnpm exec cap open ios                # open in Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → check *Automatically manage signing* → pick your **Team**. Confirm the bundle id is `me.dhanjit.caseclock` (must match `capacitor.config.ts`).
2. Confirm **iPad** is in *Supported Destinations* (Capacitor defaults to iPhone+iPad — keep both; iPad is the target).
3. Plug in the iPhone/iPad, select it, press **▶ Run**. Trust the dev cert on the device if prompted (Settings → General → VPN & Device Management).
4. Smoke test: create a vault, add a case, lock/unlock. **Watch the persistence check below.**

`cap sync ios` (or at least `cap copy ios`) must be re-run after **every** `pnpm build`, or the native app ships a stale web bundle.

## Critical verifications (the actual risk — do not skip)

1. **Vault persistence in WKWebView.** The storage layer ([`apps/app/src/db/sqlite-blob.ts`](../apps/app/src/db/sqlite-blob.ts), `LocalDbClient`) persists the encrypted vault to **OPFS** (`navigator.storage.getDirectory`). OPFS exists in iOS WKWebView (iOS 16.4+/17+), so it *should* work — **but verify on-device that data survives an app kill AND an app reinstall/update.** [PLAN.md §6.1](PLAN.md) anticipated a native `@capacitor/filesystem` sink behind the same `DbClient` interface precisely as the fallback. If OPFS is flaky or wiped on update in the WebView, implement the Filesystem-backed client (the interface is already the seam — `createDbClient()` in `apps/app/src/db/index.ts`). **This is the #1 thing that can silently break the native app.**
2. **App origin / scheme.** Capacitor serves iOS from `capacitor://localhost` by default (`server.iosScheme`). OPFS/storage is partitioned by origin, so don't flip the scheme after data exists. Decide the scheme once, up front.
3. **CSP doesn't carry over.** The web CSP lives in [`apps/app/public/_headers`](../apps/app/public/_headers) (Cloudflare-served) and will **not** apply in the native WebView (assets are served locally). If you want CSP natively, add a `<meta http-equiv="Content-Security-Policy">` to `index.html` — but the origins differ (`'self'` = `capacitor://localhost`), so re-test the wasm/crypto/OSM-iframe under it, exactly like the web test did. Low priority vs persistence.
4. **Service worker is PWA-only.** [`apps/app/public/sw.js`](../apps/app/public/sw.js) (offline + fast-update) is for the hosted PWA. Natively, assets are bundled and updates come via Capgo/rebuild — the SW is redundant and may not register under `capacitor://`. Don't rely on it on native; don't fight it either.

## Native features — the reason to go native (wire after it runs)

These are the payoff over the PWA. Prioritize **local notifications** (the deadline alarms are CaseClock's whole point):

- **`@capacitor/local-notifications@^8`** — schedule the statutory-deadline alarms. This is **M8** in [PLAN.md §8](PLAN.md): 30-day horizon, **iOS keeps only the 64 soonest** (severity-prioritize), bounded daily-OVERDUE run re-materialized each open, snooze/ack actions. The agenda projection already exists (`apps/app/src/rules/agenda.ts` / the alerts layer) — feed it into a notification materializer. Add the `NSUserNotificationsUsageDescription` flow (request permission on first unlock).
- **App-switcher privacy blur** ([PLAN.md §6.8](PLAN.md)) — hide case text in the iOS app-switcher snapshot (overlay a blur view on `resignActive`).
- **Biometric (Face ID) as a *warm-session accelerator*** ([PLAN.md §6.5](PLAN.md)) — never a key path that skips Argon2id. Add `NSFaceIDUsageDescription`.
- **Splash/launch** — Capacitor splash screen plugin removes the blank cold-launch flash (the PWA's known nit); set the dark `#0b1120` background.

## Fast updates — Capgo OTA (owner chose "yes")

Push the **web bundle** over-the-air so most changes skip TestFlight entirely (native rebuild only when native code/plugins change).

```bash
cd apps/app
pnpm add @capgo/capacitor-updater
npx @capgo/cli@latest init            # creates the app in Capgo, wires the plugin
# Owner needs a Capgo account + API key (free tier or self-host). Then per release:
pnpm build && npx @capgo/cli@latest bundle upload
```

Wire auto-update (check on app resume → download → apply on next launch). Keep it from yanking the user mid-session (apply on cold start). Capgo is cross-platform — releases can be pushed from the Windows box too.

## Ship to TestFlight + the friend

1. In Xcode: **Product → Archive** → Organizer → **Distribute App → App Store Connect → Upload** (automatic signing). First upload may prompt to create the App Store Connect app record for `me.dhanjit.caseclock` (or create it in App Store Connect first).
2. App Store Connect → **TestFlight**. For one friend: **Internal Testing** is fastest if you add them to the team; otherwise **External** (add their email; needs a quick beta review for the first build).
3. Friend installs the **TestFlight** app on the iPad → opens the invite email/link → installs CaseClock. **iPad is fully supported** (Universal app).

## Gotchas

- Re-`cap sync ios` after every web change, or the native app is stale.
- Bundle id must stay `me.dhanjit.caseclock` everywhere (Xcode, capacitor.config, App Store Connect).
- OTA updates the **web layer only** — native plugin/dep changes still need a TestFlight build.
- Commit the generated `apps/app/ios/` project (the `.gitignore` already excludes its build artifacts: `ios/App/Pods/`, `ios/App/build/`).
- The Android path (`cap add android`) is **M11** in PLAN and orthogonal — don't conflate.

## Reference

- Build plan + milestones: [PLAN.md](PLAN.md) (M8 notifications, M10 hardening). Design brief: [RESEARCH.md](RESEARCH.md).
- This phase corresponds to PLAN's deferred "iOS (`cap add ios`, TestFlight; needs Mac + Apple account)" follow-up — now unblocked.
