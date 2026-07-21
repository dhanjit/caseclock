/**
 * Demo-data loader — persists the two acceptance fixtures (docs/sample-cases.md) and
 * their banned-org watchlist entry. `save` upserts by id, so loading is idempotent.
 */

import { sampleAggregates, SAMPLE_CIO, SAMPLE_WATCHLIST } from "@/domain/seed";
import { useCases } from "./cases";
import { useCio } from "./cio";
import { useWatchlist } from "./watchlist";

export async function loadSampleData(): Promise<void> {
  const cases = useCases.getState();
  // Insert-only (review fix): re-loading must never clobber officer edits made to
  // a demo case — a fixture is written only when its id is absent.
  const existing = new Set(cases.aggregates.map((a) => a.case.id));
  for (const agg of sampleAggregates()) {
    if (!existing.has(agg.case.id)) await cases.save(agg);
  }
  const watchlist = useWatchlist.getState();
  for (const name of SAMPLE_WATCHLIST) {
    await watchlist.add(name);
  }
  // CIO master list (V7-6) — fixed ids referenced by the sample cases' H5.1.
  await useCio.getState().load();
  await useCio.getState().importRecords(SAMPLE_CIO);
}
