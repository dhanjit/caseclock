import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("@/lib/platform", () => ({ isNativePlatform: vi.fn() }));

import { isNativePlatform } from "@/lib/platform";
import { selectNotificationSink } from "./index";
import { capacitorNotificationSink, noopNotificationSink } from "./notification-sink";

beforeEach(() => vi.clearAllMocks());

describe("selectNotificationSink — platform-correct notification sink", () => {
  it("uses the Capacitor local-notifications sink on a native platform", () => {
    (isNativePlatform as Mock).mockReturnValue(true);
    expect(selectNotificationSink()).toBe(capacitorNotificationSink);
  });

  it("uses the no-op sink on web / PWA (agenda is the system of record)", () => {
    (isNativePlatform as Mock).mockReturnValue(false);
    expect(selectNotificationSink()).toBe(noopNotificationSink);
  });
});
