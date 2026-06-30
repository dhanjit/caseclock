import { describe, it, expect, beforeEach } from "vitest";
import { DocumentRepository, type DocumentDraft } from "./document";
import { AttachmentRepository } from "./attachment";
import { CaseRepository } from "./repository";
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

function draft(over: Partial<DocumentDraft> = {}): DocumentDraft {
  return { source: "index", letterNo: "LOC-2210/24", dateOnDoc: "2024-08-01", type: "LOC", subject: "Look-out circular", confidence: 0.9, ...over };
}

describe("DocumentRepository (§7)", () => {
  let client: MemoryDbClient;
  let repo: DocumentRepository;

  beforeEach(async () => {
    client = new MemoryDbClient();
    await client.createVault("x"); // runs migrations incl. 3→4 documents table
    repo = new DocumentRepository(client, new BlobStore(client, memBackend()));
  });

  it("the 3→4 migration creates the documents table", async () => {
    const rows = await client.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='documents'",
    );
    expect(rows).toHaveLength(1);
  });

  it("saves confirmed drafts in one batch and lists them", async () => {
    await repo.addConfirmed("c1", [draft(), draft({ letterNo: "REF-FR/12", type: "letter", dateOnDoc: "2026-06-05" })]);
    const list = await repo.listForCase("c1");
    expect(list).toHaveLength(2);
    expect(list.every((d) => d.status === "confirmed")).toBe(true);
    expect(list.map((d) => d.letterNo).sort()).toEqual(["LOC-2210/24", "REF-FR/12"]);
  });

  it("orders by date descending", async () => {
    await repo.addConfirmed("c1", [draft({ dateOnDoc: "2024-01-01" }), draft({ dateOnDoc: "2026-06-05" })]);
    const list = await repo.listForCase("c1");
    expect(list[0].dateOnDoc).toBe("2026-06-05");
  });

  it("stashes an attached original in the sidecar and reads it back", async () => {
    await repo.addConfirmed("c1", [draft({ original: new Uint8Array([1, 2, 3, 4]), fileName: "loc.pdf", mime: "application/pdf" })]);
    const [d] = await repo.listForCase("c1");
    expect(d.blobRef).toBeTruthy();
    const bytes = await repo.getOriginal(d.blobRef!);
    expect(Array.from(bytes!)).toEqual([1, 2, 3, 4]);
  });

  it("index-only entries carry no blobRef", async () => {
    await repo.addConfirmed("c1", [draft()]);
    const [d] = await repo.listForCase("c1");
    expect(d.blobRef).toBeNull();
  });

  it("update() edits fields; remove() deletes + GCs the orphan original", async () => {
    await repo.addConfirmed("c1", [draft({ original: new Uint8Array([9, 9]) })]);
    const [d] = await repo.listForCase("c1");
    await repo.update(d.id, { subject: "edited subject", letterNo: "NEW-1/26" });
    const [d2] = await repo.listForCase("c1");
    expect(d2.subject).toBe("edited subject");
    expect(d2.letterNo).toBe("NEW-1/26");
    await repo.remove(d2.id);
    expect(await repo.listForCase("c1")).toHaveLength(0);
    expect(await repo.getOriginal(d.blobRef!)).toBeNull();
  });
});

describe("cross-table sidecar GC (attachments ⇄ documents share one blob store)", () => {
  let client: MemoryDbClient;
  let backend: BlobBackend;
  let docs: DocumentRepository;
  let atts: AttachmentRepository;
  const SAME = new Uint8Array([42, 42, 42, 42]);

  beforeEach(async () => {
    client = new MemoryDbClient();
    await client.createVault("x");
    backend = memBackend();
    docs = new DocumentRepository(client, new BlobStore(client, backend));
    atts = new AttachmentRepository(client, new BlobStore(client, backend));
  });

  it("deleting an attachment does NOT delete an original a document still references", async () => {
    // Same bytes imported as both a gallery image and a document → one shared blobRef.
    await atts.addMany([{ caseId: "c1", kind: "evidence", mime: "image/jpeg", thumb: new Uint8Array([1]), original: SAME }]);
    await docs.addConfirmed("c1", [draft({ original: SAME, fileName: "scan.jpg", mime: "image/jpeg" })]);
    const [a] = await atts.listForCase("c1");
    const [d] = await docs.listForCase("c1");
    expect(a.blobRef).toBe(d.blobRef); // deduped to one sidecar file

    await atts.remove(a.id);
    // The document still points at the shared original — it must survive.
    expect(await docs.getOriginal(d.blobRef!)).not.toBeNull();

    // Now remove the last referencing row → the sidecar is finally GC'd.
    await docs.remove(d.id);
    expect(await docs.getOriginal(d.blobRef!)).toBeNull();
  });

  it("CaseRepository.remove purges child rows AND GCs their sidecar originals", async () => {
    const cases = new CaseRepository(client, new BlobStore(client, backend));
    await cases.save({
      case: { id: "cX", firNumber: "1/26", firDate: "2026-01-01", uapaFlag: false, status: "investigation" } as never,
      persons: [], hearings: [], supervisionEntries: [], tasks: [],
    });
    await atts.addMany([{ caseId: "cX", kind: "evidence", mime: "image/jpeg", thumb: new Uint8Array([1]), original: new Uint8Array([7, 7]) }]);
    await docs.addConfirmed("cX", [draft({ original: new Uint8Array([8, 8]), mime: "application/pdf" })]);
    const [a] = await atts.listForCase("cX");
    const [d] = await docs.listForCase("cX");

    await cases.remove("cX");

    expect(await atts.listForCase("cX")).toHaveLength(0);
    expect(await docs.listForCase("cX")).toHaveLength(0);
    // Both sidecar originals are reclaimed — nothing left on device for a deleted case.
    expect(await atts.getOriginal(a.blobRef)).toBeNull();
    expect(await docs.getOriginal(d.blobRef!)).toBeNull();
  });
});
