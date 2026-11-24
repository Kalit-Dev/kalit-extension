import { PAIR_CODE_RE } from "@/shared/api/device/protocol";

type Random = (n: number) => Uint32Array;

const defaultRandom: Random = (n) => crypto.getRandomValues(new Uint32Array(n));

const RANGE = 2 ** 32;
/** v0.11: SAS 2 xonali — 00..99. */
const CODE_SPACE = 100;

/**
 * [0, max) oralig'ida bias'siz son: rad-sampling, chegara = 2^32 dan oshmaydigan, `max` ga karrali eng katta son
 * (floor(2^32 / max) * max). Undan katta/teng qiymatlar tashlanadi.
 */
function uniform(random: Random, max: number): number {
  const limit = Math.floor(RANGE / max) * max;
  for (;;) {
    const v = random(1)[0]!;
    if (v < limit) return v % max;
  }
}

/** Haqiqiy kod + 2 ta tasodifiy chalg'ituvchi kod (00–99), aralashtirilgan tartibda (jami 3 ta, noyob). */
export function makePairChoices(real: string, random: Random = defaultRandom): string[] {
  if (!PAIR_CODE_RE.test(real)) throw new Error("invalid pair code");
  const codes = [real];
  while (codes.length < 3) {
    const c = String(uniform(random, CODE_SPACE)).padStart(2, "0");
    if (!codes.includes(c)) codes.push(c);
  }
  // Fisher–Yates (har bir qadamda o'z oralig'i uchun bias'siz chegara)
  for (let i = codes.length - 1; i > 0; i--) {
    const j = uniform(random, i + 1);
    [codes[i], codes[j]] = [codes[j]!, codes[i]!];
  }
  return codes;
}
