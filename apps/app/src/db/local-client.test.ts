import { describe, it, expect } from "vitest";
import { LocalDbClient } from "./local-client";
import type { VaultStore } from "./vault-store";
import { KDF_FLOOR, type KdfParams } from "@/crypto/envelope";

// Low-cost KDF so Argon2id doesn't dominate the test runtime (mirrors sqlite-blob.test).
const KDF: KdfParams = { algo: "argon2id", opslimit: KDF_FLOOR.opslimit, memlimit: KDF_FLOOR.memlimit };
const PASS = "local-client-node-passphrase-4417";

/** In-memory VaultStore so LocalDbClient is testable in node (no OPFS). */
function memVaultStore(): VaultStore & { has: (n: string) => boolean; get: (n: string) => Uint8Array | undefined } {
  const m = new Map<string, Uint8Array>();
  return {
    available: () => true,
    async load(name) {
      return m.get(name) ?? null;
    },
    async save(name, bytes) {
      m.set(name, bytes.slice());
    },
    has: (n) => m.has(n),
    get: (n) => m.get(n),
  };
}

describe("LocalDbClient — persistence through the injected VaultStore", () => {
  it("createVault persists encrypted bytes through the store, and a fresh client unlocks them", async () => {
    const store = memVaultStore();

    const c1 = new LocalDbClient(KDF, store);
    expect(await c1.vaultExists()).toBe(false);

    await c1.createVault(PASS);
    expect(store.has("caseclock.vault")).toBe(true);

    // What hits the store is ciphertext — not even a plaintext SQLite header.
    const blob = store.get("caseclock.vault")!;
    expect(new TextDecoder().decode(blob.subarray(0, 16))).not.toContain("SQLite");

    await c1.exec("INSERT INTO meta(key, value) VALUES (?, ?)", ["district", "Civil Lines"]);
    await c1.lock();

    // A brand-new client over the SAME store must recover the data (the native
    // app-restart / process-kill case — proves the seam round-trips).
    const c2 = new LocalDbClient(KDF, store);
    expect(await c2.vaultExists()).toBe(true);
    await c2.unlock(PASS);
    const rows = await c2.query<{ value: string }>("SELECT value FROM meta WHERE key = ?", ["district"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("Civil Lines");
    await c2.lock();
  });

  it("wrong passphrase against a populated store throws", async () => {
    const store = memVaultStore();
    await new LocalDbClient(KDF, store).createVault(PASS).then(() => {});
    const c = new LocalDbClient(KDF, store);
    await expect(c.unlock("not-the-passphrase")).rejects.toThrow();
  });

  it("defaults to the OPFS store, which reports unavailable in node (no silent no-op)", async () => {
    // No store injected → opfsVaultStore. In node OPFS is absent, so vaultExists
    // must surface the unavailable error rather than pretend there's no vault.
    const c = new LocalDbClient(KDF);
    await expect(c.vaultExists()).rejects.toThrow(/Persistent storage|OPFS|unavailable/i);
  });
});
