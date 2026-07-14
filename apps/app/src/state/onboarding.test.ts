import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDbClient } from "@/db";
import { useSession } from "@/state/session";
import { useCases } from "@/state/cases";
import { useWatchlist } from "@/state/watchlist";
import { useOnboarding } from "./onboarding";

describe("useOnboarding — first-run demo", () => {
  beforeEach(async () => {
    const client = new MemoryDbClient();
    await client.createVault("t");
    useSession.setState({ client, status: "unlocked" });
    useCases.setState({ aggregates: [], loaded: false });
    useWatchlist.setState({ names: [], loaded: false });
    useOnboarding.setState({ demoActive: false, loaded: false });
  });

  it("seeds demo cases and shows the banner on first run (empty vault, no flag)", async () => {
    await useCases.getState().load();
    await useOnboarding.getState().maybeStartDemo();
    expect(useCases.getState().aggregates.length).toBeGreaterThan(0);
    expect(useOnboarding.getState().demoActive).toBe(true);
  });

  it("does not seed and shows no banner once the vault already has cases", async () => {
    // Simulate an existing user by loading the sample data as their 'own' first.
    const { loadSampleData } = await import("./seed");
    await loadSampleData();
    await useOnboarding.getState().maybeStartDemo();
    expect(useOnboarding.getState().demoActive).toBe(false);
  });

  it("clearAndReset wipes cases + watchlist, drops the banner, and persists 'cleared'", async () => {
    await useCases.getState().load();
    await useOnboarding.getState().maybeStartDemo(); // seeds
    await useWatchlist.getState().load();
    expect(useWatchlist.getState().names.length).toBeGreaterThan(0);

    await useOnboarding.getState().clearAndReset();
    expect(useCases.getState().aggregates.length).toBe(0);
    expect(useWatchlist.getState().names.length).toBe(0);
    expect(useOnboarding.getState().demoActive).toBe(false);
  });

  it("never re-seeds after a clear (flag persists across a fresh session load)", async () => {
    await useCases.getState().load();
    await useOnboarding.getState().maybeStartDemo(); // seeds
    await useOnboarding.getState().clearAndReset(); // marks cleared

    // Fresh session: reload state, then attempt first-run again.
    useOnboarding.setState({ demoActive: true, loaded: false });
    await useOnboarding.getState().load();
    expect(useOnboarding.getState().demoActive).toBe(false);
    await useOnboarding.getState().maybeStartDemo();
    expect(useCases.getState().aggregates.length).toBe(0);
  });
});
