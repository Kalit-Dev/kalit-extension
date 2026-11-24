import { CHARSET, GEN_MAX, GEN_MIN_CUSTOM, GEN_MIN_FULL, WORDS_DEFAULT, WORDS_MAX, WORDS_MIN } from "@/shared/api/device/protocol";

/** Qurilma generatori sozlamalari (UI holati). Natija qurilmada yaratiladi; bu yerda faqat parametrlar. */
export type GeneratorKind = "chars" | "pin" | "words";

export interface GeneratorSettings {
  kind: GeneratorKind;
  length: number;
  pinLength: number;
  words: number;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
}

export const DEFAULT_GENERATOR: GeneratorSettings = {
  kind: "chars",
  length: 20,
  pinLength: 6,
  words: WORDS_DEFAULT,
  lower: true,
  upper: true,
  digit: true,
  symbol: true,
};

export const PIN_MIN = GEN_MIN_CUSTOM;
export const PIN_MAX = 12;

export function charsetOf(s: Pick<GeneratorSettings, "lower" | "upper" | "digit" | "symbol">): number {
  return (s.lower ? CHARSET.lower : 0) | (s.upper ? CHARSET.upper : 0) | (s.digit ? CHARSET.digit : 0) | (s.symbol ? CHARSET.symbol : 0);
}

/** Belgilar rejimida eng kam uzunlik: to'liq to'plam 12, qisqartirilgan to'plam 4 (qurilma qoidasi bilan bir xil). */
export function minLength(s: GeneratorSettings): number {
  return charsetOf(s) === CHARSET.all ? GEN_MIN_FULL : GEN_MIN_CUSTOM;
}

/** Foydalanuvchiga ko'rsatiladigan xato (yoki null). Qurilma baribir qayta tekshiradi. */
export function generatorError(s: GeneratorSettings): string | null {
  if (s.kind === "words") {
    return Number.isInteger(s.words) && s.words >= WORDS_MIN && s.words <= WORDS_MAX ? null : `So'zlar soni ${WORDS_MIN}–${WORDS_MAX}`;
  }
  if (s.kind === "pin") {
    return Number.isInteger(s.pinLength) && s.pinLength >= PIN_MIN && s.pinLength <= PIN_MAX ? null : `PIN uzunligi ${PIN_MIN}–${PIN_MAX}`;
  }
  if (charsetOf(s) === 0) return "Kamida bitta belgi turini tanlang";
  const min = minLength(s);
  return Number.isInteger(s.length) && s.length >= min && s.length <= GEN_MAX ? null : `Uzunlik ${min}–${GEN_MAX}`;
}

/** ADD_ENTRY'ga qo'shiladigan maydonlar. To'liq to'plam = eski yo'l (faqat generateLength): eski firmware bilan ham ishlaydi. */
export function generatorParams(s: GeneratorSettings): { generateLength?: number; charset?: number; words?: number } {
  if (s.kind === "words") return { words: s.words };
  if (s.kind === "pin") return { charset: CHARSET.digit, generateLength: s.pinLength };
  const charset = charsetOf(s);
  return charset === CHARSET.all ? { generateLength: s.length } : { charset, generateLength: s.length };
}

export function describeGenerator(s: GeneratorSettings): string {
  if (s.kind === "words") return `${s.words} ta so'z (passphrase)`;
  if (s.kind === "pin") return `${s.pinLength} xonali PIN`;
  return `${s.length} belgi`;
}
