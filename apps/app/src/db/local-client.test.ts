/**
 * LocalDbClient against a mocked VaultSink — the torn-write recovery path
 * (HIGH deferred finding: corrupt primary must fall back to .bak) and the
 * createVault serialization fix.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KDF_FLOOR, type KdfParams } from "@/crypto/envelope";

// In-memory VaultSink fake, swapped in for both platform sinks.
const store = new Map<string, Uint8Array>();
let saveCount = 0;
let saveInFlight = 0;
let maxSaveConcurrency = 0;

vi.mock("./sink", () => ({
  vaultSink: () => ({
    available: () => true,
    loadVault: async (name: string) => store.get(name) ?? store.get(`${name}.bak`) ?? null,
    loadVaultBackup: async (name: string) => store.get(`${name}.bak`) ?? null,
    saveVault: async (name: string, ciphertext: Uint8Array) => {
      saveCount++;
      saveInFlight++;
      maxSaveConcurrency = Math.max(maxSaveConcurrency, saveInFlight);
      await new Promise((r) => setTimeout(r, 0)); // widen the overlap window
      store.set(name, ciphertext.slice());
      saveInFlight--;
    },
    blobs: {
      write: async () => {},
      read: async () => null,
      delete: async () => {},
    },
  }),
  __resetVaultSinkForTests: () => {},
}));

import { LocalDbClient } from "./local-client";

const KDF: KdfParams = {
  algo: "argon2id",
  opslimit: KDF_FLOOR.opslimit,
  memlimit: KDF_FLOOR.memlimit,
};
const VAULT = "caseclock.vault";
const PASS = "correct horse battery staple";

describe("LocalDbClient (mocked sink)", () => {
  beforeEach(() => {
    store.clear();
    saveCount = 0;
    saveInFlight = 0;
    maxSaveConcurrency = 0;
  });

  it("unlock recovers from a corrupt primary via the .bak generation and self-heals", async () => {
    const writer = new LocalDbClient(KDF);
    await writer.createVault(PASS);
    await writer.exec("INSERT INTO meta(key, value) VALUES ('probe', 'alive')");
    await writer.lock();

    // Simulate a torn write: good generation demoted to .bak, primary garbage.
    store.set(`${VAULT}.bak`, store.get(VAULT)!);
    store.set(VAULT, crypto.getRandomValues(new Uint8Array(64)));

    const reader = new LocalDbClient(KDF);
    await reader.unlock(PASS);
    const rows = await reader.query<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'probe'",
    );
    expect(rows).toEqual([{ value: "alive" }]);

    // Self-heal: unlock's persist rewrote the primary, so a fresh client
    // unlocks from the primary alone.
    store.delete(`${VAULT}.bak`);
    const third = new LocalDbClient(KDF);
    await third.unlock(PASS);
    expect(await third.query("SELECT 1 AS one")).toEqual([{ one: 1 }]);
  });

  it("unlock with a wrong passphrase still fails when a .bak exists", async () => {
    const writer = new LocalDbClient(KDF);
    await writer.createVault(PASS);
    await writer.lock();
    store.set(`${VAULT}.bak`, crypto.getRandomValues(new Uint8Array(64)));

    await expect(new LocalDbClient(KDF).unlock("wrong passphrase")).rejects.toThrow();
  });

  it("unlock rethrows the primary error when both generations are corrupt", async () => {
    const writer = new LocalDbClient(KDF);
    await writer.createVault(PASS);
    await writer.lock();
    store.set(VAULT, crypto.getRandomValues(new Uint8Array(64)));
    store.set(`${VAULT}.bak`, crypto.getRandomValues(new Uint8Array(64)));

    await expect(new LocalDbClient(KDF).unlock(PASS)).rejects.toThrow();
  });

  it("concurrent createVault calls are serialized — exactly one wins, one sink write", async () => {
    const client = new LocalDbClient(KDF);
    const results = await Promise.allSettled([client.createVault(PASS), client.createVault(PASS)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already exists/);
    expect(saveCount).toBe(1);
    expect(maxSaveConcurrency).toBe(1); // sink contract: callers MUST serialize
  });
});
