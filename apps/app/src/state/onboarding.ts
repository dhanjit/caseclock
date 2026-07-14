/**
 * First-run onboarding (demo mode). A brand-new officer lands in a populated
 * cockpit — the sample cases from docs/sample-cases.md — so the statutory-clock
 * features are visible immediately. A banner lets them clear the demo and start
 * with their own data. The choice is remembered in the encrypted meta table
 * (same pattern as notify-settings / watchlist), so the demo is seeded ONCE and
 * never returns after a clear.
 *
 *   meta.demo_state:  (unset) = never onboarded · "active" = demo loaded, banner on
 *                     · "cleared" = user started fresh, no banner, no re-seed
 */
import { create } from "zustand";
import { useSession } from "./session";
import { useCases } from "./cases";
import { useWatchlist } from "./watchlist";
import { loadSampleData } from "./seed";

const KEY = "demo_state";

async function readState(): Promise<string | null> {
  try {
    const rows = await useSession
      .getState()
      .client.query<{ value: string }>(`SELECT value FROM meta WHERE key='${KEY}'`);
    return rows.length ? rows[0].value : null;
  } catch {
    return null;
  }
}

async function writeState(value: string): Promise<void> {
  await useSession
    .getState()
    .client.exec(
      `INSERT INTO meta(key, value) VALUES ('${KEY}', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [value],
    );
}

interface OnboardingState {
  demoActive: boolean;
  loaded: boolean;
  /** Read the persisted demo_state (banner visibility) without side effects. */
  load: () => Promise<void>;
  /** First run only: seed demo cases + mark active, iff never onboarded and the vault is empty. */
  maybeStartDemo: () => Promise<void>;
  /** Wipe all cases + watchlist, mark cleared, and drop the banner. */
  clearAndReset: () => Promise<void>;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  demoActive: false,
  loaded: false,

  async load() {
    set({ demoActive: (await readState()) === "active", loaded: true });
  },

  async maybeStartDemo() {
    const state = await readState();
    if (state !== null) {
      // Already decided (active or cleared) — just reflect it, never re-seed.
      set({ demoActive: state === "active", loaded: true });
      return;
    }
    // First run. Seed only into a genuinely empty vault; if cases somehow already
    // exist, treat the user as onboarded so we never inject demo data over real work.
    if (useCases.getState().aggregates.length === 0) {
      await loadSampleData();
      await writeState("active");
      set({ demoActive: true, loaded: true });
    } else {
      await writeState("cleared");
      set({ demoActive: false, loaded: true });
    }
  },

  async clearAndReset() {
    // Snapshot ids first — the stores mutate as we remove.
    const cases = useCases.getState();
    for (const agg of [...cases.aggregates]) await cases.remove(agg.case.id);
    const watchlist = useWatchlist.getState();
    for (const name of [...watchlist.names]) await watchlist.remove(name);
    await writeState("cleared");
    set({ demoActive: false });
  },
}));
