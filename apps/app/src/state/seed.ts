/**
 * Demo-data loader — persists the two acceptance fixtures (docs/sample-cases.md) and
 * their banned-org watchlist entry. `save` upserts by id, so loading is idempotent.
 */

import { sampleAggregates, SAMPLE_WATCHLIST } from "@/domain/seed";
import { useCases } from "./cases";
import { useWatchlist } from "./watchlist";

export async function loadSampleData(): Promise<void> {
  const cases = useCases.getState();
  for (const agg of sampleAggregates()) {
    await cases.save(agg);
  }
  const watchlist = useWatchlist.getState();
  for (const name of SAMPLE_WATCHLIST) {
    await watchlist.add(name);
  }
}
