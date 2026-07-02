/**
 * The vault persistence seam.
 *
 * LocalDbClient writes ONE opaque AES-256-GCM ciphertext file (the whole
 * serialized DB). Where that file lands depends on the platform, so — exactly
 * like the sidecar BlobBackend (blob-store.ts) — the sink is pluggable:
 *
 *   - opfsVaultStore        — web / installed PWA (OPFS).            (this file)
 *   - filesystemVaultStore  — native iOS/Android (@capacitor/filesystem).
 *                             (filesystem-vault-store.ts, selected in index.ts)
 *
 * This is the seam docs/ios-native-handoff.md §45 calls out as the fix for the
 * "#1 thing that can silently break the native app": OPFS in WKWebView rides an
 * evictable per-origin bucket, so on native the vault must persist to a real
 * app-private file instead. Injecting the store also keeps it testable in node
 * (no OPFS) via an in-memory fake.
 */

import { opfsAvailable, loadVaultFromOpfs, saveVaultToOpfs } from "./sqlite-blob";

export interface VaultStore {
  /** Is on-device vault persistence usable here? (false on old iOS Safari w/o OPFS.) */
  available(): boolean;
  /** Load the persisted ciphertext, or null when no vault exists yet. */
  load(name: string): Promise<Uint8Array | null>;
  /** Persist the ciphertext. Crash-safe per backend; callers serialize writes. */
  save(name: string, ciphertext: Uint8Array): Promise<void>;
}

/** Web sink: the existing OPFS crash-safe writer (.tmp → promote + .bak). */
export const opfsVaultStore: VaultStore = {
  available: opfsAvailable,
  load: loadVaultFromOpfs,
  save: saveVaultToOpfs,
};
