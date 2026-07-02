import { isNativePlatform } from "@/lib/platform";
import { capacitorNotificationSink, noopNotificationSink, type NotificationSink } from "./notification-sink";

export type { NotificationSink } from "./notification-sink";
export { registerNotificationTapHandler } from "./notification-sink";
export { syncNotifications } from "./sync";
export { useNotificationSync } from "./useNotificationSync";

/**
 * Pick the notification sink: Capacitor local-notifications on native (fires
 * closed-app statutory alarms — the reason to go native), a no-op on web/PWA
 * where the in-app agenda is the system of record. Exported for unit testing.
 */
export function selectNotificationSink(): NotificationSink {
  return isNativePlatform() ? capacitorNotificationSink : noopNotificationSink;
}
