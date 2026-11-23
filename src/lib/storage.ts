// Extension faqat maxfiy bo'lmagan sozlamalarni saqlaydi.
// Parollar, master parol va vault metadata hech qachon diskka yozilmaydi.

const KEYS = { neverSave: "neverSave" } as const;

export async function getNeverSave(): Promise<string[]> {
  const stored = await chrome.storage.local.get(KEYS.neverSave);
  const value: unknown = stored[KEYS.neverSave];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function addNeverSave(site: string): Promise<void> {
  const list = await getNeverSave();
  await chrome.storage.local.set({ [KEYS.neverSave]: [...new Set([...list, site])].sort() });
}

export async function removeNeverSave(site: string): Promise<void> {
  const list = await getNeverSave();
  await chrome.storage.local.set({ [KEYS.neverSave]: list.filter((s) => s !== site) });
}
