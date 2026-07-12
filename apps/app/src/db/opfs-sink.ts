/** OPFS-backed VaultSink (web). Thin wrapper over the existing sqlite-blob fns. */
import {
  opfsAvailable,
  saveVaultToOpfs,
  loadVaultFromOpfs,
  loadVaultBackupFromOpfs,
  writeOpfsBlob,
  readOpfsBlob,
  deleteOpfsBlob,
} from "./sqlite-blob";
import type { VaultSink } from "./sink";

export function createOpfsSink(): VaultSink {
  return {
    available: opfsAvailable,
    loadVault: loadVaultFromOpfs,
    loadVaultBackup: loadVaultBackupFromOpfs,
    saveVault: saveVaultToOpfs,
    blobs: { write: writeOpfsBlob, read: readOpfsBlob, delete: deleteOpfsBlob },
  };
}
