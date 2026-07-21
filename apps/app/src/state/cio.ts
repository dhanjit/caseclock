/**
 * CIO master list (V7-6 / V4-DELTA §3) — Case Investigating Officers {name, rank},
 * app-level reference data stored in the encrypted DB meta (same pattern as the
 * watchlist). Every case's H5.1 "Name of CIO" dropdown reads from this list.
 * Reference data is deletable — unlike case records, which are edit-only.
 */

import { create } from "zustand";
import type { CioRecord } from "@/domain/types";
import { useSession } from "./session";

const KEY = "cio_list";

async function read(): Promise<CioRecord[]> {
  try {
    const rows = await useSession.getState().client.query<{ value: string }>(
      `SELECT value FROM meta WHERE key='${KEY}'`,
    );
    return rows.length ? (JSON.parse(rows[0].value) as CioRecord[]) : [];
  } catch {
    return [];
  }
}
async function write(list: CioRecord[]): Promise<void> {
  await useSession.getState().client.exec(
    `INSERT INTO meta(key, value) VALUES ('${KEY}', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(list)],
  );
}

interface CioState {
  officers: CioRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (name: string, rank?: string) => Promise<void>;
  update: (id: string, patch: Partial<Pick<CioRecord, "name" | "rank">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Re-rank: move the officer at index i by dir (-1 up / +1 down). */
  move: (index: number, dir: -1 | 1) => Promise<void>;
  getById: (id: string | null | undefined) => CioRecord | undefined;
}

export const useCio = create<CioState>((set, get) => ({
  officers: [],
  loaded: false,
  async load() {
    set({ officers: await read(), loaded: true });
  },
  async add(name, rank) {
    const n = name.trim();
    if (!n) return;
    const officers = [...get().officers, { id: crypto.randomUUID(), name: n, rank: rank?.trim() || undefined }];
    await write(officers);
    set({ officers });
  },
  async update(id, patch) {
    const officers = get().officers.map((o) => (o.id === id ? { ...o, ...patch } : o));
    await write(officers);
    set({ officers });
  },
  async remove(id) {
    const officers = get().officers.filter((o) => o.id !== id);
    await write(officers);
    set({ officers });
  },
  async move(index, dir) {
    const cur = get().officers;
    const j = index + dir;
    if (index < 0 || index >= cur.length || j < 0 || j >= cur.length) return;
    const officers = [...cur];
    [officers[index], officers[j]] = [officers[j], officers[index]];
    await write(officers);
    set({ officers });
  },
  getById(id) {
    return id ? get().officers.find((o) => o.id === id) : undefined;
  },
}));
