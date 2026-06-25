/**
 * Auto-lock (PLAN §6.5 / M10). Locks the vault — dropping the DEK reference and
 * closing the in-memory DB — on:
 *   - inactivity (idle timeout),
 *   - the app being backgrounded / hidden / frozen (Page Lifecycle),
 *   - a hard wall-clock cap since unlock, regardless of activity.
 *
 * Mounted only while unlocked (inside Shell), so unlock time = mount time.
 * Best-effort on web (a hard tab-kill can't run the handler). Note: the DEK is a
 * non-extractable CryptoKey — lock drops the reference (GC-dependent), it does
 * not guarantee a memory wipe (see PLAN §6.10's honest threat framing).
 */

import { useEffect } from "react";
import { useSession } from "@/state/session";

const IDLE_MS = 90_000; // lock after 90s of no interaction
const HARD_MS = 30 * 60_000; // re-require unlock every 30 min regardless

export function useAutoLock(): void {
  useEffect(() => {
    // DEV-only escape so headless/automated testing isn't force-locked every
    // alt-tab. Never available in production builds (import.meta.env.DEV is false).
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("nolock")) {
      return;
    }
    const unlockedAt = Date.now();
    let idle: ReturnType<typeof setTimeout> | undefined;

    const lock = () => {
      if (useSession.getState().status === "unlocked") void useSession.getState().lock();
    };
    const reset = () => {
      if (idle) clearTimeout(idle);
      if (Date.now() - unlockedAt > HARD_MS) {
        lock();
        return;
      }
      idle = setTimeout(lock, IDLE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") lock();
      else reset();
    };

    const activity = ["pointerdown", "keydown", "pointermove", "scroll", "touchstart"];
    activity.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", lock);
    // Page Lifecycle 'freeze' isn't in the standard lib types yet.
    document.addEventListener("freeze" as keyof DocumentEventMap, lock as EventListener);

    reset();
    return () => {
      if (idle) clearTimeout(idle);
      activity.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", lock);
      document.removeEventListener("freeze" as keyof DocumentEventMap, lock as EventListener);
    };
  }, []);
}
