import { LocalDbClient } from "./local-client";
import type { DbClient } from "./types";
import { isNativePlatform } from "@/lib/platform";
import { opfsVaultStore, type VaultStore } from "./vault-store";
import { filesystemVaultStore } from "./filesystem-vault-store";

export type { DbClient, Bind, DbRow } from "./types";
export { LocalDbClient } from "./local-client";
export { MemoryDbClient } from "./memory-client";

/**
 * Pick where the encrypted vault persists: a real app-private file on native
 * (survives WKWebView OPFS eviction — handoff doc §45), OPFS on web. Exported so
 * the selection is unit-testable without constructing the whole client.
 */
export function selectVaultStore(): VaultStore {
  return isNativePlatform() ? filesystemVaultStore : opfsVaultStore;
}

/** The app's storage client (encrypted; OPFS on web, Filesystem on native). */
export function createDbClient(): DbClient {
  // First arg undefined → LocalDbClient's default KDF (KDF_DEFAULT).
  return new LocalDbClient(undefined, selectVaultStore());
}
