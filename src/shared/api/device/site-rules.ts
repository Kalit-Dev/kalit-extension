/**
 * Qurilma Public Suffix List'siz domen tekshiradi. Firmware (domain.cpp) bilan bir xil qoidalar:
 * - site kamida 2 label bo'lishi va origin host'ining suffiksi (nuqta chegarasida) bo'lishi shart;
 * - GET_CREDENTIAL: host == site yoki host `.site` bilan tugaydi (IP/raqamli host: faqat to'liq tenglik).
 */

export function originHost(origin: string): string | null {
  // Faqat [a-z0-9.-]: userinfo (`evil.com@good.com`) va boshqa belgilar rad etiladi. Port: 1..5 raqam, keyin
  // faqat oxir yoki / ? # (aks holda `example.com:x@evil.com` haqiqiy host evil.com bo'lsa ham example.com bo'lib o'tardi).
  const m = /^https?:\/\/([a-z0-9.-]+)(?::\d{1,5})?(?:[/?#]|$)/i.exec(origin);
  if (!m) return null;
  const host = m[1]!.toLowerCase();
  // Bo'sh label (`.example.com`, `a..b`, `example.com.`) rad etiladi — firmware bilan bir xil.
  return host.split(".").some((l) => l.length === 0) ? null : host;
}

/** Faqat raqam va nuqta (IPv4/raqamli host): TLD hech qachon raqamli emas, shuning uchun suffiks qoidasi qo'llanmaydi. */
const ipLike = (s: string) => /^[0-9.]*$/.test(s);

export function hostMatchesSite(host: string, site: string): boolean {
  if (host === site) return site.length > 0;
  if (site.length === 0 || ipLike(host) || ipLike(site)) return false;
  return host.endsWith(`.${site}`);
}

export function siteValid(site: string, host: string): boolean {
  const labels = site.split(".");
  if (labels.length < 2 || labels.some((l) => l.length === 0)) return false;
  return hostMatchesSite(host, site);
}
