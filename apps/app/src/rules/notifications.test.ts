import { describe, expect, it } from "vitest";
import { materializeNotifications } from "./notifications";
import type { Agenda, AgendaItem } from "./agenda";
import type { DeadlineEvent } from "@/domain/types";
import { addDays, type ISODate } from "./dates";

const TODAY: ISODate = "2026-07-02";

function mkDeadline(p: Partial<DeadlineEvent> = {}): DeadlineEvent {
  const dueAt = p.dueAt ?? null;
  return {
    caseId: "c1",
    ruleId: "chargesheet-90",
    type: "Chargesheet (90-day)",
    dueAt,
    occurrenceDate: p.occurrenceDate ?? dueAt,
    severity: "statutory",
    lawRef: "BNSS 187",
    verified: "confirmed",
    state: "active",
    track: "investigation",
    leadOffsets: [],
    ...p,
  };
}

function mkItem(
  p: Omit<Partial<AgendaItem>, "deadline"> & { deadline?: Partial<DeadlineEvent> } = {},
): AgendaItem {
  const deadline = mkDeadline(p.deadline);
  return {
    caseId: deadline.caseId,
    caseLabel: p.caseLabel ?? "FIR 12/2026 — Test PS",
    deadline,
    bucket: p.bucket ?? "upcoming",
    daysUntil: p.daysUntil ?? (deadline.dueAt ? 0 : null),
    priority: p.priority ?? true,
    silent: p.silent ?? false,
  };
}

function agenda(parts: Partial<Agenda>): Agenda {
  return { overdue: [], today: [], upcoming: [], ...parts };
}

describe("materializeNotifications — lead-offset expansion", () => {
  it("emits a notification for the due day and each lead-offset date within the horizon", () => {
    const dueAt = addDays(TODAY, 10); // 2026-07-12
    const item = mkItem({
      bucket: "upcoming",
      daysUntil: 10,
      deadline: { dueAt, occurrenceDate: dueAt, leadOffsets: [7, 3, 1], severity: "statutory" },
    });

    const { scheduled, droppedForCap } = materializeNotifications(agenda({ upcoming: [item] }), TODAY);

    const fireDates = scheduled.map((n) => n.fireAt).sort();
    expect(fireDates).toEqual([
      addDays(TODAY, 3), // due − 7
      addDays(TODAY, 7), // due − 3
      addDays(TODAY, 9), // due − 1
      addDays(TODAY, 10), // due day
    ]);
    expect(droppedForCap).toBe(0);
  });
});

describe("materializeNotifications — overdue bounded daily run", () => {
  it("emits exactly overdueRunDays daily notifications starting tomorrow for an overdue item", () => {
    const dueAt = addDays(TODAY, -5);
    const item = mkItem({
      bucket: "overdue",
      daysUntil: -5,
      deadline: { dueAt, occurrenceDate: dueAt, state: "overdue", severity: "statutory-critical" },
    });

    const { scheduled } = materializeNotifications(agenda({ overdue: [item] }), TODAY, {
      overdueRunDays: 14,
    });

    expect(scheduled).toHaveLength(14);
    const fireDates = scheduled.map((n) => n.fireAt).sort();
    expect(fireDates[0]).toBe(addDays(TODAY, 1));
    expect(fireDates[13]).toBe(addDays(TODAY, 14));
    // distinct ids per day so the plugin schedules 14 separate alarms
    expect(new Set(scheduled.map((n) => n.id)).size).toBe(14);
  });

  it("labels overdue notifications as OVERDUE", () => {
    const dueAt = addDays(TODAY, -1);
    const item = mkItem({ bucket: "overdue", daysUntil: -1, deadline: { dueAt, state: "overdue" } });
    const { scheduled } = materializeNotifications(agenda({ overdue: [item] }), TODAY, {
      overdueRunDays: 1,
    });
    expect(scheduled[0].body).toMatch(/overdue/i);
  });
});

describe("materializeNotifications — priority model (silent items)", () => {
  it("excludes silent (non-priority overdue) items — they stay in-app only", () => {
    const dueAt = addDays(TODAY, -3);
    const silentItem = mkItem({
      bucket: "overdue",
      daysUntil: -3,
      priority: false,
      silent: true,
      deadline: { caseId: "quiet", dueAt, state: "overdue" },
    });
    const loudItem = mkItem({
      bucket: "overdue",
      daysUntil: -3,
      priority: true,
      silent: false,
      deadline: { caseId: "loud", dueAt, state: "overdue" },
    });

    const { scheduled } = materializeNotifications(
      agenda({ overdue: [silentItem, loudItem] }),
      TODAY,
      { overdueRunDays: 5 },
    );

    expect(scheduled.every((n) => n.extra.caseId === "loud")).toBe(true);
    expect(scheduled).toHaveLength(5);
  });
});

describe("materializeNotifications — iOS 64-cap", () => {
  it("caps at maxScheduled and reports the dropped count (no silent truncation)", () => {
    const upcoming = Array.from({ length: 70 }, (_, i) =>
      mkItem({
        bucket: "upcoming",
        daysUntil: 1,
        deadline: { caseId: `c${i}`, dueAt: addDays(TODAY, 1), occurrenceDate: addDays(TODAY, 1) },
      }),
    );
    const { scheduled, droppedForCap } = materializeNotifications(agenda({ upcoming }), TODAY);
    expect(scheduled).toHaveLength(64);
    expect(droppedForCap).toBe(6);
  });

  it("keeps the higher-severity item when the cap forces a drop, even if it fires later", () => {
    const statutory = Array.from({ length: 64 }, (_, i) =>
      mkItem({
        bucket: "upcoming",
        deadline: {
          caseId: `s${i}`,
          dueAt: addDays(TODAY, 2),
          occurrenceDate: addDays(TODAY, 2),
          severity: "statutory",
        },
      }),
    );
    const critical = mkItem({
      bucket: "upcoming",
      deadline: {
        caseId: "crit",
        dueAt: addDays(TODAY, 5),
        occurrenceDate: addDays(TODAY, 5),
        severity: "statutory-critical",
      },
    });
    const { scheduled, droppedForCap } = materializeNotifications(
      agenda({ upcoming: [...statutory, critical] }),
      TODAY,
    );
    expect(scheduled).toHaveLength(64);
    expect(droppedForCap).toBe(1);
    expect(scheduled.some((n) => n.extra.caseId === "crit")).toBe(true);
  });
});

describe("materializeNotifications — window + determinism", () => {
  it("excludes fire dates beyond the horizon and on/ before today", () => {
    const inHorizon = mkItem({
      bucket: "upcoming",
      deadline: { caseId: "in", dueAt: addDays(TODAY, 30), occurrenceDate: addDays(TODAY, 30) },
    });
    const beyond = mkItem({
      bucket: "upcoming",
      deadline: { caseId: "out", dueAt: addDays(TODAY, 31), occurrenceDate: addDays(TODAY, 31) },
    });
    const { scheduled } = materializeNotifications(agenda({ upcoming: [inHorizon, beyond] }), TODAY);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].extra.caseId).toBe("in");
    expect(scheduled[0].fireAt).toBe(addDays(TODAY, 30));
  });

  it("produces identical ids across runs (idempotent reschedule)", () => {
    const item = mkItem({
      bucket: "upcoming",
      deadline: { dueAt: addDays(TODAY, 5), occurrenceDate: addDays(TODAY, 5), leadOffsets: [3, 1] },
    });
    const a = materializeNotifications(agenda({ upcoming: [item] }), TODAY);
    const b = materializeNotifications(agenda({ upcoming: [item] }), TODAY);
    expect(a.scheduled.map((n) => n.id)).toEqual(b.scheduled.map((n) => n.id));
  });

  it("returns an empty result for an empty agenda", () => {
    const { scheduled, droppedForCap } = materializeNotifications(agenda({}), TODAY);
    expect(scheduled).toEqual([]);
    expect(droppedForCap).toBe(0);
  });
});
