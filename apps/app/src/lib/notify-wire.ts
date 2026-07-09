/**
 * Notification pipeline (M8 wiring). Re-materializes the OS-notification plan
 * (cancel+reschedule) whenever case data changes while unlocked. Because
 * backgrounding auto-locks the vault, every app open passes through
 * unlock → useCases.load() → aggregates change → this pipeline: that IS
 * PLAN §8's "re-materialized each open". Best-effort: errors are logged,
 * never thrown into the UI.
 */
import { Capacitor } from "@capacitor/core";
import { AlertStateStore } from "@/domain/alert-state";
import { planNotifications } from "@/domain/notify";
import { DEFAULT_SETTINGS } from "@/domain/types";
import { buildAgenda } from "@/rules/agenda";
import { todayISO } from "@/rules/dates";
import { useCases } from "@/state/cases";
import { useNotifySettings } from "@/state/notify-settings";
import { useSession } from "@/state/session";
import { applyNotificationPlan, ensureNotificationPermission } from "./notifications";
import { flushPendingActions } from "./notify-actions";

let started = false;

export function startNotificationPipeline(): void {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const reschedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 400);
  };

  let running = false;
  let rerun = false;

  // Collapse overlapping triggers: if a materialization is already in flight,
  // request one more pass and return; the active run loops again so the freshest
  // data wins and two runs never race the OS cancel+schedule.
  async function run(): Promise<void> {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        await materialize();
      } while (rerun);
    } finally {
      running = false;
    }
  }

  async function materialize(): Promise<void> {
    try {
      const session = useSession.getState();
      const { aggregates, loaded } = useCases.getState();
      if (session.status !== "unlocked" || !loaded) return;
      if (!useNotifySettings.getState().enabled) {
        await applyNotificationPlan([]); // clear everything pending
        return;
      }
      // First-unlock permission ask happens here (iOS shows the dialog once).
      if (!(await ensureNotificationPermission())) return;
      const today = todayISO();
      await flushPendingActions(session.client, aggregates, today);
      const alertStates = await new AlertStateStore(session.client).list();
      const agenda = buildAgenda(aggregates, DEFAULT_SETTINGS, today);
      await applyNotificationPlan(planNotifications(agenda, alertStates, today));
    } catch (e) {
      console.error("[notify] pipeline failed:", e); // best-effort — never crash the app
    }
  }

  useCases.subscribe((s, prev) => {
    if (s.aggregates !== prev.aggregates) reschedule();
  });
  useNotifySettings.subscribe((s, prev) => {
    if (s.enabled !== prev.enabled) reschedule();
  });
}
