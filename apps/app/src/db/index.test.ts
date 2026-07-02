import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("@/lib/platform", () => ({ isNativePlatform: vi.fn() }));

import { isNativePlatform } from "@/lib/platform";
import { selectVaultStore } from "./index";
import { opfsVaultStore } from "./vault-store";
import { filesystemVaultStore } from "./filesystem-vault-store";

beforeEach(() => vi.clearAllMocks());

describe("selectVaultStore — platform-correct vault sink", () => {
  it("uses the native @capacitor/filesystem sink on a native platform", () => {
    (isNativePlatform as Mock).mockReturnValue(true);
    expect(selectVaultStore()).toBe(filesystemVaultStore);
  });

  it("uses the OPFS sink on web / PWA", () => {
    (isNativePlatform as Mock).mockReturnValue(false);
    expect(selectVaultStore()).toBe(opfsVaultStore);
  });
});
