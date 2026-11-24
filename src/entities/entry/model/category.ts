import type { EntryMeta } from "@/shared/api/device/protocol";
import { isSecret } from "./entry";

/**
 * Yozuv toifalari. `web` va `secret` bir-birini istisno qiladi (yozuv turi); `totp` va `note` — qo'shimcha
 * xususiyatlar, shuning uchun bitta yozuv bir nechta toifaga tushishi mumkin (masalan, 2FA'li veb yozuv).
 */
export type EntryCategory = "all" | "web" | "secret" | "totp" | "note";

export const ENTRY_CATEGORIES: readonly EntryCategory[] = ["all", "web", "secret", "totp", "note"];

export function matchesCategory(e: EntryMeta, category: EntryCategory): boolean {
  switch (category) {
    case "all":
      return true;
    case "web":
      return !isSecret(e);
    case "secret":
      return isSecret(e);
    case "totp":
      return e.hasTotp === true;
    case "note":
      return e.hasNote === true;
  }
}

export function categoryCounts(entries: readonly EntryMeta[]): Record<EntryCategory, number> {
  const counts: Record<EntryCategory, number> = { all: entries.length, web: 0, secret: 0, totp: 0, note: 0 };
  for (const e of entries) {
    if (isSecret(e)) counts.secret++;
    else counts.web++;
    if (e.hasTotp) counts.totp++;
    if (e.hasNote) counts.note++;
  }
  return counts;
}

/** Ro'yxatni tur bo'yicha bo'limlarga ajratadi (bo'sh bo'limlar tushib qoladi). */
export function groupByKind(entries: readonly EntryMeta[]): { kind: "web" | "secret"; items: EntryMeta[] }[] {
  const web = entries.filter((e) => !isSecret(e));
  const secret = entries.filter(isSecret);
  return [
    { kind: "web" as const, items: web },
    { kind: "secret" as const, items: secret },
  ].filter((g) => g.items.length > 0);
}

/** URL parametridan toifa (noto'g'ri yoki yo'q bo'lsa "all"). */
export function parseCategory(raw: string | null | undefined): EntryCategory {
  return (ENTRY_CATEGORIES as readonly string[]).includes(raw ?? "") ? (raw as EntryCategory) : "all";
}

/** Toifa bo'shab qolgan bo'lsa (masalan, oxirgi yozuv o'chirilgach) "all". */
export function resolveCategory(raw: string | null | undefined, counts: Record<EntryCategory, number>): EntryCategory {
  const c = parseCategory(raw);
  return counts[c] > 0 ? c : "all";
}

/** Yon panelda ko'rsatiladigan toifalar: "all" va bo'sh bo'lmaganlar. Bitta toifa bo'lsa [] (ajratish ma'nosiz). */
export function visibleCategories(counts: Record<EntryCategory, number>): EntryCategory[] {
  const rest = ENTRY_CATEGORIES.filter((c) => c !== "all" && counts[c] > 0);
  return rest.length >= 2 ? ["all", ...rest] : [];
}
