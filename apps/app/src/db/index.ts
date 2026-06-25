import { LocalDbClient } from "./local-client";
import type { DbClient } from "./types";

export type { DbClient, Bind, DbRow } from "./types";
export { LocalDbClient } from "./local-client";
export { MemoryDbClient } from "./memory-client";

/** The app's storage client (encrypted, OPFS-persisted). */
export function createDbClient(): DbClient {
  return new LocalDbClient();
}
