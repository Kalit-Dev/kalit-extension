import { getDomain } from "tldts";

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

/** URL → registrable domain (eTLD+1). `accounts.google.com` → `google.com`. */
export function siteOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    return getDomain(u.hostname) ?? u.hostname;
  } catch {
    return null;
  }
}

/** Foydalanuvchi kiritgan manzil → origin. `example.com` → `https://example.com`. */
export function toOrigin(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function faviconUrl(site: string, size = 32): string {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", `https://${site}`);
  url.searchParams.set("size", String(size));
  return url.toString();
}
