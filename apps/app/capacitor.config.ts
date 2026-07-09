import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "me.dhanjit.caseclock",
  appName: "CaseClock",
  // The same Vite build (the in-browser SQLite-wasm + AES-GCM vault app) is
  // wrapped by Capacitor; only the vault persistence sink differs (Filesystem
  // on native vs OPFS on web), behind the VaultSink seam (src/db/sink.ts).
  webDir: "dist",
  android: {
    // Prevent the OS task-switcher snapshot from leaking case text (PLAN §6.8).
    // FLAG_SECURE is applied at runtime; see the native hardening in M10.
  },
  server: {
    androidScheme: "https",
    // iOS uses the default capacitor://localhost. Storage is NOT origin-scoped
    // on native (Filesystem sink), but never change the scheme after shipping —
    // anything origin-keyed (e.g. future localStorage) would be orphaned.
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#0b1120",
      launchShowDuration: 500,
      launchFadeOutDuration: 200,
    },
    // Capgo OTA ships DISABLED. The owner activates it in Task 14 via
    // `npx @capgo/cli init` (account + API key required). Until then the
    // updater plugin is inert; notifyAppReady() is still called (harmless).
    CapacitorUpdater: {
      autoUpdate: false,
    },
  },
};

export default config;
