import { bytesToBase64 } from "@/shared/api/device/backup";
import { siteOf, toOrigin } from "@/shared/lib/domain";
import { parseTotpInput, TotpInputError } from "@/shared/lib/totp";

/** Import manbasi (Bitwarden JSON, CSV) dan qurilmaga qo'shiladigan yozuvlar. Parollar faqat shu obyektlarda. */
export interface ImportItem {
  origin: string;
  site: string;
  username: string;
  password: string;
  title?: string;
  /** v0.9: 2FA urug'i (base64, 10..64 bayt) — faqat SHA1/6/30 bo'lsa. */
  totp?: string;
}
export interface Skipped {
  name: string;
  reason: string;
}
/** Veb manzili yo'q yozuv: foydalanuvchi veb saytga yoki maxfiy yozuvga aylantirishni tanlaydi. */
export interface NoUrlItem {
  name: string;
  username: string;
  password: string;
  guessedUrl?: string;
  totp?: string;
}
export interface ParsedExport {
  items: ImportItem[];
  noUrl: NoUrlItem[];
  skipped: Skipped[];
  /** 2FA kaliti bor, lekin qurilma qo'llamaydigan (SHA1/6/30 emas yoki yaroqsiz) yozuvlar: 2FA'siz import qilinadi. */
  totpDropped?: number;
}

// Firmware limitlari (lib/kalit_core/vault.h): title<=64, password<=512, username<=256, site+username+title<=160 bayt.
const MAX_TITLE = 64;
const MAX_PASSWORD = 512;
const MAX_USER = 256;
const META_BUDGET = 160;
const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s).length;

export class BitwardenFormatError extends Error {}

/** Manbadan mustaqil, normallashtirilgan yozuv. */
export interface RawLogin {
  name: string;
  uris: string[];
  username: string;
  password: string;
  /** Bitwarden `login.totp`: otpauth:// havola yoki base32. */
  totp?: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function truncateBytes(s: string, max: number): string {
  let out = "";
  for (const ch of s) {
    if (bytes(out + ch) > max) break;
    out += ch;
  }
  return out;
}

/** Maxfiy yozuv nomi: <=64 bayt, nom+login <=160 bayt. */
export function secretTitle(name: string, username: string): string {
  const room = Math.max(0, META_BUDGET - bytes(username));
  return truncateBytes(truncateBytes(name, MAX_TITLE), room);
}

/** Yozuv nomi o'zi domenga o'xshasa (github.com, www.npmjs.com) — origin; brend nomlaridan taxmin qilinmaydi. */
function guessUrl(name: string): string | undefined {
  if (/\s/.test(name) || !name.includes(".")) return undefined;
  const origin = toOrigin(name);
  if (!origin) return undefined;
  const site = siteOf(origin);
  return site && site.length >= 3 && site.includes(".") ? origin : undefined;
}

/** Normallashtirilgan yozuvlarni qurilma qoidalariga solish; yaroqsizlari sababi bilan o'tkazib yuboriladi. */
export function toImportItems(records: RawLogin[]): ParsedExport {
  const items: ImportItem[] = [];
  const noUrl: NoUrlItem[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  let totpDropped = 0;

  for (const r of records) {
    const name = r.name || "(nomsiz)";
    const { username, password } = r;
    let totp: string | undefined;
    if (r.totp?.trim()) {
      try {
        totp = bytesToBase64(parseTotpInput(r.totp));
      } catch (e) {
        if (!(e instanceof TotpInputError)) throw e;
        totpDropped++; // yozuv 2FA'siz import qilinadi
      }
    }

    let origin: string | null = null;
    for (const u of r.uris) {
      origin = toOrigin(u);
      if (origin) break;
    }
    if (!origin) {
      if (!password) {
        skipped.push({ name, reason: "Parol bo'sh" });
      } else if (bytes(password) > MAX_PASSWORD) {
        skipped.push({ name, reason: "Parol juda uzun" });
      } else if (bytes(username) > MAX_USER || bytes(username) > META_BUDGET) {
        skipped.push({ name, reason: "Login juda uzun" });
      } else {
        const guessedUrl = guessUrl(name);
        noUrl.push({ name, username, password, ...(guessedUrl ? { guessedUrl } : {}), ...(totp ? { totp } : {}) });
      }
      continue;
    }
    const site = siteOf(origin);
    if (!site || site.length < 3) {
      skipped.push({ name, reason: "Domen aniqlanmadi" });
      continue;
    }
    if (!username) {
      skipped.push({ name, reason: "Login (username) bo'sh" });
      continue;
    }
    if (bytes(username) > MAX_USER) {
      skipped.push({ name, reason: "Login juda uzun" });
      continue;
    }
    if (!password) {
      skipped.push({ name, reason: "Parol bo'sh" });
      continue;
    }
    if (bytes(password) > MAX_PASSWORD) {
      skipped.push({ name, reason: "Parol juda uzun" });
      continue;
    }

    const room = META_BUDGET - bytes(site) - bytes(username);
    if (room < 0) {
      skipped.push({ name, reason: "Sayt+login 160 baytdan oshadi" });
      continue;
    }
    const title = truncateBytes(truncateBytes(name, MAX_TITLE), room);

    const key = `${site}\u0000${username}`;
    if (seen.has(key)) {
      skipped.push({ name, reason: "Takror (shu sayt va login)" });
      continue;
    }
    seen.add(key);
    items.push({ origin, site, username, password, ...(title ? { title } : {}), ...(totp ? { totp } : {}) });
  }
  return { items, noUrl, skipped, ...(totpDropped > 0 ? { totpDropped } : {}) };
}

/** Bitwarden JSON eksporti: faqat login (type 1). Shifrlangan eksport, noto'g'ri JSON — BitwardenFormatError. */
export function parseBitwardenExport(text: string): ParsedExport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BitwardenFormatError("Fayl JSON emas");
  }
  const root = data as { encrypted?: unknown; items?: unknown };
  if (!root || typeof root !== "object" || !Array.isArray(root.items)) {
    throw new BitwardenFormatError("Bitwarden eksporti emas (items topilmadi)");
  }
  if (root.encrypted === true) {
    throw new BitwardenFormatError("Eksport shifrlangan. Bitwarden'dan shifrlanmagan (.json) eksport qiling");
  }

  const records: RawLogin[] = [];
  for (const raw of root.items as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object" || raw.type !== 1) continue; // karta, note, identity — o'tkazib yuboriladi
    const login = (raw.login ?? {}) as { username?: unknown; password?: unknown; uris?: unknown; totp?: unknown };
    const uris = Array.isArray(login.uris) ? (login.uris as { uri?: unknown }[]).map((u) => str(u?.uri)) : [];
    records.push({ name: str(raw.name), uris, username: str(login.username), password: str(login.password), totp: str(login.totp) });
  }
  return toImportItems(records);
}
