import { CHARSET, GEN_MAX, GEN_MIN_CUSTOM, GEN_MIN_FULL, WORDS_MAX, WORDS_MIN } from "./protocol";
import { WORDLIST } from "./wordlist";

/**
 * Qurilma (firmware `generator.cpp`) generatori bilan bir xil qoidalar — FAQAT mock-transport uchun.
 * Aralash to'plamlarda o'xshash belgilar (0/O, 1/l/I) yo'q; yagona raqam sinfi (PIN) = 0-9; har sinfdan kamida bitta belgi.
 */
const CLASSES: { bit: number; chars: string }[] = [
  { bit: CHARSET.lower, chars: "abcdefghijkmnopqrstuvwxyz" },
  { bit: CHARSET.upper, chars: "ABCDEFGHJKLMNPQRSTUVWXYZ" },
  { bit: CHARSET.digit, chars: "23456789" },
  { bit: CHARSET.symbol, chars: "!@#$%^&*-_=+" },
];
const PIN_DIGITS = "0123456789";

export interface GenSpec {
  length?: number;
  charset?: number;
  words?: number;
}

/** [0, n) bo'yicha tekis (modulo bias'siz), n <= 65536. */
function below(n: number): number {
  const limit = 65536 - (65536 % n);
  const buf = new Uint16Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

/** Firmware `gen_valid` bilan bir xil. */
export function genValid(s: GenSpec): boolean {
  if (s.words !== undefined) {
    if (s.charset !== undefined || s.length !== undefined) return false;
    return Number.isInteger(s.words) && s.words >= WORDS_MIN && s.words <= WORDS_MAX;
  }
  const charset = s.charset ?? CHARSET.all;
  const length = s.length ?? 20;
  if (!Number.isInteger(charset) || charset < 1 || charset > CHARSET.all) return false;
  const min = charset === CHARSET.all ? GEN_MIN_FULL : GEN_MIN_CUSTOM;
  return Number.isInteger(length) && length >= min && length <= GEN_MAX;
}

export function generate(s: GenSpec): string {
  if (!genValid(s)) throw new Error("invalid generator spec");
  if (s.words !== undefined) return Array.from({ length: s.words }, () => WORDLIST[below(WORDLIST.length)]!).join("-");
  const charset = s.charset ?? CHARSET.all;
  const length = s.length ?? 20;
  const chosen = CLASSES.filter((c) => charset & c.bit);
  const alphabet = charset === CHARSET.digit ? PIN_DIGITS : chosen.map((c) => c.chars).join("");
  const out = Array.from({ length }, () => alphabet[below(alphabet.length)]!);
  if (chosen.length > 1) {
    const pos = Array.from({ length }, (_, i) => i);
    chosen.forEach((c, k) => {
      const j = k + below(length - k);
      [pos[k], pos[j]] = [pos[j]!, pos[k]!];
      out[pos[k]!] = c.chars[below(c.chars.length)]!;
    });
  }
  return out.join("");
}
