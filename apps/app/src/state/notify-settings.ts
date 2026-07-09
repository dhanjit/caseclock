/**
 * OS-notification toggle (M8) — persisted in the encrypted DB meta table
 * (same pattern as the watchlist). Default ON; the officer can silence OS
 * alarms without touching iOS Settings. The in-app agenda is unaffected.
 */
import { create } from "zustand";
import { useSession } from "./session";

const KEY = "notify_enabled";

interface NotifySettingsState {
  enabled: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setEnabled: (value: boolean) => Promise<void>;
}

export const useNotifySettings = create<NotifySettingsState>((set) => ({
  enabled: true,
  loaded: false,
  async load() {
    try {
      const rows = await useSession.getState().client.query<{ value: string }>(
        `SELECT value FROM meta WHERE key='${KEY}'`,
      );
      set({ enabled: rows.length ? rows[0].value === "1" : true, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  async setEnabled(value) {
    await useSession.getState().client.exec(
      `INSERT INTO meta(key, value) VALUES ('${KEY}', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [value ? "1" : "0"],
    );
    set({ enabled: value });
  },
}));
