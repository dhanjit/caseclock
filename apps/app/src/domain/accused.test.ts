import { describe, it, expect } from "vitest";
import { ACCUSED_STATUS_META, ACCUSED_STATUS_ORDER, accusedStatusMeta } from "./accused";

describe("accused status meta", () => {
  it("has meta for every ordered status", () => {
    for (const s of ACCUSED_STATUS_ORDER) {
      expect(ACCUSED_STATUS_META[s]).toBeDefined();
      expect(ACCUSED_STATUS_META[s].badge).toBeTruthy();
    }
  });

  it("never throws on a stale/unknown/empty status — returns a safe fallback", () => {
    // A persisted record from an older schema could carry a value not in the enum.
    expect(() => accusedStatusMeta("in_judicial_custody" as never)).not.toThrow();
    expect(accusedStatusMeta("in_judicial_custody" as never).badge).toBeTruthy();
    expect(accusedStatusMeta(undefined).label).toBe("Unknown");
    expect(accusedStatusMeta(null).badge).toBeTruthy();
  });

  it("resolves a valid status to its real meta", () => {
    expect(accusedStatusMeta("judicial_custody").label).toBe("Judicial custody");
  });
});
