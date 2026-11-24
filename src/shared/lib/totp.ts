import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";

/**
 * TOTP (RFC 6238) yordamchilari. Qurilma faqat HMAC-SHA1 / 6 raqam / 30 s qo'llaydi.
 * Urug' (seed) hech qachon log qilinmaydi va saqlanmaydi: xatolar matnida ham yo'q.
 */
export const TOTP_SEED_MIN_BYTES = 10;
export const TOTP_SEED_MAX_BYTES = 64;
const DIGITS = 6;
const PERIOD = 30;

export class TotpInputError extends Error {
  /** "unsupported": to'g'ri URI, lekin qurilma qo'llamaydigan parametrlar (SHA1/6/30 emas). */
  constructor(
    message: string,
    readonly reason: "invalid" | "unsupported" = "invalid",
  ) {
    super(message);
    this.name = "TotpInputError";
  }
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32: katta-kichik harf farqsiz, bo'shliq/tire e'tiborga olinmaydi, "=" ixtiyoriy. */
export function decodeBase32(text: string): Uint8Array {
  const clean = text.replace(/[\s-]+/g, "").replace(/=+$/, "").toUpperCase();
  if (clean.length === 0) throw new TotpInputError("2FA kaliti bo'sh");
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new TotpInputError("2FA kaliti noto'g'ri: faqat base32 belgilar (A-Z, 2-7) bo'lishi kerak");
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

const UNSUPPORTED = "Qurilma faqat SHA1, 6 raqam va 30 soniyalik 2FA kodlarini qo'llaydi";

function seedFromBase32(text: string): Uint8Array {
  const seed = decodeBase32(text);
  if (seed.length < TOTP_SEED_MIN_BYTES) throw new TotpInputError("2FA kaliti juda qisqa (kamida 10 bayt / 16 belgi)");
  if (seed.length > TOTP_SEED_MAX_BYTES) throw new TotpInputError("2FA kaliti juda uzun (ko'pi bilan 64 bayt)");
  return seed;
}

/** base32 kalit YOKI `otpauth://totp/...` URI -> xom urug' (10..64 bayt). Aks holda TotpInputError. */
export function parseTotpInput(text: string): Uint8Array {
  const input = text.trim();
  if (!/^otpauth:\/\//i.test(input)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) throw new TotpInputError(UNSUPPORTED, "unsupported");
    return seedFromBase32(input);
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new TotpInputError("otpauth havolasi noto'g'ri");
  }
  if (url.hostname.toLowerCase() !== "totp") throw new TotpInputError("Faqat vaqtga asoslangan (TOTP) kalitlar qo'llanadi", "unsupported");

  const q = url.searchParams;
  const secret = q.get("secret");
  if (!secret) throw new TotpInputError("otpauth havolasida secret yo'q");
  const algorithm = q.get("algorithm");
  if (algorithm !== null && algorithm.toUpperCase() !== "SHA1") throw new TotpInputError(UNSUPPORTED, "unsupported");
  const digits = q.get("digits");
  if (digits !== null && digits !== String(DIGITS)) throw new TotpInputError(UNSUPPORTED, "unsupported");
  const period = q.get("period");
  if (period !== null && period !== String(PERIOD)) throw new TotpInputError(UNSUPPORTED, "unsupported");
  return seedFromBase32(secret);
}

/** RFC 6238 (SHA1, 30 s) — 6 raqamli kod. Qurilma bilan solishtirish va testlar uchun. */
export function computeTotp(seed: Uint8Array, unixSeconds: number): string {
  const counter = Math.floor(unixSeconds / PERIOD);
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const h = hmac(sha1, seed, msg);
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** "123456" -> "123 456" */
export const groupTotp = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);
