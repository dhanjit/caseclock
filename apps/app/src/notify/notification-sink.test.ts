import { describe, expect, it } from "vitest";
import { DEFAULT_FIRE_HOUR, localFireDate, toLocalSchema } from "./notification-sink";
import type { ScheduledNotification } from "@/rules/notifications";

describe("localFireDate", () => {
  it("returns the given calendar day at the local fire-hour (no UTC drift)", () => {
    const dt = localFireDate("2026-07-12", 9);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(6); // July (0-indexed)
    expect(dt.getDate()).toBe(12);
    expect(dt.getHours()).toBe(9);
    expect(dt.getMinutes()).toBe(0);
  });

  it("defaults to 09:00 local", () => {
    expect(localFireDate("2026-07-12").getHours()).toBe(DEFAULT_FIRE_HOUR);
    expect(DEFAULT_FIRE_HOUR).toBe(9);
  });
});

describe("toLocalSchema", () => {
  it("maps a materialized notification to the Capacitor schema, preserving id/extra", () => {
    const n: ScheduledNotification = {
      id: 12345,
      title: "FIR 12/2026",
      body: "Chargesheet (90-day) due 2026-07-12",
      fireAt: "2026-07-12",
      severity: "statutory",
      extra: { caseId: "c1", ruleId: "chargesheet-90", occurrenceDate: "2026-07-12" },
    };
    const schema = toLocalSchema(n);
    expect(schema.id).toBe(12345);
    expect(schema.title).toBe("FIR 12/2026");
    expect(schema.body).toBe(n.body);
    expect(schema.extra).toEqual(n.extra);
    expect(schema.schedule?.at).toEqual(localFireDate("2026-07-12", 9));
    expect(schema.schedule?.allowWhileIdle).toBe(true);
  });
});
