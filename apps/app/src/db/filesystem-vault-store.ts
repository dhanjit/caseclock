/**
 * Native vault sink — persists the encrypted vault blob with @capacitor/filesystem
 * instead of OPFS (vault-store.ts). This is the fix for the handoff doc's "#1
 * silent-failure risk": OPFS in WKWebView rides an evictable per-origin storage
 * bucket (7-day inactivity / storage-pressure / quota), so on a device holding
 * the ONLY copy of case data it can be wiped out from under the app. A real
 * app-private file does not get evicted.
 *
 * Location: Directory.LibraryNoCloud — the app's Library dir, which on iOS is:
 *   - NOT exposed in the Files app (unlike Documents), and
 *   - excluded from iCloud/iTunes backup (honors the no-egress threat model;
 *     the only sanctioned egress is the user-initiated encrypted .ccbak export).
 * Trade-off: like OPFS, this is wiped on app delete+reinstall — so .ccbak remains
 * the only recovery path across a reinstall. (An App Store *update* preserves it.)
 *
 * The bytes written are already AES-256-GCM ciphertext (the whole serialized DB);
 * this layer only moves opaque bytes, base64-framed for the Capacitor bridge.
 *
 * @capacitor/filesystem is imported lazily so it never enters the web bundle and
 * is only resolved on a native platform (where createDbClient selects this store).
 */

import type { VaultStore } from "./vault-store";

type FsModule = typeof import("@capacitor/filesystem");
let fsModulePromise: Promise<FsModule> | null = null;
/** Resolve @capacitor/filesystem once, lazily (native only). */
function fsModule(): Promise<FsModule> {
  return (fsModulePromise ??= import("@capacitor/filesystem"));
}

// --- base64 framing for the Capacitor bridge (binary writeFile/readFile use base64) ---
// Chunked so a multi-MB vault never blows the argument/stack limit of fromCharCode.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// --- single-path primitives (null/no-throw where the OPFS sink is null/no-throw) ---
async function readRaw(fs: FsModule["Filesystem"], directory: string, path: string): Promise<Uint8Array | null> {
  try {
    const res = await fs.readFile({ path, directory: directory as never });
    const bytes = base64ToBytes(res.data as string);
    // A zero-length file is a torn/aborted write, not a valid vault — treat as absent
    // so load() falls through to the .bak / .tmp recovery generations.
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null; // not found / unreadable → treated as absent
  }
}

async function writeRaw(fs: FsModule["Filesystem"], directory: string, path: string, bytes: Uint8Array): Promise<void> {
  // recursive:true creates the parent dir if absent. On iOS, Directory.LibraryNoCloud
  // maps to Library/NoCloud, whose `NoCloud` folder does not exist on a fresh install —
  // without this the very first vault write fails "missing parent directory".
  await fs.writeFile({ path, data: bytesToBase64(bytes), directory: directory as never, recursive: true });
}

async function deleteRaw(fs: FsModule["Filesystem"], directory: string, path: string): Promise<void> {
  try {
    await fs.deleteFile({ path, directory: directory as never });
  } catch {
    /* already gone */
  }
}

/**
 * Native sink. Crash-safe write mirrors the OPFS writer: keep the last good
 * generation as `.bak`, stage new content in `.tmp`, promote tmp→primary (atomic
 * rename, falling back to a direct write), then drop `.bak`. Callers serialize
 * (LocalDbClient's mutex), so these steps never interleave.
 */
export const filesystemVaultStore: VaultStore = {
  available: () => true, // selected only on native, where the filesystem is always present

  async load(name: string): Promise<Uint8Array | null> {
    const { Filesystem, Directory } = await fsModule();
    const dir = Directory.LibraryNoCloud;
    // Primary, then the crash-recovery generations: `.bak` = previous good,
    // `.tmp` = a complete staged copy from a promote that was interrupted.
    return (
      (await readRaw(Filesystem, dir, name)) ??
      (await readRaw(Filesystem, dir, `${name}.bak`)) ??
      (await readRaw(Filesystem, dir, `${name}.tmp`))
    );
  },

  async save(name: string, ciphertext: Uint8Array): Promise<void> {
    const { Filesystem, Directory } = await fsModule();
    const dir = Directory.LibraryNoCloud;

    // Keep the last good generation as .bak before touching the primary.
    const current = await readRaw(Filesystem, dir, name);
    if (current) await writeRaw(Filesystem, dir, `${name}.bak`, current);

    // Stage the complete new content in .tmp (the only file that can tear here).
    const tmp = `${name}.tmp`;
    await writeRaw(Filesystem, dir, tmp, ciphertext);

    let primaryGood = false;
    try {
      // Delete the primary only here, immediately before the atomic same-dir rename,
      // so any interruption BEFORE this leaves the good primary intact.
      await deleteRaw(Filesystem, dir, name);
      await Filesystem.rename({ from: tmp, to: name, directory: dir });
      primaryGood = true;
    } catch {
      primaryGood = false;
    }
    if (!primaryGood) {
      // Atomic promote failed (e.g. rename unsupported). Rewrite the primary, but keep
      // .tmp (the complete staged copy) until the primary is confirmed readable — so a
      // crash mid-rewrite recovers from .tmp/.bak instead of a torn primary.
      await writeRaw(Filesystem, dir, name, ciphertext);
      primaryGood = (await readRaw(Filesystem, dir, name)) !== null;
      if (primaryGood) await deleteRaw(Filesystem, dir, tmp);
    }

    // Drop the previous generation ONLY once the new primary is durable; otherwise
    // keep .bak (and .tmp) as recovery sources.
    if (primaryGood) await deleteRaw(Filesystem, dir, `${name}.bak`);
  },
};
