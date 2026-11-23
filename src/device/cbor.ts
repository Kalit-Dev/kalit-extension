import { decode as cborDecode, encode as cborEncode } from "cborg";

/** Deterministik CBOR (map kalitlari tartiblangan). */
export function encode(value: unknown): Uint8Array {
  return cborEncode(value);
}

export function decode(bytes: Uint8Array): unknown {
  return cborDecode(bytes);
}
