import type { EntryMeta } from "@/shared/api/device/protocol";

export const STALE_AFTER_DAYS = 365;
const DAY_S = 86_400;

/** `updatedAt` = unix soniya; 0 — qurilma vaqtni bilmaydi (eski yozuv). */
export const hasUpdatedAt = (e: Pick<EntryMeta, "updatedAt">) => e.updatedAt > 0;

/** "dd.mm.yyyy" (mahalliy vaqt) yoki "noma'lum". */
export function formatUpdatedAt(updatedAt: number): string {
  if (!(updatedAt > 0)) return "noma'lum";
  const d = new Date(updatedAt * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * "Parol eskirgan" eslatmasi: faqat web/secret yozuvlar, updatedAt > 0 va 365 kundan eski.
 * updatedAt == 0 (noma'lum) hech qachon eslatma bermaydi. `nowSec` — unix soniya (testlar uchun).
 */
export function isStalePassword(
  e: Pick<EntryMeta, "updatedAt">,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  return hasUpdatedAt(e) && nowSec - e.updatedAt > STALE_AFTER_DAYS * DAY_S;
}
