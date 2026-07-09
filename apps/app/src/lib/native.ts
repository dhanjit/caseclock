/**
 * Native-only boot (no-op on web — the guard returns before any plugin loads,
 * so web never downloads these chunks). Called once from main.tsx, BEFORE
 * React renders, so cold-start notification taps are delivered to a live
 * listener.
 */
import { Capacitor } from "@capacitor/core";
import { registerNotificationActions } from "./notifications";
import { registerNotificationTapHandler } from "./notify-actions";
import { startNotificationPipeline } from "./notify-wire";

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  registerNotificationTapHandler();
  void registerNotificationActions();
  startNotificationPipeline();

  const [{ CapacitorUpdater }, { PrivacyScreen }] = await Promise.all([
    import("@capgo/capacitor-updater"),
    import("@capacitor/privacy-screen"),
  ]);

  // MANDATORY every launch — without it Capgo rolls back to the previous
  // bundle after appReadyTimeout. Harmless while autoUpdate is false.
  // §6.9 note: OTA traffic happens in this NATIVE plugin only; the web bundle
  // still makes zero fetch calls (the no-egress CI assertion is unaffected).
  void CapacitorUpdater.notifyAppReady();

  // §6.8 — blur the app-switcher snapshot so case text never leaks.
  void PrivacyScreen.enable({ ios: { blurEffect: "dark" } });
}
