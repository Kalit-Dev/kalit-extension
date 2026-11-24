/** `1.2.3` (ixtiyoriy `v` prefiksi). Pre-release/qo'shimcha qismlar qabul qilinmaydi: firmware faqat MAJOR.MINOR.PATCH ishlatadi. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a < b → -1, teng → 0, a > b → 1. Yaroqsiz versiya `null` (chaqiruvchi qaror qiladi). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! < pb[i]! ? -1 : 1;
  }
  return 0;
}
