/**
 * OS-notification materializer (PLAN §8, M8 — lean).
 *
 * PURE: turns the in-app Agenda into a bounded, severity-prioritised list of
 * scheduled local notifications. The platform sink (src/notify/) applies a
 * time-of-day and hands them to @capacitor/local-notifications. Web is a no-op —
 * the agenda is the system of record; OS notifications are a best-effort projection.
 *
 * Deliberately stateless (no alert_state yet): recomputed and rescheduled on every
 * app open, so it needs no persistence. Snooze/ack are deferred to when alert_state
 * lands (see docs/superpowers/specs/2026-07-02-m8-notification-materializer-design.md).
 */

import type { Agenda, AgendaItem } from "./agenda";
import type { Severity } from "@/domain/types";
import { addDays, diffDays, type ISODate } from "./dates";

export interface ScheduledNotification {
  /** Stable positive 31-bit id (Capacitor/Android ids are 32-bit ints). */
  id: number;
  title: string;
  body: string;
  /** Calendar date to fire; the sink applies the time-of-day. */
  fireAt: ISODate;
  severity: Severity;
  extra: { caseId: string; ruleId: string; occurrenceDate: ISODate | null };
}

export interface MaterializeOptions {
  horizonDays?: number;
  overdueRunDays?: number;
  maxScheduled?: number;
}

export interface MaterializeResult {
  scheduled: ScheduledNotification[];
  /** Candidates dropped because they exceeded the iOS pending-notification cap. */
  droppedForCap: number;
}

const SEVERITY_RANK: Record<Severity, number> = {
  "statutory-critical": 0,
  statutory: 1,
  "statutory-condonable": 2,
  court: 3,
  directory: 4,
  soft: 5,
};

/** FNV-1a → positive 31-bit int. Deterministic: same logical alarm ⇒ same id. */
function stableId(parts: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

function makeNotification(item: AgendaItem, fireAt: ISODate, overdue: boolean): ScheduledNotification {
  const d = item.deadline;
  return {
    id: stableId(`${d.caseId}|${d.ruleId}|${d.occurrenceDate ?? ""}|${fireAt}`),
    title: item.caseLabel,
    body: overdue ? `OVERDUE: ${d.type} (${d.lawRef})` : `${d.type} due ${d.dueAt}`,
    fireAt,
    severity: d.severity,
    extra: { caseId: d.caseId, ruleId: d.ruleId, occurrenceDate: d.occurrenceDate },
  };
}

export function materializeNotifications(
  agenda: Agenda,
  today: ISODate,
  opts: MaterializeOptions = {},
): MaterializeResult {
  const horizon = opts.horizonDays ?? 30;
  const overdueRunDays = opts.overdueRunDays ?? 14;
  const maxScheduled = opts.maxScheduled ?? 64;

  const inWindow = (fd: ISODate): boolean => {
    const n = diffDays(fd, today);
    return n >= 1 && n <= horizon;
  };

  const candidates: ScheduledNotification[] = [];
  const seen = new Set<number>();
  const push = (n: ScheduledNotification) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    candidates.push(n);
  };

  // Upcoming / today: alert on the due day and each lead-offset day within the horizon.
  for (const item of [...agenda.today, ...agenda.upcoming]) {
    if (item.silent) continue; // non-priority: in-app only, no interruptive OS alarm
    const d = item.deadline;
    if (!d.dueAt) continue;
    const fireDates = [d.dueAt, ...d.leadOffsets.map((o) => addDays(d.dueAt as ISODate, -o))];
    for (const fd of fireDates) {
      if (inWindow(fd)) push(makeNotification(item, fd, false));
    }
  }

  // Overdue: a bounded daily run (today is skipped — the app is open now). This is
  // the "persistent until acknowledged" proxy: cancel+reschedule each open (§8).
  for (const item of agenda.overdue) {
    if (item.silent) continue; // non-priority: in-app only, no interruptive OS alarm
    for (let day = 1; day <= overdueRunDays; day++) {
      push(makeNotification(item, addDays(today, day), true));
    }
  }

  candidates.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return diffDays(a.fireAt, b.fireAt);
  });

  const scheduled = candidates.slice(0, maxScheduled);
  return { scheduled, droppedForCap: candidates.length - scheduled.length };
}
