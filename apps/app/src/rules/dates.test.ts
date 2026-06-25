import { describe, it, expect } from "vitest";
import { addDays, addMonths, diffDays, isWeekend, addWorkingDays } from "./dates";

describe("date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2025-05-01", 90)).toBe("2025-07-30"); // 90-day chargesheet from first remand
    expect(addDays("2024-12-25", 10)).toBe("2025-01-04");
  });

  it("handles leap-year February", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // 2024 is a leap year
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01"); // 2023 is not
    expect(diffDays("2024-03-01", "2024-02-28")).toBe(2); // through the 29th
  });

  it("clamps addMonths to end-of-month", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2025-03-15", 2)).toBe("2025-05-15");
  });

  it("computes signed day differences", () => {
    expect(diffDays("2025-07-30", "2025-05-01")).toBe(90);
    expect(diffDays("2025-05-01", "2025-07-30")).toBe(-90);
    expect(diffDays("2025-05-01", "2025-05-01")).toBe(0);
  });

  it("is date-only by contract — a stray datetime truncates to its date, no NaN", () => {
    // A SupervisionEntry.createdAt-style datetime must not break the day math.
    expect(diffDays("2025-05-03T22:10:00Z", "2025-05-01")).toBe(2);
    expect(addDays("2025-05-01T23:59:59Z", 1)).toBe("2025-05-02");
  });

  it("identifies weekends", () => {
    expect(isWeekend("2025-05-03")).toBe(true); // Saturday
    expect(isWeekend("2025-05-04")).toBe(true); // Sunday
    expect(isWeekend("2025-05-05")).toBe(false); // Monday
  });

  it("adds working days, skipping weekends and holidays", () => {
    // 2025-05-01 is a Thursday. +7 working days, no holidays → 2025-05-12 (Mon).
    expect(addWorkingDays("2025-05-01", 7)).toBe("2025-05-12");
    // With a holiday on Fri 2025-05-02, the 7th working day slips one calendar day.
    expect(addWorkingDays("2025-05-01", 7, new Set(["2025-05-02"]))).toBe("2025-05-13");
  });
});
