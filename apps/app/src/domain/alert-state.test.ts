import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDbClient } from "@/db";
import { AlertStateStore, alertKey } from "./alert-state";

describe("AlertStateStore", () => {
  let client: MemoryDbClient;
  let store: AlertStateStore;

  beforeEach(async () => {
    client = new MemoryDbClient();
    await client.createVault("test");
    store = new AlertStateStore(client);
  });

  it("starts empty", async () => {
    expect((await store.list()).size).toBe(0);
  });

  it("acknowledge round-trips", async () => {
    await store.acknowledge("c1", "r1", "2026-07-10");
    const st = (await store.list()).get(alertKey("c1", "r1", "2026-07-10"));
    expect(st?.state).toBe("acknowledged");
    expect(st?.snoozedUntil).toBeNull();
  });

  it("snooze stores the until-date and upserts over a prior state", async () => {
    await store.acknowledge("c1", "r1", "2026-07-10");
    await store.snooze("c1", "r1", "2026-07-10", "2026-07-11");
    const st = (await store.list()).get(alertKey("c1", "r1", "2026-07-10"));
    expect(st?.state).toBe("snoozed");
    expect(st?.snoozedUntil).toBe("2026-07-11");
  });

  it("keys occurrences independently", async () => {
    await store.acknowledge("c1", "r1", "2026-07-10");
    await store.acknowledge("c1", "r1", "2026-08-10");
    expect((await store.list()).size).toBe(2);
  });
});
