import type { PairState } from "@/shared/api/engine/protocol";

export type PairView = "idle" | "choosing" | "connecting" | "mismatch";

/**
 * Qaysi ko'rinish — engine'ning `pairState` (u tanlovni mahalliy kod bilan o'zi solishtiradi) va UI'ning `picked`
 * (shu urinishda tanlov qilindi) holati bo'yicha. Mos kelmasa — "mismatch" ogohlantirishi. Mos kelsa engine `idle`
 * ga qaytadi va qurilma tugmasiz pin qiladi: pair() tugaguncha "connecting" (Ulanmoqda…).
 */
export function pairView(s: { pairState: PairState; choices: string[] | null; picked: boolean }): PairView {
  if (s.pairState === "mismatch") return "mismatch";
  if (s.pairState === "choosing" && s.choices) return "choosing";
  if (s.pairState === "idle" && s.picked) return "connecting";
  return "idle";
}
