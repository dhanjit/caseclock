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
  server: {
    androidScheme: "https",
  },
};

export default config;
