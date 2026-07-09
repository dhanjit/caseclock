import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Record<string, unknown[]> = { schedule: [], cancel: [] };
let pendingList: { id: number }[] = [];
let permission = "prompt";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    async checkPermissions() {
      return { display: permission };
    },
    async requestPermissions() {
      permission = "granted";
      return { display: permission };
    },
    async getPending() {
      return { notifications: pendingList };
    },
    async cancel(o: unknown) {
      calls.cancel.push(o);
    },
    async schedule(o: unknown) {
      calls.schedule.push(o);
    },
    async registerActionTypes() {},
    async addListener() {
      return { remove: async () => {} };
    },
  },
}));

import type { PlannedNotification } from "@/domain/notify";
import { applyNotificationPlan, ensureNotificationPermission } from "./notifications";

function planned(over: Partial<PlannedNotification>): PlannedNotification {
  return {
    id: 42,
    key: "k",
    title: "t",
    body: "b",
    fireDate: "2026-07-20",
    severityRank: 0,
    caseId: "c1",
    ruleId: "r1",
    occurrenceDate: "2026-07-20",
    instanceId: null,
    kind: "deadline",
    ...over,
  };
}

describe("notifications adapter", () => {
  beforeEach(() => {
    calls.schedule.length = 0;
    calls.cancel.length = 0;
    pendingList = [];
    permission = "prompt";
  });

  it("requests permission once and reports the grant", async () => {
    expect(await ensureNotificationPermission()).toBe(true);
    expect(permission).toBe("granted");
  });

  it("cancels all pending, then schedules future fires at 08:00 local", async () => {
    pendingList = [{ id: 1 }, { id: 2 }];
    const now = new Date(2026, 6, 9, 12, 0, 0); // 2026-07-09 noon local
    await applyNotificationPlan(
      [planned({ id: 7, fireDate: "2026-07-12" }), planned({ id: 8, key: "past", fireDate: "2026-07-01" })],
      now,
    );
    expect(calls.cancel).toHaveLength(1);
    expect((calls.cancel[0] as { notifications: { id: number }[] }).notifications).toEqual([{ id: 1 }, { id: 2 }]);
    const sched = (calls.schedule[0] as { notifications: any[] }).notifications;
    expect(sched).toHaveLength(1); // the past fire is dropped
    expect(sched[0].id).toBe(7);
    expect(sched[0].schedule.at.getHours()).toBe(8);
    expect(sched[0].extra.caseId).toBe("c1");
    expect(sched[0].actionTypeId).toBe("cc-deadline");
  });

  it("digest entries get the overdue action type", async () => {
    await applyNotificationPlan(
      [planned({ kind: "overdue-digest", caseId: null, ruleId: null, occurrenceDate: null, fireDate: "2026-07-12" })],
      new Date(2026, 6, 9),
    );
    const sched = (calls.schedule[0] as { notifications: any[] }).notifications;
    expect(sched[0].actionTypeId).toBe("cc-overdue");
  });

  it("schedules nothing when the plan is empty (still clears pending)", async () => {
    pendingList = [{ id: 5 }];
    await applyNotificationPlan([], new Date(2026, 6, 9));
    expect(calls.cancel).toHaveLength(1);
    expect(calls.schedule).toHaveLength(0);
  });
});
