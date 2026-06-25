import { describe, it, expect } from "vitest";
import {
  encryptVault,
  decryptVault,
  openVault,
  resealVault,
  KDF_FLOOR,
  ENVELOPE_MAGIC,
  type KdfParams,
} from "./envelope";

// Light-but-floor-compliant params keep tests fast while exercising real Argon2id.
const TEST_KDF: KdfParams = {
  algo: "argon2id",
  opslimit: KDF_FLOOR.opslimit,
  memlimit: KDF_FLOOR.memlimit,
};

const PASS = "correct horse battery staple 4471";
const plaintext = () => new TextEncoder().encode("FIR 112/2025 · PS Civil Lines · UAPA · accused-2");

describe("encryption envelope", () => {
  it("round-trips: decrypt(encrypt(x)) === x", async () => {
    const data = plaintext();
    const vault = await encryptVault(PASS, data, TEST_KDF);
    const out = await decryptVault(PASS, vault);
    expect(new TextDecoder().decode(out)).toBe(new TextDecoder().decode(data));
  });

  it("produces an opaque blob with no plaintext leakage of the payload text", async () => {
    const vault = await encryptVault(PASS, plaintext(), TEST_KDF);
    const asText = new TextDecoder().decode(vault);
    expect(asText).toContain(ENVELOPE_MAGIC); // header is visible…
    expect(asText).not.toContain("Civil Lines"); // …but the payload is not.
    expect(asText).not.toContain("UAPA");
  });

  it("rejects the wrong passphrase", async () => {
    const vault = await encryptVault(PASS, plaintext(), TEST_KDF);
    await expect(decryptVault("wrong passphrase entirely", vault)).rejects.toThrow(/wrong passphrase/i);
  });

  it("rejects a tampered payload (GCM tag fails)", async () => {
    const vault = await encryptVault(PASS, plaintext(), TEST_KDF);
    const file = JSON.parse(new TextDecoder().decode(vault));
    // Flip one base64 char in the payload ciphertext.
    const ch = file.payload[10] === "A" ? "B" : "A";
    file.payload = file.payload.slice(0, 10) + ch + file.payload.slice(11);
    const tampered = new TextEncoder().encode(JSON.stringify(file));
    await expect(decryptVault(PASS, tampered)).rejects.toThrow(/tamper|corrupt|failed/i);
  });

  it("rejects a downgraded KDF header below the floor", async () => {
    const vault = await encryptVault(PASS, plaintext(), TEST_KDF);
    const file = JSON.parse(new TextDecoder().decode(vault));
    file.kdf.opslimit = 1; // below KDF_FLOOR.opslimit
    file.kdf.memlimit = 1024; // below KDF_FLOOR.memlimit
    const downgraded = new TextEncoder().encode(JSON.stringify(file));
    await expect(decryptVault(PASS, downgraded)).rejects.toThrow(/floor|downgrade/i);
  });

  it("rejects a non-vault file", async () => {
    const notAVault = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    await expect(decryptVault(PASS, notAVault)).rejects.toThrow(/vault file/i);
  });

  it("reseals a snapshot with the open session (no re-derive) and round-trips", async () => {
    const v1 = await encryptVault(PASS, new TextEncoder().encode("snapshot-1"), TEST_KDF);
    const { session } = await openVault(PASS, v1);

    const v2 = await resealVault(session, new TextEncoder().encode("snapshot-2"));

    // Reseal keeps the same salt + wrapped DEK (cheap; no Argon2id), new payload nonce.
    const f1 = JSON.parse(new TextDecoder().decode(v1));
    const f2 = JSON.parse(new TextDecoder().decode(v2));
    expect(f2.salt).toBe(f1.salt);
    expect(f2.wrappedDek).toBe(f1.wrappedDek);
    expect(f2.ivPayload).not.toBe(f1.ivPayload);

    // The resealed vault opens with the original passphrase and yields the new bytes.
    expect(new TextDecoder().decode(await decryptVault(PASS, v2))).toBe("snapshot-2");
  });
});
