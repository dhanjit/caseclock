import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    async addListener() {
      return { remove: async () => {} };
    },
  },
}));

import { MemoryDbClient } from "@/db";
import { AlertStateStore, alertKey } from "@/domain/alert-state";
import { useNav } from "@/state/nav";
import { flushPendingActions, handleNotificationAction, pendingActionCount } from "./notify-actions";

function event(actionId: string, extra: Record<string, unknown>) {
  return { actionId, notification: { id: 1, extra } } as never;
}

describe("notification actions", () => {
  let client: MemoryDbClient;

  beforeEach(async () => {
    client = new MemoryDbClient();
    await client.createVault("t");
    useNav.setState({ view: { kind: "dashboard" } });
    // drain anything a previous test queued
    await flushPendingActions(client, [], "2026-07-09");
  });

  it("tap with a caseId deep-links to the case", () => {
    handleNotificationAction(event("tap", { caseId: "c9", kind: "deadline" }));
    expect(useNav.getState().view).toEqual({ kind: "case", id: "c9" });
  });

  it("tap on the digest goes to the dashboard", () => {
    useNav.setState({ view: { kind: "settings" } });
    handleNotificationAction(event("tap", { kind: "overdue-digest" }));
    expect(useNav.getState().view).toEqual({ kind: "dashboard" });
  });

  it("ack queues while locked, then flush writes alert_state", async () => {
    handleNotificationAction(event("ack", { caseId: "c1", ruleId: "r1", occurrenceDate: "2026-07-10", kind: "deadline" }));
    expect(pendingActionCount()).toBe(1);
    await flushPendingActions(client, [], "2026-07-09");
    expect(pendingActionCount()).toBe(0);
    const st = (await new AlertStateStore(client).list()).get(alertKey("c1", "r1", "2026-07-10"));
    expect(st?.state).toBe("acknowledged");
  });

  it("snooze-1d stores tomorrow as snoozedUntil", async () => {
    handleNotificationAction(event("snooze-1d", { caseId: "c1", ruleId: "r1", occurrenceDate: "2026-07-10", kind: "deadline" }));
    await flushPendingActions(client, [], "2026-07-09");
    const st = (await new AlertStateStore(client).list()).get(alertKey("c1", "r1", "2026-07-10"));
    expect(st?.state).toBe("snoozed");
    expect(st?.snoozedUntil).toBe("2026-07-10");
  });

  it("ack-all on the digest with no aggregates is a safe no-op drain", async () => {
    handleNotificationAction(event("ack", { kind: "overdue-digest" }));
    expect(pendingActionCount()).toBe(1);
    await flushPendingActions(client, [], "2026-07-09");
    expect(pendingActionCount()).toBe(0);
    expect((await new AlertStateStore(client).list()).size).toBe(0);
  });

  it("re-queues a failed action instead of dropping its siblings when the vault re-locks mid-flush", async () => {
    const { AlertStateStore } = await import("@/domain/alert-state");
    // Make the FIRST alert_state write throw once (simulates the vault re-locking mid-batch).
    let throwOnce = true;
    const realExec = client.exec.bind(client);
    vi.spyOn(client, "exec").mockImplementation(async (sql: string, bind?: unknown[]) => {
      if (throwOnce && /alert_state/.test(sql)) { throwOnce = false; throw new Error("Vault is locked."); }
      return realExec(sql, bind as never);
    });

    handleNotificationAction(event("ack", { caseId: "cA", ruleId: "r1", occurrenceDate: "2026-07-10", kind: "deadline" }));
    handleNotificationAction(event("ack", { caseId: "cB", ruleId: "r1", occurrenceDate: "2026-07-10", kind: "deadline" }));
    await flushPendingActions(client, [], "2026-07-09");

    // exactly one action re-queued (the one that hit the lock); the other committed
    expect(pendingActionCount()).toBe(1);
    const store = new AlertStateStore(client);
    expect((await store.list()).size).toBe(1);

    // next unlock drains the re-queued one cleanly
    await flushPendingActions(client, [], "2026-07-09");
    expect(pendingActionCount()).toBe(0);
    expect((await new AlertStateStore(client).list()).size).toBe(2);
  });
});
