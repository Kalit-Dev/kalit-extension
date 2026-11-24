import { create } from "zustand";
import { DeviceClient, DeviceError, type ClientErrorCode } from "@/device/client";
import { forgetDevice, getHostKeyPair, getPinnedDeviceKey, pinDeviceKey } from "@/device/keys";
import type { AddEntryParams, Credential, EntryMeta, HostInfo, Status } from "@/device/protocol";
import { SecureTransport } from "@/device/secure-transport";
import { SerialTransport } from "@/device/serial-transport";
import type { RawTransport, TransportKind } from "@/device/transport";
import { siteOf } from "@/lib/domain";

import { kvSet } from "@/lib/kv";
import type { PendingConfirm, Phase } from "./protocol";

export type { PendingConfirm, Phase };

interface DeviceStore {
  client: DeviceClient | null;
  kind: TransportKind | null;
  phase: Phase;
  status: Status | null;
  /** Faqat metadata, faqat RAM'da. Parollar bu yerda hech qachon bo'lmaydi. */
  entries: EntryMeta[];
  pending: PendingConfirm | null;
  /** Noise handshake'dan hosil bo'lgan 4 xonali kod (ikkala tomonda bir xil). */
  pairingCode: string | null;

  connect(kind: TransportKind, opts?: { silent?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  pair(): Promise<void>;
  onboard(masterPassword: string): Promise<void>;
  unlock(masterPassword: string): Promise<void>;
  lock(): Promise<void>;
  getCredential(id: string, origin: string): Promise<Credential>;
  /** `site` ni store o'zi hisoblaydi (tldts); qurilma uni origin'ga qarshi tekshiradi. */
  addEntry(params: Omit<AddEntryParams, "site">): Promise<EntryMeta>;
  /** Pin qilingan qurilma kalitini unutadi (DEVICE_KEY_CHANGED dan keyin). */
  forgetDevice(): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  changeMaster(oldPassword: string, newPassword: string): Promise<void>;
  updateEntry(id: string, patch: { title?: string; username?: string; password?: string }): Promise<EntryMeta>;
  listHosts(): Promise<HostInfo[]>;
  revokeHost(slot: number): Promise<void>;
}

const initialState = {
  client: null,
  kind: null,
  phase: "disconnected" as Phase,
  status: null,
  entries: [] as EntryMeta[],
  pending: null,
  pairingCode: null as string | null,
};

const SECURE_ERRORS = new Set(["DEVICE_KEY_CHANGED", "PROTOCOL", "TIMEOUT"]);
const hostName = () => `Chrome · ${navigator.platform || "PC"}`.slice(0, 64);

export const useDevice = create<DeviceStore>()((set, get) => {
  const client = () => {
    const c = get().client;
    if (!c) throw new DeviceError("DISCONNECTED");
    return c;
  };

  return {
    ...initialState,

    async connect(kind, { silent = false } = {}) {
      if (get().client || get().phase === "connecting") return;
      set({ phase: "connecting" });
      let secure: SecureTransport | null = null;
      try {
        // Ruxsat grant.html tab'ida olinadi; engine faqat ruxsat berilgan portni ochadi.
        const raw: RawTransport | null = await SerialTransport.fromGranted();
        if (!raw) {
          set({ phase: "disconnected" });
          if (!silent) throw new DeviceError("NO_PORT");
          return;
        }
        if (!silent && kind === "usb") void kvSet("autoConnect", true);
        secure = new SecureTransport(raw, await getHostKeyPair(), {
          pinnedDeviceKey: getPinnedDeviceKey,
          pinDeviceKey,
          hostName: hostName(),
        });
        try {
          await secure.open();
        } catch (e) {
          if (e instanceof Error && SECURE_ERRORS.has(e.message)) throw new DeviceError(e.message as ClientErrorCode);
          // Web Serial port.open(): NetworkError = port band/ochilmadi, InvalidStateError = allaqachon ochiq.
          if (e instanceof DOMException && (e.name === "NetworkError" || e.name === "InvalidStateError")) {
            throw new DeviceError("PORT_BUSY");
          }
          throw e;
        }

        const c = new DeviceClient(secure);
        c.onEvent((e) => {
          if (e.event === "CONFIRM_PENDING") {
            set({ pending: { ...e.data, expiresAt: Date.now() + e.data.timeoutMs } });
          } else if (e.event === "CONFIRM_DONE") {
            set({ pending: null });
          } else if (e.event === "LOCKED") {
            set({ phase: "locked", entries: [], pending: null });
          }
        });
        secure.onClose(() => set({ ...initialState }));

        set({ client: c, kind, pairingCode: secure.pairingCode });
        await get().refresh();
      } catch (e) {
        console.error("[kalit-engine] connect failed", e);
        await (get().client?.transport ?? secure)?.close().catch(() => undefined);
        set({ ...initialState });
        if (!silent) throw e;
      }
    },

    async disconnect() {
      void kvSet("autoConnect", false); // qo'lda uzilgan: port bo'shaydi (masalan, firmware yuklash uchun), o'zi qayta ulanmaydi
      await get().client?.transport.close();
      set({ ...initialState });
    },

    async refresh() {
      const status = await client().call("GET_STATUS", {});
      set({ status });
      if (!status.hostTrusted) return set({ phase: "pairing", entries: [] });
      if (status.state === "FACTORY") return set({ phase: "factory", entries: [] });
      if (status.state === "LOCKED") return set({ phase: "locked", entries: [] });
      const { entries } = await client().call("LIST", {});
      set({ phase: "unlocked", entries });
    },

    async pair() {
      await client().call("PAIR_HOST", {});
      await get().refresh();
    },

    async onboard(masterPassword) {
      // Refresh bu yerda chaqirilmaydi: avval recovery phrase ekrani ko'rsatiladi.
      await client().call("ONBOARD", { masterPassword });
    },

    async unlock(masterPassword) {
      try {
        await client().call("UNLOCK", { masterPassword });
      } catch (e) {
        if (e instanceof DeviceError && e.code === "WIPED") {
          // Zavod holati: qurilma yangi kalit yaratdi. Eski pin'ni unutib ajratamiz, keyingi ulanish toza bo'ladi.
          await forgetDevice();
          await get().client?.transport.close().catch(() => undefined);
          set({ ...initialState });
        } else {
          await get().refresh().catch(() => undefined); // urinishlar sonini yangilash
        }
        throw e;
      }
      await get().refresh().catch(() => undefined);
    },

    async lock() {
      await client().call("LOCK", {});
      set({ phase: "locked", entries: [], pending: null });
    },

    getCredential(id, origin) {
      return client().call("GET_CREDENTIAL", { id, origin });
    },

    async addEntry(params) {
      const site = siteOf(params.origin);
      if (!site) throw new DeviceError("INVALID_STATE");
      const { entry } = await client().call("ADD_ENTRY", { ...params, site });
      set((s) => ({ entries: [...s.entries, entry] }));
      return entry;
    },

    async deleteEntry(id) {
      await client().call("DELETE_ENTRY", { id });
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    },

    async changeMaster(oldPassword, newPassword) {
      try {
        await client().call("CHANGE_MASTER", { oldPassword, newPassword });
      } catch (e) {
        if (e instanceof DeviceError && e.code === "WIPED") {
          await forgetDevice();
          await get().client?.transport.close().catch(() => undefined);
          set({ ...initialState });
        } else {
          await get().refresh().catch(() => undefined); // urinishlar sonini yangilash
        }
        throw e;
      }
      await get().refresh().catch(() => undefined);
    },

    async updateEntry(id, patch) {
      const { entry } = await client().call("UPDATE_ENTRY", { id, ...patch });
      set((s) => ({ entries: s.entries.map((e) => (e.id === entry.id ? entry : e)) }));
      return entry;
    },

    async listHosts() {
      return (await client().call("LIST_HOSTS", {})).hosts;
    },

    async revokeHost(slot) {
      // Joriy host bekor qilinsa qurilma CLOSED yuboradi: onClose holatni tozalaydi.
      await client().call("REVOKE_HOST", { slot });
    },

    forgetDevice,
  };
});
