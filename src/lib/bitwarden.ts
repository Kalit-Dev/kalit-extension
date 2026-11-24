import { siteOf, toOrigin } from "@/lib/domain";

/** Bitwarden (unencrypted) JSON eksportidan qurilmaga qo'shiladigan yozuvlar. Parollar faqat shu obyektlarda. */
export interface ImportItem {
  origin: string;
  site: string;
  username: string;
  password: string;
  title?: string;
}
export interface Skipped {
  name: string;
  reason: string;
}
export interface ParsedExport {
  items: ImportItem[];
  skipped: Skipped[];
}

// Firmware limitlari (lib/kalit_core/vault.h): title<=64, password<=512, username<=256, site+username+title<=160 bayt.
const MAX_TITLE = 64;
const MAX_PASSWORD = 512;
const MAX_USER = 256;
const META_BUDGET = 160;
const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s).length;

export class BitwardenFormatError extends Error {}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function truncateBytes(s: string, max: number): string {
  let out = "";
  for (const ch of s) {
    if (bytes(out + ch) > max) break;
    out += ch;
  }
  return out;
}

/** Faqat login (type 1) yozuvlari. Shifrlangan eksport, noto'g'ri JSON — BitwardenFormatError. */
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

  const items: ImportItem[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();

  for (const raw of root.items as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object" || raw.type !== 1) continue; // karta, note, identity — o'tkazib yuboriladi
    const name = str(raw.name) || "(nomsiz)";
    const login = (raw.login ?? {}) as { username?: unknown; password?: unknown; uris?: unknown };
    const username = str(login.username);
    const password = str(login.password);

    const uris = Array.isArray(login.uris) ? (login.uris as { uri?: unknown }[]) : [];
    let origin: string | null = null;
    for (const u of uris) {
      origin = toOrigin(str(u?.uri));
      if (origin) break;
    }
    if (!origin) {
      skipped.push({ name, reason: "Veb manzil yo'q" });
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

    let title = truncateBytes(name, MAX_TITLE);
    const room = META_BUDGET - bytes(site) - bytes(username);
    if (room < 0) {
      skipped.push({ name, reason: "Sayt+login 160 baytdan oshadi" });
      continue;
    }
    title = truncateBytes(title, room);

    const key = `${site}\u0000${username}`;
    if (seen.has(key)) {
      skipped.push({ name, reason: "Takror (shu sayt va login)" });
      continue;
    }
    seen.add(key);
    items.push({ origin, site, username, password, ...(title ? { title } : {}) });
  }
  return { items, skipped };
}
