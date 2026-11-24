import { create } from "zustand";
import { DeviceClient, DeviceError, type ClientErrorCode } from "@/shared/api/device/client";
import { forgetDevice, getHostKeyPair, getPinnedDeviceKey, pinDeviceKey } from "@/shared/api/device/keys";
import type { AddSecretEntryParams, AddWebEntryParams, AuditReport, Credential, EntryMeta, HostInfo, Status, TotpCode } from "@/shared/api/device/protocol";
import { SecureTransport } from "@/shared/api/device/secure-transport";
import { SerialTransport } from "@/shared/api/device/serial-transport";
import type { RawTransport, TransportKind } from "@/shared/api/device/transport";
import {
  base64ToBytes,
  bytesToBase64,
  runExport,
  runRestore,
  type BackupFile,
  type BackupProgress,
} from "@/shared/api/device/backup";
import { siteOf } from "@/shared/lib/domain";

import { kvSet } from "@/shared/lib/kv";
import type { PendingConfirm, Phase } from "@/shared/api/engine/protocol";

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
  /** Web: `site` ni store hisoblaydi. Secret (`kind: "secret"`): origin/site yo'q. */
  /** `totp` — base64 (engine <-> popup JSON); xom urug' bayt 10..64. */
  addEntry(params: (Omit<AddWebEntryParams, "site" | "totp"> | Omit<AddSecretEntryParams, "totp">) & { totp?: string }): Promise<EntryMeta>;
  /** Faqat secret yozuvlar; qurilmada tasdiq talab qilinadi. Natija hech qayerda saqlanmaydi. */
  revealSecret(id: string): Promise<{ username: string; password: string }>;
  /** v0.8: maxfiy eslatma matni; qurilmada tasdiq talab qilinadi. Natija hech qayerda saqlanmaydi. */
  getNote(id: string): Promise<string>;
  /** v0.9: TOTP kodi; qurilmada tasdiq talab qilinadi. `origin` — sahifa origin'i (content-script'dan). Natija saqlanmaydi. */
  getTotp(id: string, origin?: string): Promise<TotpCode>;
  /** v0.10: parol auditi (qurilmada hisoblanadi, tasdiqsiz). Faqat sonlar va yozuv bayroqlari; parol hech qachon kelmaydi. */
  auditPasswords(): Promise<AuditReport>;
  /** Pin qilingan qurilma kalitini unutadi (DEVICE_KEY_CHANGED dan keyin). */
  forgetDevice(): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  /** v0.5: bitta qurilma tasdig'i bilan `count` ta tugmasiz addEntry sessiyasini ochadi. */
  importBegin(count: number): Promise<void>;
  /** Sessiyani tugatadi; sessiyada qo'shilgan yozuvlar soni (idempotent). */
  importEnd(): Promise<number>;
  /**
   * v0.6 shifrlangan zaxira. Bayt qiymatlari base64 satr (engine <-> popup JSON). Parol faqat chaqiruv davomida
   * xotirada; hech qayerda saqlanmaydi va xatolarga tushmaydi.
   */
  exportBegin(passphrase: string): Promise<{ count: number; salt: string; iter: number }>;
  exportGet(index: number): Promise<string>;
  exportEnd(): Promise<void>;
  restoreBegin(passphrase: string, salt: string, iter: number, count: number): Promise<void>;
  restoreEntry(index: number, blob: string): Promise<"added" | "duplicate">;
  restoreEnd(): Promise<{ added: number; skipped: number }>;
  exportBackup(passphrase: string, onProgress?: (p: BackupProgress) => void): Promise<BackupFile>;
  /** Tugagach vault ro'yxati yangilanadi. */
  restoreBackup(
    file: BackupFile,
    passphrase: string,
    onProgress?: (p: BackupProgress) => void,
  ): Promise<{ added: number; skipped: number }>;
  changeMaster(oldPassword: string, newPassword: string): Promise<void>;
  /** `totp`: base64 urug'; "" = TOTP'ni o'chirish. */
  updateEntry(id: string, patch: { title?: string; username?: string; password?: string; note?: string; totp?: string }): Promise<EntryMeta>;
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

    async connect(kind, opts) {
      // chrome.runtime JSON orqali `undefined` argument `null` bo'lib keladi, shuning uchun default parametr ishlamaydi.
      const silent = opts?.silent ?? false;
      if (get().client || get().phase === "connecting") return;
      set({ phase: "connecting" });
      let secure: SecureTransport | null = null;
      try {
        // Ruxsat manager tab'ida (ConnectDevice) olinadi; engine faqat ruxsat berilgan portni ochadi.
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
            throw new DeviceError("PORT_BUSY", `${e.name}: ${e.message}`);
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
            // v0.7: qurilma harakatsizlikdan keyin o'zi qulfladi (qo'lda LOCK bilan bir xil holat).
            set((st) => ({ phase: "locked", entries: [], pending: null, status: st.status && { ...st.status, state: "LOCKED" } }));
          }
        });
        // Eski ulanishning kech kelgan yopilish xabari yangi ulanishni buzmasligi kerak.
        secure.onClose(() => {
          if (get().client === c) set({ ...initialState });
        });

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
      const entries = await client().listAll();
      set({ phase: "unlocked", entries });
    },

    async pair() {
      await client().call("PAIR_HOST", {});
      await get().refresh();
    },

    async onboard(masterPassword) {
      // Refresh bu yerda chaqirilmaydi: avval master parol eslatmasi ekrani ko'rsatiladi.
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
      set((st) => ({ phase: "locked", entries: [], pending: null, status: st.status && { ...st.status, state: "LOCKED" } }));
    },

    getCredential(id, origin) {
      return client().call("GET_CREDENTIAL", { id, origin });
    },

    revealSecret(id) {
      return client().call("REVEAL_SECRET", { id });
    },

    async getNote(id) {
      return (await client().call("GET_NOTE", { id })).note;
    },

    getTotp(id, origin) {
      return client().getTotp(id, origin);
    },

    auditPasswords() {
      return client().auditAll();
    },

    async addEntry(params) {
      const { totp, ...rest } = params;
      const seed = totp ? { totp: base64ToBytes(totp) } : {};
      let wire: AddWebEntryParams | AddSecretEntryParams;
      if ("kind" in rest && rest.kind === "secret") {
        wire = { ...rest, ...seed };
      } else {
        const web = rest as Omit<AddWebEntryParams, "site" | "totp">;
        const site = siteOf(web.origin);
        if (!site) throw new DeviceError("INVALID_STATE");
        wire = { ...web, site, ...seed };
      }
      const { entry } = await client().call("ADD_ENTRY", wire);
      set((s) => ({ entries: [...s.entries, entry] }));
      return entry;
    },

    async importBegin(count) {
      await client().call("IMPORT_BEGIN", { count });
    },

    async importEnd() {
      const { added } = await client().call("IMPORT_END", {});
      return added;
    },

    async exportBegin(passphrase) {
      const { count, salt, iter } = await client().call("EXPORT_BEGIN", { passphrase });
      return { count, salt: bytesToBase64(salt), iter };
    },

    async exportGet(index) {
      return bytesToBase64((await client().call("EXPORT_GET", { index })).blob);
    },

    async exportEnd() {
      await client().call("EXPORT_END", {});
    },

    async restoreBegin(passphrase, salt, iter, count) {
      await client().call("RESTORE_BEGIN", { passphrase, salt: base64ToBytes(salt), iter, count });
    },

    async restoreEntry(index, blob) {
      return (await client().call("RESTORE_ENTRY", { index, blob: base64ToBytes(blob) })).result;
    },

    async restoreEnd() {
      return client().call("RESTORE_END", {});
    },

    exportBackup(passphrase, onProgress) {
      return runExport(get(), passphrase, onProgress);
    },

    async restoreBackup(file, passphrase, onProgress) {
      try {
        return await runRestore(get(), file, passphrase, onProgress);
      } finally {
        await get().refresh().catch(() => undefined);
      }
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
      const { totp, ...rest } = patch;
      const { entry } = await client().call("UPDATE_ENTRY", { id, ...rest, ...(totp === undefined ? {} : { totp: base64ToBytes(totp) }) });
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
