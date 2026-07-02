import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared fake-filesystem state, hoisted so the vi.mock factory can close over it.
const h = vi.hoisted(() => ({
  files: new Map<string, string>(), // path -> base64
  dirsUsed: new Set<string>(),
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: {
    Documents: "DOCUMENTS",
    Data: "DATA",
    Library: "LIBRARY",
    LibraryNoCloud: "LIBRARY_NO_CLOUD",
    Cache: "CACHE",
  },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    writeFile: vi.fn(async ({ path, data, directory }: { path: string; data: string; directory: string }) => {
      h.dirsUsed.add(directory);
      h.files.set(path, data);
      return { uri: "mock://" + path };
    }),
    readFile: vi.fn(async ({ path }: { path: string }) => {
      if (!h.files.has(path)) throw new Error("File does not exist");
      return { data: h.files.get(path)! };
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => {
      if (!h.files.has(path)) throw new Error("File does not exist");
      h.files.delete(path);
    }),
    rename: vi.fn(async ({ from, to }: { from: string; to: string }) => {
      if (!h.files.has(from)) throw new Error("File does not exist");
      h.files.set(to, h.files.get(from)!);
      h.files.delete(from);
    }),
  },
}));

import { filesystemVaultStore } from "./filesystem-vault-store";

const NAME = "caseclock.vault";

beforeEach(() => {
  h.files.clear();
  h.dirsUsed.clear();
  vi.clearAllMocks();
});

describe("filesystemVaultStore — native @capacitor/filesystem sink", () => {
  it("round-trips arbitrary binary bytes (incl 0x00 and 0xFF) through save → load", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 0, 255, 13, 10, 200, 99, 0, 0, 127]);
    await filesystemVaultStore.save(NAME, bytes);
    const got = await filesystemVaultStore.load(NAME);
    expect(got).not.toBeNull();
    expect(Array.from(got!)).toEqual(Array.from(bytes));
  });

  it("round-trips a multi-KB payload (exercises chunked base64)", async () => {
    const big = new Uint8Array(200_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff; // deterministic, no RNG
    await filesystemVaultStore.save(NAME, big);
    const got = await filesystemVaultStore.load(NAME);
    expect(got).not.toBeNull();
    expect(got!.length).toBe(big.length);
    expect(Array.from(got!.subarray(0, 8))).toEqual(Array.from(big.subarray(0, 8)));
    expect(Array.from(got!.subarray(-8))).toEqual(Array.from(big.subarray(-8)));
  });

  it("load() returns null when no vault exists", async () => {
    expect(await filesystemVaultStore.load(NAME)).toBeNull();
  });

  it("persists ONLY to Directory.LibraryNoCloud (app-private, no iCloud, not in Files app)", async () => {
    await filesystemVaultStore.save(NAME, new Uint8Array([1, 2, 3]));
    expect([...h.dirsUsed]).toEqual(["LIBRARY_NO_CLOUD"]);
  });

  it("leaves only the primary file after a save (.tmp and .bak cleaned up)", async () => {
    await filesystemVaultStore.save(NAME, new Uint8Array([9, 8, 7]));
    expect(h.files.has(NAME)).toBe(true);
    expect(h.files.has(`${NAME}.tmp`)).toBe(false);
    expect(h.files.has(`${NAME}.bak`)).toBe(false);
  });

  it("overwrites a prior vault and loads the newest content", async () => {
    await filesystemVaultStore.save(NAME, new Uint8Array([1, 1, 1]));
    await filesystemVaultStore.save(NAME, new Uint8Array([2, 2, 2, 2]));
    expect(Array.from((await filesystemVaultStore.load(NAME))!)).toEqual([2, 2, 2, 2]);
  });

  it("recovers from the .bak generation if the primary is lost mid-write", async () => {
    const bytes = new Uint8Array([42, 7, 0, 255]);
    await filesystemVaultStore.save(NAME, bytes); // primary written, bak dropped
    // Simulate a crash that left .bak but lost the primary.
    h.files.set(`${NAME}.bak`, h.files.get(NAME)!);
    h.files.delete(NAME);
    const got = await filesystemVaultStore.load(NAME);
    expect(Array.from(got!)).toEqual(Array.from(bytes));
  });

  it("falls back to a direct write when atomic rename fails", async () => {
    const { Filesystem } = (await import("@capacitor/filesystem")) as unknown as {
      Filesystem: { rename: ReturnType<typeof vi.fn> };
    };
    Filesystem.rename.mockRejectedValueOnce(new Error("rename unsupported"));
    const bytes = new Uint8Array([5, 5, 5, 5, 5]);
    await filesystemVaultStore.save(NAME, bytes);
    expect(Array.from((await filesystemVaultStore.load(NAME))!)).toEqual(Array.from(bytes));
    expect(h.files.has(`${NAME}.tmp`)).toBe(false);
  });

  it("available() is true", () => {
    expect(filesystemVaultStore.available()).toBe(true);
  });
});
