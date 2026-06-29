/**
 * Cross-table sidecar-blob reference counting (§10/§7). The BlobStore is
 * content-addressed and SHARED by both the attachments and documents tables over
 * one OPFS `blobs/` dir, so a blob's true reference count is the SUM across every
 * table that can hold a blob_ref. GC must only delete an original when that sum is
 * zero — counting one table alone would delete a blob the other still points at.
 */

import type { DbClient } from "./types";

/** Every table that may reference a sidecar blob_ref. */
const BLOB_TABLES = ["attachments", "documents"] as const;

export async function blobRefCount(client: DbClient, ref: string): Promise<number> {
  let total = 0;
  for (const table of BLOB_TABLES) {
    try {
      const rows = await client.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE blob_ref = ?`,
        [ref],
      );
      total += rows[0]?.n ?? 0;
    } catch {
      // Table may not exist on an older/partial schema — treat as zero references there.
    }
  }
  return total;
}
