import type { AuditReport } from "@/shared/api/device/protocol";

export interface AuditFlags {
  duplicate: boolean;
  weak: boolean;
}

/** id -> bayroqlar (faqat bayroqlangan yozuvlar). */
export function flagsById(report: AuditReport | null): Map<string, AuditFlags> {
  return new Map((report?.items ?? []).map((i) => [i.id, { duplicate: i.duplicate, weak: i.weak }]));
}

/** Audit natijasi faqat yozuvlar to'plami o'zgarmaguncha amal qiladi (qo'shish/o'chirish/parol yangilash). */
export function entriesSignature(entries: readonly { id: string; updatedAt: number }[]): string {
  return entries.map((e) => `${e.id}:${e.updatedAt}`).join("|");
}
