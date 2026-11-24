import { useDevice } from "@/entities/device";
import { isSecret } from "@/entities/entry";

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
