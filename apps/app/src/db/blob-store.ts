/**
 * Content-addressed, encrypted SIDECAR blob store (REQUIREMENTS §10/§7).
 *
 * Big binaries — image/document ORIGINALS — are kept OUT of the SQLite vault. The
 * vault re-encrypts wholesale on every write, so per-edit cost must never scale
 * with image bytes; only a small `blobRef` (the plaintext SHA-256) and a tiny
 * thumbnail live in the DB. Each original is AES-256-GCM'd with the vault DEK
 * (via the DbClient) and written to OPFS under its content hash (dedup).
 *
 * Trade-off (documented): sidecar originals are NOT inside the `.ccbak` backup
 * (which serializes only the SQLite DB). Thumbnails + metadata ARE backed up, so
 * the visual record survives a restore; full-res originals are device-local and
 * re-importable. This is the deliberate cost of keeping saves fast.
 */

import type { DbClient } from "./types";
import { writeOpfsBlob, readOpfsBlob, deleteOpfsBlob, opfsAvailable } from "./sqlite-blob";

/** Pluggable storage backend so tests can run without OPFS (node). */
export interface BlobBackend {
  write(name: string, bytes: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array | null>;
  delete(name: string): Promise<void>;
}

const opfsBackend: BlobBackend = {
  write: writeOpfsBlob,
  read: readOpfsBlob,
  delete: deleteOpfsBlob,
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export class BlobStore {
  constructor(
    private readonly client: DbClient,
    private readonly backend: BlobBackend = opfsBackend,
  ) {}

  /** Is sidecar storage usable here? (false on old iOS Safari / no-OPFS contexts.) */
  available(): boolean {
    return opfsAvailable();
  }

  /**
   * Store bytes, returning their content hash (`blobRef`). Idempotent: identical
   * content reuses the existing ciphertext file (dedup). The ref is the hash of
   * the PLAINTEXT, so it's stable even though each encryption uses a fresh IV.
   */
  async put(bytes: Uint8Array): Promise<string> {
    const ref = await sha256Hex(bytes);
    const existing = await this.backend.read(ref);
    if (!existing) {
      const ciphertext = await this.client.encryptBlob(bytes);
      await this.backend.write(ref, ciphertext);
    }
    return ref;
  }

  /** Fetch + decrypt the original for a ref, or null if it isn't on this device. */
  async get(ref: string): Promise<Uint8Array | null> {
    const ciphertext = await this.backend.read(ref);
    if (!ciphertext) return null;
    return this.client.decryptBlob(ciphertext);
  }

  async remove(ref: string): Promise<void> {
    await this.backend.delete(ref);
  }
}
