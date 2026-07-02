import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "me.dhanjit.caseclock",
  appName: "CaseClock",
  // The same Vite build (the in-browser SQLite-wasm + AES-GCM vault app) is
  // wrapped by Capacitor; only the vault persistence sink differs (Filesystem
  // on native vs OPFS on web), behind the repo interface.
  webDir: "dist",
  android: {
    // Prevent the OS task-switcher snapshot from leaking case text (PLAN §6.8).
    // FLAG_SECURE is applied at runtime; see the native hardening in M10.
  },
  ios: {
    // Dark cold-launch background so there's no white flash before the app paints
    // (the PWA's known nit). Matches the app's #0b1120 dark base.
    backgroundColor: "#0b1120",
  },
  server: {
    androidScheme: "https",
    // Pin the iOS WebView origin (→ capacitor://localhost). OPFS *and* the native
    // Filesystem vault are origin-partitioned, so this MUST stay fixed once any
    // device holds data — flipping it orphans the vault permanently. Pinned
    // explicitly so a future Capacitor default change can't silently move the
    // origin out from under existing data.
    iosScheme: "capacitor",
  },
};

export default config;
