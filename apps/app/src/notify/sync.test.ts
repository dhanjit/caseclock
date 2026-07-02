import { describe, expect, it } from "vitest";
import { syncNotifications } from "./sync";
import type { NotificationSink } from "./notification-sink";
import type { ScheduledNotification } from "@/rules/notifications";
import type { Agenda, AgendaItem } from "@/rules/agenda";
import { addDays, type ISODate } from "@/rules/dates";

const TODAY: ISODate = "2026-07-02";

function upcomingItem(caseId: string, dueAt: ISODate): AgendaItem {
  return {
    caseId,
    caseLabel: `case ${caseId}`,
    deadline: {
      caseId,
      ruleId: "chargesheet-90",
      type: "Chargesheet (90-day)",
      dueAt,
      occurrenceDate: dueAt,
      severity: "statutory",
      lawRef: "BNSS 187",
      verified: "confirmed",
      state: "active",
      track: "investigation",
      leadOffsets: [],
    },
    bucket: "upcoming",
    daysUntil: 5,
    priority: true,
    silent: false,
  };
}

const agenda: Agenda = { overdue: [], today: [], upcoming: [upcomingItem("c1", addDays(TODAY, 5))] };

function recordingSink() {
  const calls: string[] = [];
  let scheduled: ScheduledNotification[] = [];
  const sink: NotificationSink = {
    async requestPermission() {
      calls.push("requestPermission");
      return true;
    },
    async cancelAll() {
      calls.push("cancelAll");
    },
    async schedule(list) {
      calls.push("schedule");
      scheduled = list;
    },
  };
  return { sink, calls, getScheduled: () => scheduled };
}

describe("syncNotifications", () => {
  it("cancels all pending BEFORE scheduling the freshly materialized list", async () => {
    const rec = recordingSink();
    const result = await syncNotifications(agenda, rec.sink, TODAY);

    expect(rec.calls).toEqual(["cancelAll", "schedule"]);
    expect(rec.getScheduled()).toHaveLength(1);
    expect(rec.getScheduled()[0].extra.caseId).toBe("c1");
    expect(result.scheduled).toHaveLength(1);
  });
});
