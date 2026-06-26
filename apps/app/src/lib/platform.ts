/**
 * Platform/PWA glue for the installed iPad app: service-worker registration
 * (offline + fast updates) and persistent-storage requests. All best-effort —
 * nothing here is load-bearing, and a browser without these still runs the app.
 */

/** True when running as an installed PWA (home-screen / standalone), not a tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari exposes navigator.standalone; everyone else exposes the media query.
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/**
 * Ask the browser to keep on-device storage (the OPFS vault) from being evicted.
 * iOS/Safari can clear site storage under pressure or after disuse; for a
 * local-first app holding the *only* copy of case data, persistence matters.
 * Granting is at the browser's discretion (installed PWAs are favoured) — we
 * just request and move on. Safe to call repeatedly.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Register the offline-shell service worker (production only). The SW is
 * network-first for navigation, so a redeploy goes live on the next open; we
 * also nudge an update check when the app returns to the foreground so a
 * long-lived installed PWA doesn't sit on an old service worker.
 *
 * Dev intentionally runs SW-free — always-fresh beats offline while iterating.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        const checkForUpdate = () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", checkForUpdate);
        // A periodic safety net for a PWA that stays open for days.
        window.setInterval(checkForUpdate, 60 * 60 * 1000);
      })
      .catch(() => {
        /* SW is an enhancement; the app works without it */
      });
  });
}
