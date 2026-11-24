import { PAIR_CODE_RE } from "@/shared/api/device/protocol";

type Random = (n: number) => Uint32Array;

const defaultRandom: Random = (n) => crypto.getRandomValues(new Uint32Array(n));

/** 2^32 dan kichik, 10000 ga karrali eng katta chegara: modulo bias'siz tanlash uchun. */
const LIMIT = 4294960000;

function uniform(random: Random, max: number): number {
  // rad-sampling: LIMIT dan katta qiymatlar tashlanadi
  for (;;) {
    const v = random(1)[0]!;
    if (v < LIMIT) return v % max;
  }
}

/** Haqiqiy kod + 2 ta tasodifiy chalg'ituvchi kod, aralashtirilgan tartibda (jami 3 ta, noyob). */
export function makePairChoices(real: string, random: Random = defaultRandom): string[] {
  if (!PAIR_CODE_RE.test(real)) throw new Error("invalid pair code");
  const codes = [real];
  while (codes.length < 3) {
    const c = String(uniform(random, 10000)).padStart(4, "0");
    if (!codes.includes(c)) codes.push(c);
  }
  // Fisher–Yates
  for (let i = codes.length - 1; i > 0; i--) {
    const j = uniform(random, i + 1);
    [codes[i], codes[j]] = [codes[j]!, codes[i]!];
  }
  return codes;
}
