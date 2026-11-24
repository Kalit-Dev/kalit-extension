/**
 * Release imzosi uchun Ed25519 OCHIQ kalit (64 hex belgi = 32 bayt).
 * Yaratish va private key'ni saqlash: kalit-firmware/docs/RELEASE-SIGNING.md
 * (`node scripts/gen-signing-key.mjs <pem>`). Hozircha sozlanmagan: barcha nollar bo'lsa, yangilash rad etiladi (fail-closed).
 */
export const RELEASE_PUBLIC_KEY_HEX = "1a101ca468eca57ae557c2f5dddb6995ba604cb45f7a73c0571b71801be7f489";

export const isSigningKeyConfigured = (hex: string = RELEASE_PUBLIC_KEY_HEX): boolean =>
  /^[0-9a-f]{64}$/i.test(hex) && !/^0+$/.test(hex);
