/**
 * VaultSink — the persistence-sink seam (PLAN §6.1). The SAME TS+wasm app runs
 * on web and inside the Capacitor WebView; only where the encrypted bytes land
 * differs: OPFS on web, @capacitor/filesystem on native (OPFS in WKWebView is
 * not durable across app updates — see docs/ios-native-handoff.md #1).
 */
import { createOpfsSink } from "./opfs-sink";
import { Capacitor } from "@capacitor/core";
import { createFilesystemSink } from "./fs-sink";

/** Pluggable storage backend for the sidecar blob store (encrypted originals). */
export interface BlobBackend {
  write(name: string, bytes: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array | null>;
  delete(name: string): Promise<void>;
}

export interface VaultSink {
  /** Is durable storage usable here? (false on old iOS Safari / no-OPFS web contexts.) */
  available(): boolean;
  loadVault(name: string): Promise<Uint8Array | null>;
  /**
   * Read ONLY the .bak generation. loadVault coalesces primary→.bak, so a
   * present-but-corrupt primary shadows a good backup — unlock's recovery path
   * needs the backup in isolation.
   */
  loadVaultBackup(name: string): Promise<Uint8Array | null>;
  saveVault(name: string, ciphertext: Uint8Array): Promise<void>;
  blobs: BlobBackend;
}

let sink: VaultSink | null = null;

/** The platform persistence sink. Lazy so tests can vi.mock the plugins first. */
export function vaultSink(): VaultSink {
  if (!sink) sink = Capacitor.isNativePlatform() ? createFilesystemSink() : createOpfsSink();
  return sink;
}

/** Test-only: clear the memoized sink so both platform branches can be exercised. */
export function __resetVaultSinkForTests(): void {
  sink = null;
}
