/**
 * Qurilma (firmware `strength.cpp`) bilan bir xil parol kuchi baholagichi — FAQAT mock-transport uchun.
 * Haqiqiy qurilmada baholash qurilma ichida bajariladi, extension ochiq parolni hech qachon ko'rmaydi.
 */
export const WEAK_BITS = 60;

const COMMON_BASES = [
  "password", "passw0rd", "qwerty", "qwertyuiop", "letmein", "admin", "welcome", "iloveyou", "parol", "login",
  "dragon", "monkey", "master", "abc", "uzbekistan", "toshkent", "samarqand", "kalit",
];
const COMMON_PREFIXES = ["password", "qwerty", "12345", "parol"];

function isCommon(bytes: Uint8Array): boolean {
  const low = Array.from(bytes.subarray(0, 64), (c) => (c >= 65 && c <= 90 ? c + 32 : c));
  const text = String.fromCharCode(...low);
  if (COMMON_PREFIXES.some((p) => text.startsWith(p))) return true;
  let end = text.length;
  while (end > 0 && !(text.charCodeAt(end - 1) >= 97 && text.charCodeAt(end - 1) <= 122)) end--;
  return COMMON_BASES.some((b) => b.length === end && text.startsWith(b));
}

export function passwordEntropyBits(password: string): number {
  const bytes = new TextEncoder().encode(password);
  if (bytes.length === 0 || isCommon(bytes)) return 0;
  let lower = false, upper = false, digit = false, symbol = false, other = false;
  const seen = new Set<number>();
  let eff = 0;
  bytes.forEach((c, i) => {
    if (c >= 97 && c <= 122) lower = true;
    else if (c >= 65 && c <= 90) upper = true;
    else if (c >= 48 && c <= 57) digit = true;
    else if (c >= 0x80) other = true;
    else symbol = true;
    seen.add(c);
    let free = false;
    if (i >= 2) {
      const d1 = c - bytes[i - 1]!;
      const d0 = bytes[i - 1]! - bytes[i - 2]!;
      free = d1 === d0 && d1 >= -1 && d1 <= 1;
    }
    if (!free) eff++;
  });
  eff = Math.min(eff, 3 * seen.size);
  const pool = (lower ? 26 : 0) + (upper ? 26 : 0) + (digit ? 10 : 0) + (symbol ? 33 : 0) + (other ? 64 : 0);
  return Math.floor(eff * Math.log2(pool));
}

export const isWeakPassword = (password: string) => passwordEntropyBits(password) < WEAK_BITS;
