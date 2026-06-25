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
  remove: (id: string) => Promise<void>;
  getById: (id: string) => CaseAggregate | undefined;
}

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

  async remove(id) {
    await enqueue(async () => {
      await repo().remove(id);
      set({ aggregates: await repo().list() });
    });
  },

  getById(id) {
    return get().aggregates.find((a) => a.case.id === id);
  },
}));
