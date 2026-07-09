import { describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "./base64";

describe("base64", () => {
  it("round-trips arbitrary bytes (exercises the chunked path)", () => {
    const bytes = new Uint8Array(70000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff;
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("handles empty input", () => {
    expect(toBase64(new Uint8Array(0))).toBe("");
    expect(fromBase64("")).toEqual(new Uint8Array(0));
  });

  it("matches btoa for small ascii", () => {
    expect(toBase64(new TextEncoder().encode("hi"))).toBe(btoa("hi"));
  });
});
