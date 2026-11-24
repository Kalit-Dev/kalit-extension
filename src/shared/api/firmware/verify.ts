import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export type FirmwareErrorCode =
  | "KEY_NOT_CONFIGURED"
  | "NETWORK"
  | "BAD_SIGNATURE"
  | "BAD_HASH"
  | "BAD_MANIFEST"
  | "NO_BOARD"
  | "DOWNGRADE"
  | "NO_SERIAL"
  | "NO_PORT"
  | "FLASH_FAILED";

export class FirmwareError extends Error {
  constructor(
    readonly code: FirmwareErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "FirmwareError";
  }
}

/** `shasum`/`sha256sum` formati: `<64 hex>  <fayl>` (ikkinchi ajratgich ` ` yoki ` *`). Fayl nomida yo'l bo'lmasligi shart. */
export function parseSums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const m = /^([0-9a-f]{64}) [ *]([A-Za-z0-9._-]+)$/.exec(line.replace(/\r$/, ""));
    if (!m || out.has(m[2]!)) throw new FirmwareError("BAD_MANIFEST", "SHA256SUMS");
    out.set(m[2]!, m[1]!);
  }
  if (out.size === 0) throw new FirmwareError("BAD_MANIFEST", "SHA256SUMS bo'sh");
  return out;
}

/** Ed25519: `signature` (64 bayt) `message` (SHA256SUMS baytlari) uchun `publicKeyHex` bilan yaroqli bo'lishi shart. */
export function verifySignature(message: Uint8Array, signature: Uint8Array, publicKeyHex: string): void {
  let ok = false;
  try {
    ok = signature.length === 64 && ed25519.verify(signature, message, hexToBytes(publicKeyHex));
  } catch {
    ok = false;
  }
  if (!ok) throw new FirmwareError("BAD_SIGNATURE");
}

/** Fayl baytlari imzolangan SHA256SUMS dagi qiymatga teng bo'lishi shart. */
export function verifyFile(name: string, data: Uint8Array, sums: Map<string, string>): void {
  const expected = sums.get(name);
  if (!expected) throw new FirmwareError("BAD_HASH", `${name}: SHA256SUMS da yo'q`);
  if (bytesToHex(sha256(data)) !== expected) throw new FirmwareError("BAD_HASH", name);
}
