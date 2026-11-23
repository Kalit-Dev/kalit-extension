/**
 * Qurilma Public Suffix List'siz domen tekshiradi. Firmware (domain.cpp) bilan bir xil qoidalar:
 * - site kamida 2 label bo'lishi va origin host'ining suffiksi (nuqta chegarasida) bo'lishi shart;
 * - GET_CREDENTIAL: host == site yoki host `.site` bilan tugaydi.
 */

export function originHost(origin: string): string | null {
  // Faqat [a-z0-9.-]: userinfo (`evil.com@good.com`) va boshqa belgilar rad etiladi.
  const m = /^https?:\/\/([a-z0-9.-]+)(?::\d+)?(?:[/?#]|$)/i.exec(origin);
  return m ? m[1]!.toLowerCase() : null;
}

export function hostMatchesSite(host: string, site: string): boolean {
  return host === site || host.endsWith(`.${site}`);
}

export function siteValid(site: string, host: string): boolean {
  const labels = site.split(".");
  if (labels.length < 2 || labels.some((l) => l.length === 0)) return false;
  return hostMatchesSite(host, site);
}
