import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake of @capacitor/filesystem, recording operation order.
const files = new Map<string, string>();
const ops: string[] = [];

vi.mock("@capacitor/filesystem", () => {
  const key = (dir: string | undefined, path: string) => `${dir}:${path}`;
  return {
    Directory: { Library: "LIBRARY", LibraryNoCloud: "LIBRARY_NO_CLOUD" },
    Filesystem: {
      async writeFile(o: { path: string; directory?: string; data: string }) {
        ops.push(`write ${key(o.directory, o.path)}`);
        files.set(key(o.directory, o.path), o.data);
      },
      async readFile(o: { path: string; directory?: string }) {
        const data = files.get(key(o.directory, o.path));
        if (data === undefined) throw new Error("File does not exist");
        return { data };
      },
      async deleteFile(o: { path: string; directory?: string }) {
        if (!files.delete(key(o.directory, o.path))) throw new Error("File does not exist");
        ops.push(`delete ${key(o.directory, o.path)}`);
      },
      async rename(o: { from: string; to: string; directory?: string; toDirectory?: string }) {
        const from = key(o.directory, o.from);
        const data = files.get(from);
        if (data === undefined) throw new Error("File does not exist");
        files.delete(from);
        files.set(key(o.toDirectory ?? o.directory, o.to), data);
        ops.push(`rename ${from} -> ${o.to}`);
      },
    },
  };
});

import { createFilesystemSink } from "./fs-sink";

const bytes = (...n: number[]) => new Uint8Array(n);

describe("createFilesystemSink", () => {
  beforeEach(() => {
    files.clear();
    ops.length = 0;
  });

  it("is always available on native", () => {
    expect(createFilesystemSink().available()).toBe(true);
  });

  it("round-trips the vault", async () => {
    const sink = createFilesystemSink();
    await sink.saveVault("caseclock.vault", bytes(1, 2, 3));
    expect(await sink.loadVault("caseclock.vault")).toEqual(bytes(1, 2, 3));
  });

  it("loadVault returns null when nothing exists", async () => {
    expect(await createFilesystemSink().loadVault("caseclock.vault")).toBeNull();
  });

  it("stages through .tmp and promotes via rename", async () => {
    const sink = createFilesystemSink();
    await sink.saveVault("v", bytes(9));
    expect(ops).toContain("write LIBRARY:v.tmp");
    expect(ops.some((o) => o.startsWith("rename LIBRARY:v.tmp"))).toBe(true);
    expect(files.has("LIBRARY:v.tmp")).toBe(false); // tmp promoted away
  });

  it("keeps a .bak of the previous generation during the write, then drops it", async () => {
    const sink = createFilesystemSink();
    await sink.saveVault("v", bytes(1));
    await sink.saveVault("v", bytes(2));
    expect(ops).toContain("write LIBRARY:v.bak"); // previous gen staged
    expect(files.has("LIBRARY:v.bak")).toBe(false); // dropped after success
    expect(await sink.loadVault("v")).toEqual(bytes(2));
  });

  it("falls back to .bak when the primary is missing", async () => {
    const sink = createFilesystemSink();
    files.set("LIBRARY:v.bak", btoa(String.fromCharCode(7)));
    expect(await sink.loadVault("v")).toEqual(bytes(7));
  });

  it("stores blobs under blobs/ in the no-backup directory", async () => {
    const sink = createFilesystemSink();
    await sink.blobs.write("abc123", bytes(4, 5));
    expect(files.has("LIBRARY_NO_CLOUD:blobs/abc123")).toBe(true);
    expect(await sink.blobs.read("abc123")).toEqual(bytes(4, 5));
    await sink.blobs.delete("abc123");
    expect(await sink.blobs.read("abc123")).toBeNull();
    await sink.blobs.delete("abc123"); // deleting a missing blob is tolerated
  });
});
