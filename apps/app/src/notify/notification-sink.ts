/**
 * Notification sink — the platform seam for M8 (mirrors the db/ VaultStore seam).
 *
 * The pure materializer (src/rules/notifications.ts) decides WHAT to schedule; the
 * sink decides HOW to deliver it. Native uses @capacitor/local-notifications; web
 * (and tests) use a no-op — the in-app agenda is the system of record there.
 */

import { LocalNotifications, type LocalNotificationSchema } from "@capacitor/local-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import type { ScheduledNotification } from "@/rules/notifications";
import type { ISODate } from "@/rules/dates";

export interface NotificationSink {
  /** Ask the OS for notification permission. Returns whether it is granted. */
  requestPermission(): Promise<boolean>;
  /** Replace the OS schedule with exactly this list (caller cancels first). */
  schedule(list: ScheduledNotification[]): Promise<void>;
  /** Clear every pending local notification this app scheduled. */
  cancelAll(): Promise<void>;
}

/** Deadlines are calendar dates; fire them at a fixed local time-of-day. */
export const DEFAULT_FIRE_HOUR = 9;

/** ISODate + hour → a LOCAL-time Date (not UTC — the alarm rings at 09:00 the officer's time). */
export function localFireDate(day: ISODate, hour: number = DEFAULT_FIRE_HOUR): Date {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

/** Map a materialized notification to the Capacitor plugin's schema. */
export function toLocalSchema(
  n: ScheduledNotification,
  hour: number = DEFAULT_FIRE_HOUR,
): LocalNotificationSchema {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    schedule: { at: localFireDate(n.fireAt, hour), allowWhileIdle: true },
    extra: n.extra,
  };
}

export const noopNotificationSink: NotificationSink = {
  async requestPermission() {
    return false;
  },
  async schedule() {
    /* web: agenda is the system of record */
  },
  async cancelAll() {
    /* nothing scheduled on web */
  },
};

export const capacitorNotificationSink: NotificationSink = {
  async requestPermission() {
    const res = await LocalNotifications.requestPermissions();
    return res.display === "granted";
  },
  async schedule(list) {
    if (!list.length) return;
    await LocalNotifications.schedule({ notifications: list.map((n) => toLocalSchema(n)) });
  },
  async cancelAll() {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  },
};

/**
 * Dev/gate-test only: schedule a one-off alarm N seconds out so the officer can
 * background the app and confirm a notification FIRES while it is closed (the M8
 * on-device gate — handoff doc §54). Uses a fixed high id so repeated taps replace
 * rather than stack. Not unit-tested (unavoidable plugin dependency).
 */
export const TEST_ALARM_ID = 2_000_000_001;

export async function scheduleTestAlarm(secondsFromNow = 60): Promise<Date> {
  const granted = await capacitorNotificationSink.requestPermission();
  if (!granted) throw new Error("Notification permission not granted");
  const at = new Date(Date.now() + secondsFromNow * 1000);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_ALARM_ID,
        title: "CaseClock — test alarm",
        body: "If you can read this with the app closed, closed-app alarms work. ✅",
        schedule: { at, allowWhileIdle: true },
      },
    ],
  });
  return at;
}

/**
 * Route a tapped notification to its case. Native glue — registered once at app
 * init. `extra.caseId` was stamped by the materializer. Best-effort; validated in
 * the on-device gate test, not unit-tested (unavoidable plugin dependency).
 */
export function registerNotificationTapHandler(
  onOpenCase: (caseId: string) => void,
): Promise<PluginListenerHandle> {
  return LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    const caseId = (action.notification.extra as { caseId?: string } | undefined)?.caseId;
    if (caseId) onOpenCase(caseId);
  });
}
