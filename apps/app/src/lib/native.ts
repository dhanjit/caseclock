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

  // MANDATORY on every launch, called FIRST and in ISOLATION — Capgo's native
  // watchdog silently rolls the whole app back to the previous bundle if this
  // doesn't fire within appReadyTimeout (~10s). It must NOT be coupled to any
  // other plugin's import (a failed privacy-screen chunk in an OTA bundle must
  // never be able to skip it) and its own failure must be swallowed, not left as
  // an unhandled rejection. Harmless while autoUpdate is false.
  // §6.9 note: OTA traffic happens in this NATIVE plugin only; the web bundle
  // still makes zero fetch calls (the no-egress CI assertion is unaffected).
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch (e) {
    console.error("[native] notifyAppReady failed:", e);
  }

  // §6.8 — blur the app-switcher snapshot so case text never leaks. Independent
  // of the updater; its failure must not affect update-readiness above.
  try {
    const { PrivacyScreen } = await import("@capacitor/privacy-screen");
    await PrivacyScreen.enable({ ios: { blurEffect: "dark" } });
  } catch (e) {
    console.error("[native] privacy-screen enable failed:", e);
  }
}
