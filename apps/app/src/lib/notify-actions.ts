/**
 * Notification action handling (M8 snooze/ack + tap deep-link).
 *
 * Actions can arrive while the vault is LOCKED (backgrounding auto-locks, and a
 * notification tap can cold-start the app), and alert_state lives inside the
 * encrypted DB — so mutations are queued in memory and flushed by the pipeline
 * after the next successful unlock. If the process dies before an unlock the
 * queued action is lost; the daily digest re-notifies, so nothing silently
 * clears. Nothing plaintext is persisted.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type ActionPerformed } from "@capacitor/local-notifications";
import type { DbClient } from "@/db";
import { AlertStateStore } from "@/domain/alert-state";
import type { CaseAggregate } from "@/domain/repository";
import { DEFAULT_SETTINGS } from "@/domain/types";
import { buildAgenda } from "@/rules/agenda";
import { addDays, type ISODate } from "@/rules/dates";
import { useNav } from "@/state/nav";

type PendingAction =
  | { kind: "ack"; caseId: string; ruleId: string; occurrenceDate: string }
  | { kind: "snooze"; caseId: string; ruleId: string; occurrenceDate: string }
  | { kind: "ack-all-overdue" };

const queue: PendingAction[] = [];

export function pendingActionCount(): number {
  return queue.length;
}

interface Extra {
  caseId?: string;
  ruleId?: string;
  occurrenceDate?: string;
  kind?: string;
}

/** Register early (module init in main.tsx) so cold-start taps are delivered. */
export function registerNotificationTapHandler(): void {
  if (!Capacitor.isNativePlatform()) return;
  void LocalNotifications.addListener("localNotificationActionPerformed", handleNotificationAction);
}

export function handleNotificationAction(event: ActionPerformed): void {
  const extra = (event.notification.extra ?? {}) as Extra;
  const { actionId } = event;

  if (actionId === "tap" || actionId === "open") {
    // Nav is memory-resident: set the target now; Shell renders it after unlock.
    if (extra.caseId) useNav.getState().go({ kind: "case", id: extra.caseId });
    else useNav.getState().go({ kind: "dashboard" });
    return;
  }

  if (actionId === "ack") {
    if (extra.kind === "overdue-digest") queue.push({ kind: "ack-all-overdue" });
    else if (extra.caseId && extra.ruleId && extra.occurrenceDate)
      queue.push({ kind: "ack", caseId: extra.caseId, ruleId: extra.ruleId, occurrenceDate: extra.occurrenceDate });
    return;
  }

  if (actionId === "snooze-1d" && extra.caseId && extra.ruleId && extra.occurrenceDate) {
    queue.push({ kind: "snooze", caseId: extra.caseId, ruleId: extra.ruleId, occurrenceDate: extra.occurrenceDate });
  }
}

/** Called by the pipeline after unlock, before re-materializing the plan. */
export async function flushPendingActions(
  client: DbClient,
  aggregates: CaseAggregate[],
  today: ISODate,
): Promise<void> {
  if (queue.length === 0) return;
  const actions = queue.splice(0, queue.length);
  const store = new AlertStateStore(client);
  for (const a of actions) {
    if (a.kind === "ack") {
      await store.acknowledge(a.caseId, a.ruleId, a.occurrenceDate);
    } else if (a.kind === "snooze") {
      await store.snooze(a.caseId, a.ruleId, a.occurrenceDate, addDays(today, 1));
    } else {
      // "Acknowledge all" from the digest: ack every currently-loud overdue occurrence.
      const agenda = buildAgenda(aggregates, DEFAULT_SETTINGS, today);
      for (const item of agenda.overdue.filter((i) => !i.silent)) {
        const d = item.deadline;
        await store.acknowledge(item.caseId, d.ruleId, d.occurrenceDate ?? d.dueAt ?? "");
      }
    }
  }
}
