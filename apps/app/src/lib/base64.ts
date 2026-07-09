/**
 * Uint8Array ↔ base64. @capacitor/filesystem transports binary as base64
 * strings on native; chunked conversion avoids call-stack limits on the
 * multi-MB encrypted vault blob.
 */

const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
