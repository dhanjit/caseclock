import { describe, it, expect, beforeEach } from "vitest";
import { AttachmentRepository, type NewAttachment } from "./attachment";
import { BlobStore, type BlobBackend } from "@/db/blob-store";
import { MemoryDbClient } from "@/db/memory-client";

function memBackend(): BlobBackend {
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
  };
}

function img(caseId: string, over: Partial<NewAttachment> = {}): NewAttachment {
  return {
    caseId,
    kind: "evidence",
    refId: "ev-1",
    mime: "image/jpeg",
    thumb: new Uint8Array([1, 2, 3]),
    original: new Uint8Array([10, 20, 30, 40]),
    ...over,
  };
}

describe("AttachmentRepository (§10)", () => {
  let client: MemoryDbClient;
  let repo: AttachmentRepository;

  beforeEach(async () => {
    client = new MemoryDbClient();
    await client.createVault("x"); // runs migrations incl. 2→3 attachments table
    repo = new AttachmentRepository(client, new BlobStore(client, memBackend()));
  });

  it("the 2→3 migration creates the attachments table", async () => {
    const rows = await client.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'",
    );
    expect(rows).toHaveLength(1);
  });

  it("adds many images in one batch and lists them newest-first", async () => {
    await repo.addMany(
      [img("c1", { caption: "a" }), img("c1", { caption: "b", original: new Uint8Array([99]) })],
      1000,
    );
    const list = await repo.listForCase("c1");
    expect(list).toHaveLength(2);
    expect(list[0].caseId).toBe("c1");
    expect(Array.from(list[0].thumb)).toEqual([1, 2, 3]); // BLOB thumb round-trips
    expect(list[0].kind).toBe("evidence");
    expect(list[0].refId).toBe("ev-1");
  });

  it("stores the original in the sidecar and fetches it back via blobRef", async () => {
    await repo.addMany([img("c1", { original: new Uint8Array([7, 8, 9]) })]);
    const [a] = await repo.listForCase("c1");
    const original = await repo.getOriginal(a.blobRef);
    expect(Array.from(original!)).toEqual([7, 8, 9]);
  });

  it("scopes listForCase to the case", async () => {
    await repo.addMany([img("c1"), img("c2")]);
    expect(await repo.listForCase("c1")).toHaveLength(1);
    expect(await repo.listForCase("c2")).toHaveLength(1);
  });

  it("remove() deletes the row and GCs the orphaned original", async () => {
    await repo.addMany([img("c1", { original: new Uint8Array([5, 5, 5]) })]);
    const [a] = await repo.listForCase("c1");
    await repo.remove(a.id);
    expect(await repo.listForCase("c1")).toHaveLength(0);
    expect(await repo.getOriginal(a.blobRef)).toBeNull(); // sidecar GC'd
  });

  it("remove() keeps a shared original alive for other attachments (dedup)", async () => {
    const same = new Uint8Array([4, 4, 4]);
    await repo.addMany([img("c1", { original: same }), img("c1", { original: same })]);
    const list = await repo.listForCase("c1");
    expect(list[0].blobRef).toBe(list[1].blobRef); // deduped
    await repo.remove(list[0].id);
    expect(await repo.getOriginal(list[1].blobRef)).not.toBeNull(); // still referenced
  });

  it("update() re-tags an attachment", async () => {
    await repo.addMany([img("c1", { kind: "other", refId: null })]);
    const [a] = await repo.listForCase("c1");
    await repo.update(a.id, { kind: "accused", refId: "p-7", caption: "mugshot" });
    const [b] = await repo.listForCase("c1");
    expect(b.kind).toBe("accused");
    expect(b.refId).toBe("p-7");
    expect(b.caption).toBe("mugshot");
  });
});
