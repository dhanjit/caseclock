/**
 * Session/lock state (PLAN §6.5). Owns the single DbClient instance and the
 * lock lifecycle the whole app gates on.
 */

import { create } from "zustand";
import { createDbClient, type DbClient } from "@/db";

export type SessionStatus = "loading" | "no-vault" | "locked" | "unlocked" | "unsupported";

interface SessionState {
  status: SessionStatus;
  error: string | null;
  client: DbClient;
  init: () => Promise<void>;
  createVault: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => Promise<void>;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const client = createDbClient();

export const useSession = create<SessionState>((set) => ({
  status: "loading",
  error: null,
  client,

  async init() {
    try {
      const exists = await client.vaultExists();
      set({ status: exists ? "locked" : "no-vault", error: null });
    } catch (e) {
      set({ status: "unsupported", error: msg(e) });
    }
  },

  async createVault(passphrase) {
    set({ error: null });
    try {
      await client.createVault(passphrase);
      set({ status: "unlocked", error: null });
    } catch (e) {
      console.error("[CaseClock] createVault failed:", e);
      set({ error: msg(e) });
      throw e;
    }
  },

  async unlock(passphrase) {
    set({ error: null });
    try {
      await client.unlock(passphrase);
      set({ status: "unlocked", error: null });
    } catch (e) {
      console.error("[CaseClock] unlock failed:", e);
      set({ error: msg(e) });
      throw e;
    }
  },

  async lock() {
    await client.lock();
    set({ status: "locked", error: null });
  },
}));
