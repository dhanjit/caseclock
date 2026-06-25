/**
 * CaseClock encryption envelope (PLAN §6.1/§6.2/§6.3/§6.6).
 *
 * The whole serialized SQLite database is encrypted as one AES-256-GCM blob,
 * keyed by a random DEK that is itself wrapped by an Argon2id-derived KEK.
 * (Rationale — chosen at M0.5 over a custom encrypted-Wasm build — in PLAN §6.)
 *
 * Two-part AAD so a live session can RE-SEAL snapshots cheaply (new payload
 * nonce, same DEK) WITHOUT re-running Argon2id and WITHOUT keeping the KEK:
 *   - keyHeader  = {magic, version, kdf, salt, ivWrap}  → AAD for the wrapped DEK
 *   - payloadAad = keyHeader ⊕ ivPayload ⊕ wrappedDek   → AAD for the payload
 * Tampering the KDF params breaks the DEK unwrap; tampering version/salt/nonce
 * breaks the payload; both are authenticated. A hard floor rejects weak files
 * regardless of what the header claims (downgrade protection).
 *
 * Open a vault → get a VaultSession (holds the DEK as a non-extractable CryptoKey
 * + the stable key-header) → reseal new snapshots with it. On lock, drop the
 * session so the DEK is no longer referenced.
 */

import sodium from "libsodium-wrappers-sumo";

export const ENVELOPE_MAGIC = "CCLKv";
export const ENVELOPE_VERSION = 1;
export const MIN_SUPPORTED_VERSION = 1;

export interface KdfParams {
  algo: "argon2id";
  opslimit: number;
  memlimit: number;
}

export const KDF_DEFAULT: KdfParams = {
  algo: "argon2id",
  opslimit: 4,
  memlimit: 256 * 1024 * 1024, // 256 MiB
};

/** Hard floor — unlock/import below this is refused even if the header claims it. */
export const KDF_FLOOR: Pick<KdfParams, "opslimit" | "memlimit"> = {
  opslimit: 3,
  memlimit: 64 * 1024 * 1024, // 64 MiB
};

interface KeyHeader {
  magic: string;
  version: number;
  kdf: KdfParams;
  salt: string; // base64
  ivWrap: string; // base64
}

interface VaultFile extends KeyHeader {
  ivPayload: string; // base64 (changes every reseal)
  wrappedDek: string; // base64 — AES-256-GCM(KEK, DEK), AAD = keyHeader
  payload: string; // base64 — AES-256-GCM(DEK, dbBytes), AAD = payloadAad
}

/** Live, unlocked vault: enough to reseal snapshots without the passphrase/KEK. */
export interface VaultSession {
  keyHeader: KeyHeader;
  wrappedDek: string; // base64 (constant across reseals)
  dekKey: CryptoKey; // non-extractable; lives in (worker) memory while unlocked
}

let readyPromise: Promise<void> | null = null;
export function ready(): Promise<void> {
  if (!readyPromise) readyPromise = sodium.ready;
  return readyPromise;
}

const subtle = globalThis.crypto.subtle;

function b64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}
function unb64(s: string): Uint8Array {
  return sodium.from_base64(s, sodium.base64_variants.ORIGINAL);
}
const enc = new TextEncoder();

function keyHeaderAad(kh: KeyHeader): Uint8Array {
  return enc.encode(
    JSON.stringify({
      magic: kh.magic,
      version: kh.version,
      kdf: { algo: kh.kdf.algo, opslimit: kh.kdf.opslimit, memlimit: kh.kdf.memlimit },
      salt: kh.salt,
      ivWrap: kh.ivWrap,
    }),
  );
}

/** Binds the payload to this vault, this DEK, and this nonce. */
function payloadAad(kh: KeyHeader, ivPayload: string, wrappedDek: string): Uint8Array {
  return enc.encode(
    JSON.stringify({
      magic: kh.magic,
      version: kh.version,
      salt: kh.salt,
      ivPayload,
      wrappedDek,
    }),
  );
}

async function deriveKek(passphrase: string, salt: Uint8Array, kdf: KdfParams): Promise<CryptoKey> {
  await ready();
  if (kdf.algo !== "argon2id") throw new Error(`Unsupported KDF: ${kdf.algo}`);
  const raw = sodium.crypto_pwhash(
    32,
    passphrase,
    salt,
    kdf.opslimit,
    kdf.memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const key = await subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  sodium.memzero(raw);
  return key;
}

function assertFloor(version: number, kdf: KdfParams): void {
  if (version < MIN_SUPPORTED_VERSION) {
    throw new Error(`Envelope version ${version} below minimum ${MIN_SUPPORTED_VERSION}`);
  }
  if (kdf.opslimit < KDF_FLOOR.opslimit || kdf.memlimit < KDF_FLOOR.memlimit) {
    throw new Error("Envelope KDF parameters below the allowed floor (possible downgrade)");
  }
}

function serialize(file: VaultFile): Uint8Array {
  return enc.encode(JSON.stringify(file));
}

async function payloadFrom(
  kh: KeyHeader,
  dekKey: CryptoKey,
  wrappedDek: string,
  dbBytes: Uint8Array,
): Promise<{ ivPayload: string; payload: string }> {
  const ivPayloadBytes = sodium.randombytes_buf(12);
  const ivPayload = b64(ivPayloadBytes);
  const aad = payloadAad(kh, ivPayload, wrappedDek);
  const ct = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: ivPayloadBytes, additionalData: aad }, dekKey, dbBytes),
  );
  return { ivPayload, payload: b64(ct) };
}

/**
 * Create a brand-new vault from DB bytes, returning the serialized vault AND a
 * live session (so the live path doesn't re-run Argon2id just to get a DEK).
 */
export async function initVault(
  passphrase: string,
  dbBytes: Uint8Array,
  kdf: KdfParams = KDF_DEFAULT,
): Promise<{ vault: Uint8Array; session: VaultSession }> {
  await ready();
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const ivWrap = sodium.randombytes_buf(12);
  const keyHeader: KeyHeader = {
    magic: ENVELOPE_MAGIC,
    version: ENVELOPE_VERSION,
    kdf,
    salt: b64(salt),
    ivWrap: b64(ivWrap),
  };

  const kek = await deriveKek(passphrase, salt, kdf);
  const dekBytes = sodium.randombytes_buf(32);
  const wrappedDekBytes = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv: ivWrap, additionalData: keyHeaderAad(keyHeader) },
      kek,
      dekBytes,
    ),
  );
  const wrappedDek = b64(wrappedDekBytes);

  const dekKey = await subtle.importKey("raw", dekBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  sodium.memzero(dekBytes);

  const { ivPayload, payload } = await payloadFrom(keyHeader, dekKey, wrappedDek, dbBytes);
  const vault = serialize({ ...keyHeader, ivPayload, wrappedDek, payload });
  return { vault, session: { keyHeader, wrappedDek, dekKey } };
}

/** Create a brand-new vault from DB bytes (also used for export — §6.6). */
export async function createVault(
  passphrase: string,
  dbBytes: Uint8Array,
  kdf: KdfParams = KDF_DEFAULT,
): Promise<Uint8Array> {
  return (await initVault(passphrase, dbBytes, kdf)).vault;
}

/** Unlock a vault: returns the DB bytes plus a session for cheap resealing. */
export async function openVault(
  passphrase: string,
  vaultBytes: Uint8Array,
): Promise<{ session: VaultSession; dbBytes: Uint8Array }> {
  await ready();
  let file: VaultFile;
  try {
    file = JSON.parse(new TextDecoder().decode(vaultBytes)) as VaultFile;
  } catch {
    throw new Error("Vault file is not valid JSON");
  }
  if (file.magic !== ENVELOPE_MAGIC) throw new Error("Not a CaseClock vault file");
  assertFloor(file.version, file.kdf);

  const keyHeader: KeyHeader = {
    magic: file.magic,
    version: file.version,
    kdf: file.kdf,
    salt: file.salt,
    ivWrap: file.ivWrap,
  };

  const kek = await deriveKek(passphrase, unb64(file.salt), file.kdf);
  let dekBytes: Uint8Array;
  try {
    dekBytes = new Uint8Array(
      await subtle.decrypt(
        { name: "AES-GCM", iv: unb64(file.ivWrap), additionalData: keyHeaderAad(keyHeader) },
        kek,
        unb64(file.wrappedDek),
      ),
    );
  } catch {
    throw new Error("Unlock failed: wrong passphrase or corrupted/tampered vault");
  }
  const dekKey = await subtle.importKey("raw", dekBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  sodium.memzero(dekBytes);

  let dbBytes: Uint8Array;
  try {
    dbBytes = new Uint8Array(
      await subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unb64(file.ivPayload),
          additionalData: payloadAad(keyHeader, file.ivPayload, file.wrappedDek),
        },
        dekKey,
        unb64(file.payload),
      ),
    );
  } catch {
    throw new Error("Payload decryption failed: corrupted or tampered vault");
  }

  return { session: { keyHeader, wrappedDek: file.wrappedDek, dekKey }, dbBytes };
}

/** Re-encrypt a snapshot with an open session (new nonce, same DEK — no Argon2id). */
export async function resealVault(session: VaultSession, dbBytes: Uint8Array): Promise<Uint8Array> {
  const { ivPayload, payload } = await payloadFrom(
    session.keyHeader,
    session.dekKey,
    session.wrappedDek,
    dbBytes,
  );
  return serialize({ ...session.keyHeader, ivPayload, wrappedDek: session.wrappedDek, payload });
}

// Thin aliases for the simple one-shot case (export/import + tests).
export const encryptVault = createVault;
export async function decryptVault(passphrase: string, vaultBytes: Uint8Array): Promise<Uint8Array> {
  return (await openVault(passphrase, vaultBytes)).dbBytes;
}
