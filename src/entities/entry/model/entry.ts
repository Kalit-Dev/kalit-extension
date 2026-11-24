import type { EntryMeta } from "@/shared/api/device/protocol";

export const isSecret = (e: { kind?: string }) => e.kind === "secret";

/** Qidiruv: sayt, login yoki nom bo'yicha. */
export function matchesQuery(e: EntryMeta, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${e.site} ${e.username} ${e.title ?? ""}`.toLowerCase().includes(q);
}

/** Sarlavha (nom yoki sayt), keyin sayt va login bo'yicha tartiblash. */
export function compareEntries(a: EntryMeta, b: EntryMeta): number {
  return (
    (a.title || a.site).localeCompare(b.title || b.site) ||
    a.site.localeCompare(b.site) ||
    a.username.localeCompare(b.username)
  );
}
