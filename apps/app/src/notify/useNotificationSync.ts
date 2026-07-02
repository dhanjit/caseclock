/**
 * Notification sync hook (M8). Mounted inside Shell, so it runs only while the
 * vault is unlocked. Two jobs:
 *   1. Once per unlocked session (native only): request OS permission + route a
 *      tapped notification to its case.
 *   2. Re-materialize the OS schedule whenever the caseload changes — stateless
 *      cancel+reschedule from the current agenda, so it self-heals on every edit.
 *
 * On web the sink is a no-op: the in-app agenda is the system of record there.
 */

import { useEffect } from "react";
import { useCases } from "@/state/cases";
import { useNav } from "@/state/nav";
import { buildAgenda } from "@/rules/agenda";
import { todayISO } from "@/rules/dates";
import { DEFAULT_SETTINGS } from "@/domain/types";
import { isNativePlatform } from "@/lib/platform";
import { registerNotificationTapHandler, selectNotificationSink, syncNotifications } from "./index";

export function useNotificationSync(): void {
  const aggregates = useCases((s) => s.aggregates);
  const loaded = useCases((s) => s.loaded);

  useEffect(() => {
    if (!isNativePlatform()) return;
    void selectNotificationSink().requestPermission();
    const handle = registerNotificationTapHandler((caseId) =>
      useNav.getState().go({ kind: "case", id: caseId }),
    );
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const today = todayISO();
    const agenda = buildAgenda(aggregates, DEFAULT_SETTINGS, today);
    void syncNotifications(agenda, selectNotificationSink(), today);
  }, [aggregates, loaded]);
}
