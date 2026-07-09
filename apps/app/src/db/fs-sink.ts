/**
 * @capacitor/filesystem-backed VaultSink (native iOS/Android).
 *
 * WKWebView OPFS is NOT durable across app updates, so on native the encrypted
 * vault blob lands in the app container instead:
 *   - vault (+ .tmp/.bak generations)  → Directory.Library       (survives updates;
 *     included in device backups — it is ciphertext, so that is a feature)
 *   - sidecar blobs (originals)        → Directory.LibraryNoCloud (large,
 *     re-importable, excluded from backup — same trade-off as blob-store.ts)
 *
 * Write protocol mirrors saveVaultToOpfs (sqlite-blob.ts): stage .bak of the
 * last good generation, write .tmp, promote via rename, drop .bak. Callers
 * MUST serialize calls (LocalDbClient's mutex).
 */
import { Directory, Filesystem } from "@capacitor/filesystem";
import { fromBase64, toBase64 } from "@/lib/base64";
import type { VaultSink } from "./sink";

const VAULT_DIR = Directory.Library;
const BLOB_DIR = Directory.LibraryNoCloud;
const BLOB_PREFIX = "blobs/";

const missing = (e: unknown) => /does not exist|no such file/i.test(String((e as Error)?.message ?? e));

async function readEntry(path: string, directory: Directory): Promise<Uint8Array | null> {
  try {
    const res = await Filesystem.readFile({ path, directory });
    if (typeof res.data !== "string") throw new Error("Expected base64 data from the native Filesystem plugin.");
    return fromBase64(res.data);
  } catch (e) {
    if (missing(e)) return null;
    throw e; // real I/O errors must not masquerade as "no vault" (would allow overwrite)
  }
}

async function writeEntry(path: string, directory: Directory, bytes: Uint8Array): Promise<void> {
  await Filesystem.writeFile({ path, directory, data: toBase64(bytes), recursive: true });
}

export function createFilesystemSink(): VaultSink {
  return {
    available: () => true,

    async loadVault(name) {
      return (await readEntry(name, VAULT_DIR)) ?? (await readEntry(`${name}.bak`, VAULT_DIR));
    },

    async saveVault(name, ciphertext) {
      // Keep the last good generation as .bak before we touch the primary.
      const current = await readEntry(name, VAULT_DIR);
      if (current) await writeEntry(`${name}.bak`, VAULT_DIR, current);

      // Stage the new content, then promote tmp → primary via rename (APFS move).
      await writeEntry(`${name}.tmp`, VAULT_DIR, ciphertext);
      try {
        await Filesystem.deleteFile({ path: name, directory: VAULT_DIR }).catch(() => {});
        await Filesystem.rename({ from: `${name}.tmp`, to: name, directory: VAULT_DIR, toDirectory: VAULT_DIR });
      } catch {
        // rename failed → direct-write fallback (same policy as the OPFS sink)
        await writeEntry(name, VAULT_DIR, ciphertext);
        await Filesystem.deleteFile({ path: `${name}.tmp`, directory: VAULT_DIR }).catch(() => {});
      }

      // Primary is good — drop the previous generation (see saveVaultToOpfs rationale).
      await Filesystem.deleteFile({ path: `${name}.bak`, directory: VAULT_DIR }).catch(() => {});
    },

    blobs: {
      async write(name, bytes) {
        await writeEntry(`${BLOB_PREFIX}${name}`, BLOB_DIR, bytes);
      },
      async read(name) {
        return readEntry(`${BLOB_PREFIX}${name}`, BLOB_DIR);
      },
      async delete(name) {
        await Filesystem.deleteFile({ path: `${BLOB_PREFIX}${name}`, directory: BLOB_DIR }).catch(() => {});
      },
    },
  };
}
