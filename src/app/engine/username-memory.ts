/**
 * Ko'p bosqichli login (1-sahifa: email, 2-sahifa: parol; Google/Microsoft uslubi) uchun login xotirasi.
 * Faqat RAM'da (engine hujjati), tab + ro'yxatdan o'tadigan domen bo'yicha, ~10 daqiqada eskiradi.
 * Parollar bu yerda hech qachon saqlanmaydi va diskka yozilmaydi.
 */
export const USERNAME_TTL_MS = 10 * 60_000;

interface Remembered {
  site: string;
  username: string;
  at: number;
}

export class UsernameMemory {
  private readonly byTab = new Map<number, Remembered>();

  constructor(private readonly ttlMs = USERNAME_TTL_MS) {}

  remember(tabId: number, site: string, username: string, now = Date.now()) {
    const name = username.trim();
    if (!name) return;
    this.byTab.set(tabId, { site, username: name, at: now });
  }

  /** Boshqa domenga o'tilgan yoki muddati tugagan bo'lsa — unutadi va null qaytaradi. */
  get(tabId: number, site: string | null, now = Date.now()): string | null {
    const r = this.byTab.get(tabId);
    if (!r) return null;
    if (r.site !== site || now - r.at > this.ttlMs) {
      this.byTab.delete(tabId);
      return null;
    }
    return r.username;
  }

  forget(tabId: number) {
    this.byTab.delete(tabId);
  }
}

/** Parol-only sahifada: eslab qolingan login bilan mos yozuvlar bo'lsa — faqat shular, aks holda hammasi. */
export function pickByUsername<T extends { username: string }>(entries: T[], remembered: string | null): T[] {
  if (!remembered) return entries;
  const same = entries.filter((e) => e.username.toLowerCase() === remembered.toLowerCase());
  return same.length > 0 ? same : entries;
}
