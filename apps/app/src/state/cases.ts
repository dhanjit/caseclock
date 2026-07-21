import { create } from "zustand";
import { CaseRepository, type CaseAggregate } from "@/domain/repository";
import { useSession } from "./session";

function repo(): CaseRepository {
  return new CaseRepository(useSession.getState().client);
}

// Serialize all writes: the whole case is one JSON blob, so two overlapping
// saves built from the same render snapshot would clobber each other (last-write
// -wins). Queue them so each runs after the previous commits.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

interface CasesState {
  aggregates: CaseAggregate[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (agg: CaseAggregate) => Promise<void>;
  /** Read-modify-write against the LATEST committed state — overlap-safe. */
  patch: (id: string, updater: (a: CaseAggregate) => CaseAggregate) => Promise<void>;
  /** Toggle §1 priority. HARD cap 10 (V4-DELTA N17 / V6): promoting an 11th case
   * is blocked — demote one first. Demoting always succeeds. */
  setPriority: (id: string, value: boolean) => Promise<{ priorityCount: number; blocked: boolean }>;
  remove: (id: string) => Promise<void>;
  getById: (id: string) => CaseAggregate | undefined;
}

/** Hard cap on simultaneously-prioritised cases (V6: "Priority capped at 10 cases. Demote one first."). */
export const PRIORITY_CAP = 10;

export const useCases = create<CasesState>((set, get) => ({
  aggregates: [],
  loaded: false,

  async load() {
    const aggregates = await repo().list();
    set({ aggregates, loaded: true });
  },

  async save(agg) {
    await enqueue(async () => {
      await repo().save(agg);
      set({ aggregates: await repo().list() });
    });
  },

  async patch(id, updater) {
    await enqueue(async () => {
      const cur = get().aggregates.find((a) => a.case.id === id);
      if (!cur) return;
      await repo().save(updater(cur));
      set({ aggregates: await repo().list() });
    });
  },

  async setPriority(id, value) {
    // Priority is a supervisory flag, not case work — deliberately does NOT bump
    // lastTouchedAt (so pinning a quiet case can't mask its staleness).
    let blocked = false;
    await enqueue(async () => {
      const cur = get().aggregates.find((a) => a.case.id === id);
      if (!cur) return;
      if (value && !cur.case.priority) {
        const n = get().aggregates.filter((a) => a.case.priority).length;
        if (n >= PRIORITY_CAP) {
          blocked = true; // hard cap (V6) — demote one first
          return;
        }
      }
      await repo().save({ ...cur, case: { ...cur.case, priority: value } });
      set({ aggregates: await repo().list() });
    });
    const priorityCount = get().aggregates.filter((a) => a.case.priority).length;
    return { priorityCount, blocked };
  },

  async remove(id) {
    await enqueue(async () => {
      // V7-9 / Q4 edit-only: recorded cases cannot be deleted — only sample/demo
      // cases can. (The officer's prototype: "Cases you have entered are
      // edit-only and cannot be deleted.")
      const cur = get().aggregates.find((a) => a.case.id === id);
      if (cur && !cur.case.demo) return;
      await repo().remove(id);
      set({ aggregates: await repo().list() });
    });
  },

  getById(id) {
    return get().aggregates.find((a) => a.case.id === id);
  },
}));
