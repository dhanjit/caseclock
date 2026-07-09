import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDbClient } from "@/db";
import { useSession } from "@/state/session";
import { useNotifySettings } from "./notify-settings";

describe("useNotifySettings", () => {
  beforeEach(async () => {
    const client = new MemoryDbClient();
    await client.createVault("t");
    useSession.setState({ client, status: "unlocked" });
    useNotifySettings.setState({ enabled: true, loaded: false });
  });

  it("defaults to enabled when nothing is stored", async () => {
    await useNotifySettings.getState().load();
    expect(useNotifySettings.getState()).toMatchObject({ enabled: true, loaded: true });
  });

  it("persists a disable across reloads", async () => {
    await useNotifySettings.getState().setEnabled(false);
    useNotifySettings.setState({ enabled: true, loaded: false }); // simulate fresh session
    await useNotifySettings.getState().load();
    expect(useNotifySettings.getState().enabled).toBe(false);
  });
});
