import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDbClient } from "@/db";
import { useSession } from "@/state/session";
import { useCio } from "./cio";

describe("useCio (CIO master list, V7-6)", () => {
  beforeEach(async () => {
    const client = new MemoryDbClient();
    await client.createVault("t");
    useSession.setState({ client, status: "unlocked" });
    useCio.setState({ officers: [], loaded: false });
  });

  it("starts empty and persists adds across reloads", async () => {
    await useCio.getState().load();
    expect(useCio.getState().officers).toEqual([]);
    await useCio.getState().add("Insp. R. Kalita", "Inspector");
    await useCio.getState().add("SI D. Rao");
    useCio.setState({ officers: [], loaded: false }); // simulate fresh session
    await useCio.getState().load();
    const names = useCio.getState().officers.map((o) => o.name);
    expect(names).toEqual(["Insp. R. Kalita", "SI D. Rao"]);
    expect(useCio.getState().officers[0].rank).toBe("Inspector");
  });

  it("ignores blank names, supports update/remove/move", async () => {
    await useCio.getState().add("   ");
    expect(useCio.getState().officers).toHaveLength(0);
    await useCio.getState().add("A");
    await useCio.getState().add("B");
    const [a, b] = useCio.getState().officers;
    await useCio.getState().update(a.id, { rank: "DSP" });
    expect(useCio.getState().getById(a.id)?.rank).toBe("DSP");
    await useCio.getState().move(1, -1);
    expect(useCio.getState().officers.map((o) => o.id)).toEqual([b.id, a.id]);
    await useCio.getState().remove(b.id);
    expect(useCio.getState().officers.map((o) => o.id)).toEqual([a.id]);
  });
});
