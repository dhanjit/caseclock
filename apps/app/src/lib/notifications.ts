/**
 * LocalNotifications adapter (M8). Everything here is native-only and
 * best-effort — the in-app agenda is the system of record. The plan is applied
 * cancel+reschedule (PLAN §8: "re-materialized each open") so drift never
 * accumulates.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { NOTIFY_HOUR, hashId, type PlannedNotification } from "@/domain/notify";

export const ACTION_TYPE_DEADLINE = "cc-deadline";
export const ACTION_TYPE_OVERDUE = "cc-overdue";

export function nativeNotificationsAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/** Idempotent: iOS shows the system dialog once, then returns the cached state. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!nativeNotificationsAvailable()) return false;
  const st = await LocalNotifications.checkPermissions();
  if (st.display === "granted") return true;
  if (st.display === "denied") return false;
  const req = await LocalNotifications.requestPermissions();
  return req.display === "granted";
}

export async function registerNotificationActions(): Promise<void> {
  if (!nativeNotificationsAvailable()) return;
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: ACTION_TYPE_DEADLINE,
        actions: [
          { id: "open", title: "Open case", foreground: true },
          { id: "snooze-1d", title: "Snooze 1 day" },
          { id: "ack", title: "Acknowledge" },
        ],
      },
      {
        id: ACTION_TYPE_OVERDUE,
        actions: [
          { id: "open", title: "Open CaseClock", foreground: true },
          { id: "ack", title: "Acknowledge all" },
        ],
      },
    ],
  });
}

/** Local wall-clock Date for a YYYY-MM-DD at NOTIFY_HOUR. */
function fireAt(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, NOTIFY_HOUR, 0, 0, 0);
}

/** Cancel every pending notification, then schedule the plan (future fires only). */
export async function applyNotificationPlan(plan: PlannedNotification[], now: Date = new Date()): Promise<void> {
  if (!nativeNotificationsAvailable()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  const toSchedule = plan
    .map((p) => ({ p, at: fireAt(p.fireDate) }))
    .filter(({ at }) => at.getTime() > now.getTime())
    .map(({ p, at }) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      schedule: { at, allowWhileIdle: true },
      actionTypeId: p.kind === "overdue-digest" ? ACTION_TYPE_OVERDUE : ACTION_TYPE_DEADLINE,
      extra: { caseId: p.caseId, ruleId: p.ruleId, occurrenceDate: p.occurrenceDate, kind: p.kind },
    }));
  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
    console.log(`[notify] scheduled ${toSchedule.length} notifications`); // on-device verification hook
  }
}

/** Settings-page helper: proves alarms fire on this device (~2 min out, app may be killed). */
export async function scheduleTestNotification(): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: hashId(`cc-test@${Date.now()}`),
        title: "CaseClock test",
        body: "Deadline alarms are working on this device.",
        schedule: { at: new Date(Date.now() + 120_000), allowWhileIdle: true },
      },
    ],
  });
  return true;
}
