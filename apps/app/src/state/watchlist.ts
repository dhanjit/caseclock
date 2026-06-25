/**
 * Banned organisations / terrorists watchlist (REQUIREMENTS §5) — GLOBAL
 * (system-wide), stored in the encrypted DB meta. Any fed name is auto-marked
 * RED wherever it appears (see Highlighted).
 */

import { create } from "zustand";
import { useSession } from "./session";

async function read(): Promise<string[]> {
  try {
    const rows = await useSession.getState().client.query<{ value: string }>(
      "SELECT value FROM meta WHERE key='watchlist'",
    );
    return rows.length ? (JSON.parse(rows[0].value) as string[]) : [];
  } catch {
    return [];
  }
}
async function write(list: string[]): Promise<void> {
  await useSession.getState().client.exec(
    "INSERT INTO meta(key, value) VALUES ('watchlist', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(list)],
  );
}

interface WatchlistState {
  names: string[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (name: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
}

export const useWatchlist = create<WatchlistState>((set, get) => ({
  names: [],
  loaded: false,
  async load() {
    set({ names: await read(), loaded: true });
  },
  async add(name) {
    const n = name.trim();
    if (!n) return;
    // case-insensitive dedup (the highlight match is case-insensitive anyway)
    if (get().names.some((x) => x.toLowerCase() === n.toLowerCase())) return;
    const names = [...get().names, n];
    await write(names);
    set({ names });
  },
  async remove(name) {
    const names = get().names.filter((x) => x !== name);
    await write(names);
    set({ names });
  },
}));
