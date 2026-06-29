import { describe, it, expect, beforeEach } from "vitest";
import { BlobStore, type BlobBackend } from "./blob-store";
import { MemoryDbClient } from "./memory-client";

/** In-memory backend so the store is testable without OPFS (node). */
function memBackend(): BlobBackend & { size: () => number } {
  const m = new Map<string, Uint8Array>();
  return {
    async write(n, b) {
      m.set(n, b.slice());
    },
    async read(n) {
      return m.get(n) ?? null;
    },
    async delete(n) {
      m.delete(n);
    },
    size: () => m.size,
  };
}

describe("BlobStore — content-addressed encrypted sidecar", () => {
  let client: MemoryDbClient;
  beforeEach(async () => {
    client = new MemoryDbClient();
    await client.createVault("x");
  });

  it("round-trips bytes through put → get", async () => {
    const store = new BlobStore(client, memBackend());
    const data = new Uint8Array([1, 2, 3, 250, 0, 255, 13, 10]);
    const ref = await store.put(data);
    expect(ref).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    const got = await store.get(ref);
    expect(got).not.toBeNull();
    expect(Array.from(got!)).toEqual(Array.from(data));
  });

  it("dedups identical content to the same ref and stores it once", async () => {
    const backend = memBackend();
    const store = new BlobStore(client, backend);
    const a = await store.put(new Uint8Array([9, 9, 9]));
    const b = await store.put(new Uint8Array([9, 9, 9]));
    expect(a).toBe(b);
    expect(backend.size()).toBe(1);
  });

  it("gives different refs to different content", async () => {
    const store = new BlobStore(client, memBackend());
    const a = await store.put(new Uint8Array([1]));
    const b = await store.put(new Uint8Array([2]));
    expect(a).not.toBe(b);
  });

  it("get() returns null for an unknown ref", async () => {
    const store = new BlobStore(client, memBackend());
    expect(await store.get("0".repeat(64))).toBeNull();
  });

  it("remove() deletes the blob", async () => {
    const store = new BlobStore(client, memBackend());
    const ref = await store.put(new Uint8Array([5, 6, 7]));
    await store.remove(ref);
    expect(await store.get(ref)).toBeNull();
  });
});
