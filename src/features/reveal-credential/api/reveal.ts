import { useDevice } from "@/entities/device";
import { isSecret } from "@/entities/entry";
import type { TotpCode } from "@/shared/api/device/protocol";

/** v0.8: maxfiy eslatmani qurilmadan olish (qurilmada tugma bilan tasdiqlanadi). */
export async function revealNote(entry: { id: string }): Promise<string> {
  return useDevice.getState().getNote(entry.id);
}

/** v0.9: 2FA kodi (qurilmada tugma bilan tasdiqlanadi). Natijani saqlamang: validFor tugagach tashlang. */
export async function revealTotp(entry: { id: string }): Promise<TotpCode> {
  return useDevice.getState().getTotp(entry.id);
}

/** Parolni qurilmadan olish (qurilmada tugma bilan tasdiqlanadi). Veb yozuv: domen tekshiruvi qurilmada bajariladi. */
export async function revealPassword(entry: {
  id: string;
  site: string;
  kind?: string;
}): Promise<{ username: string; password: string }> {
  const { revealSecret, getCredential } = useDevice.getState();
  if (isSecret(entry)) return revealSecret(entry.id);
  const local = entry.site === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(entry.site);
  return getCredential(entry.id, `${local ? "http" : "https"}://${entry.site}`);
}
