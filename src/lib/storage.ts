// Extension faqat maxfiy bo'lmagan sozlamalarni saqlaydi.
// Parollar, master parol va vault metadata hech qachon diskka yozilmaydi.

import { kvGet, kvSet } from "./kv";

const KEY = "neverSave" as const;

export async function getNeverSave(): Promise<string[]> {
  const value = await kvGet(KEY);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function addNeverSave(site: string): Promise<void> {
  const list = await getNeverSave();
  await kvSet(KEY, [...new Set([...list, site])].sort());
}

export async function removeNeverSave(site: string): Promise<void> {
  const list = await getNeverSave();
  await kvSet(KEY, list.filter((s) => s !== site));
}
