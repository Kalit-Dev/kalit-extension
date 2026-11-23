import { describe, expect, it } from "vitest";
import { decode, encode } from "./cbor";

describe("cbor", () => {
  it("round-trips nested maps, arrays, bytes, booleans and null", () => {
    const value = { i: 7, c: "LIST", p: { a: [1, "x", true, null], b: Uint8Array.of(1, 2, 3) } };
    expect(decode(encode(value))).toEqual(value);
  });

  it("encodes map keys in a deterministic order", () => {
    expect(encode({ b: 1, a: 2 })).toEqual(encode({ a: 2, b: 1 }));
  });

  it("throws on truncated input", () => {
    expect(() => decode(encode({ a: "hello" }).slice(0, 3))).toThrow();
  });
});
