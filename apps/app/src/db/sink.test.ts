import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Library: "LIBRARY", LibraryNoCloud: "LIBRARY_NO_CLOUD" },
  Filesystem: {},
}));

import { Capacitor } from "@capacitor/core";
import { vaultSink, __resetVaultSinkForTests } from "./sink";

const isNative = Capacitor.isNativePlatform as unknown as ReturnType<typeof vi.fn>;

describe("vaultSink platform selection", () => {
  beforeEach(() => __resetVaultSinkForTests());
  afterEach(() => __resetVaultSinkForTests());

  it("uses the Filesystem sink on native (always available)", () => {
    isNative.mockReturnValue(true);
    expect(vaultSink().available()).toBe(true);
  });

  it("uses the OPFS sink on web — available() is false in the node test env (no navigator.storage)", () => {
    isNative.mockReturnValue(false);
    expect(vaultSink().available()).toBe(false);
  });

  it("memoizes — the first call wins until reset", () => {
    isNative.mockReturnValue(true);
    const a = vaultSink();
    isNative.mockReturnValue(false);
    expect(vaultSink()).toBe(a); // cached; platform re-check skipped
    __resetVaultSinkForTests();
    expect(vaultSink()).not.toBe(a); // fresh after reset
  });
});
