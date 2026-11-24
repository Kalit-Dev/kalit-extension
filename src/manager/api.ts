import type { AddSecretEntryParams, HostInfo } from "@/device/protocol";
import { useDevice } from "@/store/device-store";

export type { HostInfo };

/** Store amallariga yupqa qatlam (manager sahifalari shu yerdan import qiladi). */
export const changeMaster = (oldPassword: string, newPassword: string) =>
  useDevice.getState().changeMaster(oldPassword, newPassword);
export const updateEntry = (id: string, patch: { title?: string; username?: string; password?: string }) =>
  useDevice.getState().updateEntry(id, patch);
export const listHosts = () => useDevice.getState().listHosts();
export const revokeHost = (slot: number) => useDevice.getState().revokeHost(slot);

// --- Maxfiy yozuvlar ---
export const isSecret = (e: { kind?: string }) => e.kind === "secret";
export const addSecret = (p: AddSecretEntryParams) => useDevice.getState().addEntry(p);
export const revealSecret = (id: string) => useDevice.getState().revealSecret(id);

/** Parolni qurilmadan olish (qurilmada tugma bilan tasdiqlanadi). Veb yozuv: domen tekshiruvi qurilmada bajariladi. */
export async function revealPassword(entry: {
  id: string;
  site: string;
  kind?: string;
}): Promise<{ username: string; password: string }> {
  if (isSecret(entry)) return revealSecret(entry.id);
  const local = entry.site === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(entry.site);
  return useDevice.getState().getCredential(entry.id, `${local ? "http" : "https"}://${entry.site}`);
}
