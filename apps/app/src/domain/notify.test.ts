import { describe, expect, it } from "vitest";
import type { Agenda, AgendaItem } from "@/rules/agenda";
import type { DeadlineEvent } from "@/domain/types";
import type { AlertState } from "./alert-state";
import { alertKey } from "./alert-state";
import { hashId, planNotifications, OVERDUE_RUN_DAYS } from "./notify";

const TODAY = "2026-07-09";

function item(
  over: Partial<DeadlineEvent> & { dueAt: string | null },
  extra?: Partial<AgendaItem>,
): AgendaItem {
  const deadline: DeadlineEvent = {
    caseId: "c1",
    ruleId: "r1",
    type: "Chargesheet (90 days)",
    occurrenceDate: over.dueAt,
    severity: "statutory-critical",
    lawRef: "BNSS 193",
    verified: "confirmed",
    state: "active",
    track: "investigation",
    leadOffsets: [7, 3],
    ...over,
  };
  return {
    caseId: deadline.caseId,
    caseLabel: "47/2026 PS Azara",
    deadline,
    bucket: "upcoming",
    daysUntil: 10,
    priority: true,
    silent: false,
    ...extra,
  };
}

const agenda = (over: Partial<Agenda>): Agenda => ({ overdue: [], today: [], upcoming: [], ...over });
const none = new Map<string, AlertState>();

describe("planNotifications", () => {
  it("plans lead-offset + due-day fires, strictly in the future", () => {
    const plan = planNotifications(agenda({ upcoming: [item({ dueAt: "2026-07-19" })] }), none, TODAY);
    expect(plan.map((p) => p.fireDate).sort()).toEqual(["2026-07-12", "2026-07-16", "2026-07-19"]);
    expect(plan.every((p) => p.kind === "deadline")).toBe(true);
    expect(plan[0].title).toContain("Chargesheet");
    expect(plan.find((p) => p.fireDate === "2026-07-19")?.title).toContain("due today");
  });

  it("drops past and same-day fire dates (the open app's agenda owns today)", () => {
    const plan = planNotifications(agenda({ today: [item({ dueAt: "2026-07-10" })] }), none, TODAY);
    // offsets 7 and 3 land before today; only the due-day fire (tomorrow) survives
    expect(plan.map((p) => p.fireDate)).toEqual(["2026-07-10"]);
  });

  it("emits a bounded daily digest for LOUD overdue only", () => {
    const loud = item({ dueAt: "2026-07-01", state: "overdue" }, { bucket: "overdue", silent: false });
    const silent = item({ dueAt: "2026-07-01", state: "overdue", caseId: "c2" }, { bucket: "overdue", silent: true, caseId: "c2" });
    const plan = planNotifications(agenda({ overdue: [loud, silent] }), none, TODAY);
    const digests = plan.filter((p) => p.kind === "overdue-digest");
    expect(digests).toHaveLength(OVERDUE_RUN_DAYS);
    expect(digests[0].fireDate).toBe("2026-07-10"); // starts tomorrow
    expect(digests[0].body).toContain("47/2026 PS Azara");

    const silentOnly = planNotifications(agenda({ overdue: [silent] }), none, TODAY);
    expect(silentOnly).toHaveLength(0);
  });

  it("acknowledged occurrences vanish from digest and deadline alerts", () => {
    const ov = item({ dueAt: "2026-07-01", state: "overdue" }, { bucket: "overdue" });
    const up = item({ dueAt: "2026-07-19", ruleId: "r2", type: "PR due" }, { bucket: "upcoming" });
    const states = new Map<string, AlertState>([
      [alertKey("c1", "r1", "2026-07-01"), { caseId: "c1", ruleId: "r1", occurrenceDate: "2026-07-01", instanceId: "", state: "acknowledged", snoozedUntil: null }],
      [alertKey("c1", "r2", "2026-07-19"), { caseId: "c1", ruleId: "r2", occurrenceDate: "2026-07-19", instanceId: "", state: "acknowledged", snoozedUntil: null }],
    ]);
    expect(planNotifications(agenda({ overdue: [ov], upcoming: [up] }), states, TODAY)).toHaveLength(0);
  });

  it("snooze suppresses fire dates up to snoozedUntil only", () => {
    const up = item({ dueAt: "2026-07-19" });
    const states = new Map<string, AlertState>([
      [alertKey("c1", "r1", "2026-07-19"), { caseId: "c1", ruleId: "r1", occurrenceDate: "2026-07-19", instanceId: "", state: "snoozed", snoozedUntil: "2026-07-12" }],
    ]);
    const plan = planNotifications(agenda({ upcoming: [up] }), states, TODAY);
    expect(plan.map((p) => p.fireDate).sort()).toEqual(["2026-07-16", "2026-07-19"]);
  });

  it("caps at 64, digest first, then severity-prioritized", () => {
    const many: AgendaItem[] = [];
    for (let i = 0; i < 40; i++) {
      many.push(item({ dueAt: "2026-07-20", caseId: `crit${i}` }, { caseId: `crit${i}` }));
      many.push(item({ dueAt: "2026-07-15", severity: "court", caseId: `court${i}`, type: "Hearing" }, { caseId: `court${i}` }));
    }
    const loud = item({ dueAt: "2026-07-01", state: "overdue", caseId: "ov" }, { bucket: "overdue", caseId: "ov" });
    const plan = planNotifications(agenda({ overdue: [loud], upcoming: many }), none, TODAY);
    expect(plan).toHaveLength(64);
    expect(plan.filter((p) => p.kind === "overdue-digest")).toHaveLength(OVERDUE_RUN_DAYS);
    // remaining 50 slots all go to statutory-critical before any court item
    expect(plan.filter((p) => p.kind === "deadline").every((p) => p.title.includes("Chargesheet"))).toBe(true);
  });

  it("ids are deterministic and unique within a plan", () => {
    const plan = planNotifications(agenda({ upcoming: [item({ dueAt: "2026-07-19" })] }), none, TODAY);
    const again = planNotifications(agenda({ upcoming: [item({ dueAt: "2026-07-19" })] }), none, TODAY);
    expect(plan.map((p) => p.id)).toEqual(again.map((p) => p.id));
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
    expect(hashId("x")).toBe(hashId("x"));
    expect(hashId("x")).not.toBe(hashId("y"));
  });
});

describe("sibling-occurrence keying", () => {
  it("does not collapse two siblings that differ only by instanceId", () => {
    const a = item({ dueAt: "2026-07-19", instanceId: "p1" });
    const b = item({ dueAt: "2026-07-19", instanceId: "p2" }); // same caseId/type/dueAt
    const plan = planNotifications(agenda({ upcoming: [a, b] }), none, TODAY);
    // each sibling → its own 3 fires (due day + 2 lead offsets); no Map overwrite
    expect(plan.filter((p) => p.caseId === "c1")).toHaveLength(6);
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length); // all ids distinct
  });

  it("acks one sibling occurrence without suppressing the other", () => {
    const a = item({ dueAt: "2026-07-19", instanceId: "h1", type: "Court hearing — framing" });
    const b = item({ dueAt: "2026-07-19", instanceId: "h2", type: "Court hearing — arguments" });
    const states = new Map([
      [alertKey("c1", "r1", "2026-07-19", "h1"),
       { caseId: "c1", ruleId: "r1", occurrenceDate: "2026-07-19", instanceId: "h1", state: "acknowledged" as const, snoozedUntil: null }],
    ]);
    const plan = planNotifications(agenda({ upcoming: [a, b] }), states, TODAY);
    // h1 fully acked → gone; h2 fully present (3 fires)
    expect(plan.some((p) => p.title.includes("framing"))).toBe(false);
    expect(plan.filter((p) => p.title.includes("arguments"))).toHaveLength(3);
  });
});
