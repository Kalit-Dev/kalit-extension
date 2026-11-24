/**
 * Kichik kalit-qiymat ombori. Oddiy extension sahifalarida `chrome.storage.local` to'g'ridan-to'g'ri ishlatiladi.
 * Offscreen hujjatda `chrome.storage` yo'q (faqat `chrome.runtime`) — u holda so'rov background service worker'ga
 * yo'naltiriladi. Ikkala yo'lda ham saqlanadigan joy bitta: `chrome.storage.local`.
 */
export const KV_KEYS = ["hostPriv", "deviceKey", "neverSave", "autoConnect", "lastBackupAt"] as const;
export type KvKey = (typeof KV_KEYS)[number];

export type KvRequest =
  | { type: "bg:kv"; op: "get"; key: KvKey }
  | { type: "bg:kv"; op: "set"; key: KvKey; value: unknown }
  | { type: "bg:kv"; op: "remove"; key: KvKey };

const direct = () => typeof chrome !== "undefined" && chrome.storage?.local !== undefined;

async function relay(req: KvRequest): Promise<unknown> {
  const res = (await chrome.runtime.sendMessage(req)) as { ok: boolean; value?: unknown } | undefined;
  if (!res?.ok) throw new Error("KV_UNAVAILABLE");
  return res.value;
}

export async function kvGet(key: KvKey): Promise<unknown> {
  if (!direct()) return relay({ type: "bg:kv", op: "get", key });
  return (await chrome.storage.local.get(key))[key];
}

export async function kvSet(key: KvKey, value: unknown): Promise<void> {
  if (!direct()) return void (await relay({ type: "bg:kv", op: "set", key, value }));
  await chrome.storage.local.set({ [key]: value });
}

export async function kvRemove(key: KvKey): Promise<void> {
  if (!direct()) return void (await relay({ type: "bg:kv", op: "remove", key }));
  await chrome.storage.local.remove(key);
}
