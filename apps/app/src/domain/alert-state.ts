/**
 * AlertState (M8) — per-occurrence notification state (RESEARCH §7).
 * Consumed by the notification materializer (domain/notify.ts): "acknowledged"
 * occurrences drop out of the OVERDUE digest and per-deadline alarms;
 * "snoozed" suppresses fire-dates up to snoozedUntil. Never filters the
 * in-app agenda.
 */
import type { DbClient } from "@/db";
import type { ISODate } from "@/rules/dates";

export type AlertStateKind = "acknowledged" | "snoozed";

export interface AlertState {
  caseId: string;
  ruleId: string;
  occurrenceDate: string;
  instanceId: string;
  state: AlertStateKind;
  snoozedUntil: ISODate | null;
}

export function alertKey(caseId: string, ruleId: string, occurrenceDate: string, instanceId = ""): string {
  return `${caseId}|${ruleId}|${occurrenceDate}|${instanceId}`;
}

type Row = {
  case_id: string;
  rule_id: string;
  occurrence_date: string;
  instance_id: string;
  state: string;
  snoozed_until: string | null;
};

export class AlertStateStore {
  constructor(private readonly client: DbClient) {}

  async list(): Promise<Map<string, AlertState>> {
    const rows = await this.client.query<Row>(
      "SELECT case_id, rule_id, occurrence_date, instance_id, state, snoozed_until FROM alert_state",
    );
    const map = new Map<string, AlertState>();
    for (const r of rows) {
      map.set(alertKey(r.case_id, r.rule_id, r.occurrence_date, r.instance_id), {
        caseId: r.case_id,
        ruleId: r.rule_id,
        occurrenceDate: r.occurrence_date,
        instanceId: r.instance_id,
        state: r.state as AlertStateKind,
        snoozedUntil: r.snoozed_until,
      });
    }
    return map;
  }

  async acknowledge(caseId: string, ruleId: string, occurrenceDate: string, instanceId = ""): Promise<void> {
    await this.upsert(caseId, ruleId, occurrenceDate, instanceId, "acknowledged", null);
  }

  async snooze(caseId: string, ruleId: string, occurrenceDate: string, until: ISODate, instanceId = ""): Promise<void> {
    await this.upsert(caseId, ruleId, occurrenceDate, instanceId, "snoozed", until);
  }

  private async upsert(
    caseId: string,
    ruleId: string,
    occurrenceDate: string,
    instanceId: string,
    state: AlertStateKind,
    snoozedUntil: ISODate | null,
  ): Promise<void> {
    await this.client.exec(
      `INSERT INTO alert_state(case_id, rule_id, occurrence_date, instance_id, state, snoozed_until, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(case_id, rule_id, occurrence_date, instance_id) DO UPDATE
         SET state = excluded.state, snoozed_until = excluded.snoozed_until, updated_at = excluded.updated_at`,
      [caseId, ruleId, occurrenceDate, instanceId, state, snoozedUntil, Date.now()],
    );
  }
}
