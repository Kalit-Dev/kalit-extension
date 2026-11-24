import type { HostInfo } from "@/device/protocol";
import { useDevice } from "@/store/device-store";

export type { HostInfo };

/** Store amallariga yupqa qatlam (manager sahifalari shu yerdan import qiladi). */
export const changeMaster = (oldPassword: string, newPassword: string) =>
  useDevice.getState().changeMaster(oldPassword, newPassword);
export const updateEntry = (id: string, patch: { title?: string; username?: string; password?: string }) =>
  useDevice.getState().updateEntry(id, patch);
export const listHosts = () => useDevice.getState().listHosts();
export const revokeHost = (slot: number) => useDevice.getState().revokeHost(slot);
