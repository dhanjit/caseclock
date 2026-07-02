/**
 * Notification sync — orchestrates the pure materializer against a platform sink.
 *
 * Stateless and idempotent: cancel every pending alarm, then schedule the freshly
 * materialized set. Called on every app open (and after case mutations), so it needs
 * no persistence — the current cases + today fully determine the schedule.
 */

import { materializeNotifications, type MaterializeOptions, type MaterializeResult } from "@/rules/notifications";
import type { Agenda } from "@/rules/agenda";
import type { ISODate } from "@/rules/dates";
import type { NotificationSink } from "./notification-sink";

export async function syncNotifications(
  agenda: Agenda,
  sink: NotificationSink,
  today: ISODate,
  opts?: MaterializeOptions,
): Promise<MaterializeResult> {
  const result = materializeNotifications(agenda, today, opts);
  // Cancel first so we never drop an alarm we just scheduled (ids are stable, but a
  // deadline that moved out of the horizon must not linger).
  await sink.cancelAll();
  await sink.schedule(result.scheduled);
  return result;
}
