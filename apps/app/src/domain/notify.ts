/**
 * M8 — OS-notification materializer. A PURE projection of the agenda into a
 * bounded, severity-prioritized set of local notifications:
 *   - per-deadline alerts at each rule's leadOffsets + the due day (30-day
 *     horizon comes from buildAgenda's own horizon),
 *   - a bounded daily-OVERDUE digest (loud lane only) that re-notifies until
 *     acknowledged — a missed statutory deadline must not silently clear,
 *   - hard-capped at the iOS 64-pending-notification limit, digest first,
 *     then severity rank, then proximity.
 * The in-app agenda remains the system of record (PLAN §8); this layer is
 * best-effort and is re-materialized (cancel+reschedule) on every unlock and
 * data change. Snooze quiets per-deadline alerts only (not the digest); ack
 * silences an occurrence everywhere.
 */
import { SEVERITY_RANK, type Agenda, type AgendaItem } from "@/rules/agenda";
import { addDays, diffDays, type ISODate } from "@/rules/dates";
import { alertKey, type AlertState } from "./alert-state";

export const NOTIFY_HOUR = 8; // 08:00 local — morning-briefing time
export const IOS_PENDING_CAP = 64; // UNUserNotificationCenter keeps only the 64 soonest
export const OVERDUE_RUN_DAYS = 14; // bounded daily-OVERDUE run (PLAN §8)

export interface PlannedNotification {
  id: number; // deterministic 31-bit hash of key — stable across re-materializations
  key: string;
  title: string;
  body: string;
  fireDate: ISODate; // local calendar date; the adapter fires it at NOTIFY_HOUR
  severityRank: number; // digest = -1 so it always survives the cap
  caseId: string | null; // deep-link target (null for the digest)
  ruleId: string | null;
  occurrenceDate: ISODate | null;
  kind: "deadline" | "overdue-digest";
}

/** FNV-1a 32-bit, masked positive — LocalNotifications ids must be 32-bit ints. */
export function hashId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h & 0x7fffffff;
}

export function planNotifications(
  agenda: Agenda,
  alertStates: Map<string, AlertState>,
  today: ISODate,
  opts: { capacity?: number; overdueRunDays?: number } = {},
): PlannedNotification[] {
  const capacity = opts.capacity ?? IOS_PENDING_CAP;
  const overdueRunDays = opts.overdueRunDays ?? OVERDUE_RUN_DAYS;
  const out = new Map<string, PlannedNotification>();

  const stateFor = (i: AgendaItem) =>
    alertStates.get(alertKey(i.caseId, i.deadline.ruleId, i.deadline.occurrenceDate ?? i.deadline.dueAt ?? ""));

  // 1) Bounded daily-OVERDUE digest — loud lane only, unacknowledged only.
  const loudOverdue = agenda.overdue.filter((i) => !i.silent && stateFor(i)?.state !== "acknowledged");
  if (loudOverdue.length > 0) {
    const top = loudOverdue[0]; // agenda pre-sorts severity-then-date
    const rest = loudOverdue.length - 1;
    const body = rest > 0 ? `${top.caseLabel}: ${top.deadline.type} +${rest} more` : `${top.caseLabel}: ${top.deadline.type}`;
    for (let day = 1; day <= overdueRunDays; day++) {
      const fireDate = addDays(today, day);
      const key = `overdue-digest@${fireDate}`;
      out.set(key, {
        id: hashId(key),
        key,
        title: "OVERDUE — statutory deadline pending",
        body,
        fireDate,
        severityRank: -1,
        caseId: null,
        ruleId: null,
        occurrenceDate: null,
        kind: "overdue-digest",
      });
    }
  }

  // 2) Per-deadline alerts: each lead offset + the due day, strictly future.
  for (const item of [...agenda.today, ...agenda.upcoming]) {
    const d = item.deadline;
    if (!d.dueAt) continue;
    const st = stateFor(item);
    if (st?.state === "acknowledged") continue;
    for (const fireDate of [d.dueAt, ...d.leadOffsets.map((off) => addDays(d.dueAt!, -off))]) {
      if (diffDays(fireDate, today) <= 0) continue; // today/past → the on-screen agenda owns it
      if (st?.state === "snoozed" && st.snoozedUntil && fireDate <= st.snoozedUntil) continue;
      const daysLeft = diffDays(d.dueAt, fireDate);
      // key mirrors ics.eventUid: dueAt+type (ruleId alone is not unique per day)
      const key = `${item.caseId}|${d.dueAt}|${d.type}@${fireDate}`;
      out.set(key, {
        id: hashId(key),
        key,
        title: daysLeft === 0 ? `${d.type} — due today` : `${d.type} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
        body: `${item.caseLabel} — ${d.lawRef}`,
        fireDate,
        severityRank: SEVERITY_RANK[d.severity],
        caseId: item.caseId,
        ruleId: d.ruleId,
        occurrenceDate: d.occurrenceDate ?? d.dueAt,
        kind: "deadline",
      });
    }
  }

  // 3) Severity-prioritized against the pending cap (digest run first at rank -1).
  return [...out.values()]
    .sort(
      (a, b) =>
        a.severityRank - b.severityRank ||
        (a.fireDate < b.fireDate ? -1 : a.fireDate > b.fireDate ? 1 : 0) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, capacity);
}
