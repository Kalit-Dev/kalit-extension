import { create } from "zustand";
import { DeviceError, type ClientErrorCode } from "@/shared/api/device/client";
import { runExport, runRestore, type BackupFile, type BackupProgress } from "@/shared/api/device/backup";
import type { AddSecretEntryParams, AddWebEntryParams, AuditReport, Credential, EntryMeta, HostInfo, Status, TotpCode } from "@/shared/api/device/protocol";
import type { TransportKind } from "@/shared/api/device/transport";
import {
  STATE_EVENT,
  type BackgroundRequest,
  type EngineOp,
  type EngineReply,
  type EngineSnapshot,
  type PairState,
  type PendingConfirm,
  type Phase,
  type StateEvent,
} from "@/shared/api/engine/protocol";

export type { PairState, PendingConfirm, Phase };

/**
 * Popup tomonidagi ko'zgu. Haqiqiy qurilma ulanishi va holat engine'da (offscreen hujjat);
 * bu store engine holatini aks ettiradi va amallarni unga yuboradi.
 */
interface DeviceStore extends EngineSnapshot {
  connect(kind: TransportKind, opts?: { silent?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  pair(): Promise<void>;
  /** v0.11: kod tanlovi (null = "hech biri mos emas"). */
  pairChoose(code: string | null): Promise<void>;
  onboard(masterPassword: string): Promise<void>;
  unlock(masterPassword: string): Promise<void>;
  lock(): Promise<void>;
  getCredential(id: string, origin: string): Promise<Credential>;
  /** `totp` — base64 urug' (JSON chegarasidan o'tishi uchun). */
  addEntry(params: (Omit<AddWebEntryParams, "site" | "totp"> | Omit<AddSecretEntryParams, "totp">) & { totp?: string }): Promise<EntryMeta>;
  revealSecret(id: string): Promise<{ username: string; password: string }>;
  /** v0.8: maxfiy eslatma matni (qurilmada tugma bilan tasdiqlanadi). */
  getNote(id: string): Promise<string>;
  /** v0.9: TOTP kodi (qurilmada tugma bilan tasdiqlanadi). Natijani saqlamang: muddati tugagach tozalang. */
  getTotp(id: string, origin?: string): Promise<TotpCode>;
  auditPasswords(): Promise<AuditReport>;
  forgetDevice(): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  importBegin(count: number): Promise<void>;
  importEnd(): Promise<number>;
  /** v0.6: oqim shu yerda (popup/manager) boshqariladi, progress uchun; engine faqat alohida buyruqlarni bajaradi. */
  exportBackup(passphrase: string, onProgress?: (p: BackupProgress) => void): Promise<BackupFile>;
  restoreBackup(
    file: BackupFile,
    passphrase: string,
    onProgress?: (p: BackupProgress) => void,
  ): Promise<{ added: number; skipped: number }>;
  changeMaster(oldPassword: string, newPassword: string): Promise<void>;
  /** `totp`: base64 urug'; "" = o'chirish. */
  updateEntry(id: string, patch: { title?: string; username?: string; password?: string; note?: string; totp?: string }): Promise<EntryMeta>;
  listHosts(): Promise<HostInfo[]>;
  revokeHost(slot: number): Promise<void>;
}

const initial: EngineSnapshot = {
  kind: null,
  phase: "disconnected",
  status: null,
  entries: [],
  pending: null,
  pairChoices: null,
  pairState: "idle",
};

const ENGINE_WAIT_MS = 5_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Engine hali yuklanmagan bo'lishi mumkin (brauzer endi ochilgan): background uni yaratadi, biz qayta urinamiz. */
async function send(op: EngineOp, args: unknown[]): Promise<EngineReply> {
  const deadline = Date.now() + ENGINE_WAIT_MS;
  for (;;) {
    try {
      const reply = (await chrome.runtime.sendMessage({ target: "engine", op, args })) as EngineReply | undefined;
      if (reply) return reply;
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("Receiving end does not exist")) throw e;
    }
    if (Date.now() > deadline) throw new DeviceError("DISCONNECTED");
    const ensure: BackgroundRequest = { type: "bg:ensure-engine" };
    await chrome.runtime.sendMessage(ensure).catch(() => undefined);
    await sleep(150);
  }
}

export const useDevice = create<DeviceStore>()((set) => {
  const apply = (state: EngineSnapshot) => set(state);

  async function call<T = void>(op: EngineOp, ...args: unknown[]): Promise<T> {
    const reply = await send(op, args);
    apply(reply.state);
    if (!reply.ok) throw new DeviceError(reply.code as ClientErrorCode, reply.detail);
    return reply.value as T;
  }

  const backupApi = {
    exportBegin: (passphrase: string) => call<{ count: number; salt: string; iter: number }>("exportBegin", passphrase),
    exportGet: (index: number) => call<string>("exportGet", index),
    exportEnd: () => call("exportEnd"),
    restoreBegin: (passphrase: string, salt: string, iter: number, count: number) =>
      call("restoreBegin", passphrase, salt, iter, count),
    restoreEntry: (index: number, blob: string) => call<"added" | "duplicate">("restoreEntry", index, blob),
    restoreEnd: () => call<{ added: number; skipped: number }>("restoreEnd"),
  };

  return {
    ...initial,
    connect: (kind, opts) => call("connect", kind, opts),
    disconnect: () => call("disconnect"),
    refresh: () => call("refresh"),
    pair: () => call("pair"),
    pairChoose: (code) => call("pairChoose", code),
    onboard: (masterPassword) => call("onboard", masterPassword),
    unlock: (masterPassword) => call("unlock", masterPassword),
    lock: () => call("lock"),
    getCredential: (id, origin) => call<Credential>("getCredential", id, origin),
    revealSecret: (id) => call<{ username: string; password: string }>("revealSecret", id),
    getNote: (id) => call<string>("getNote", id),
    getTotp: (id, origin) => call<TotpCode>("getTotp", id, origin),
    auditPasswords: () => call<AuditReport>("auditPasswords"),
    addEntry: (params) => call<EntryMeta>("addEntry", params),
    forgetDevice: () => call("forgetDevice"),
    deleteEntry: (id) => call("deleteEntry", id),
    importBegin: (count) => call("importBegin", count),
    importEnd: () => call<number>("importEnd"),
    exportBackup: (passphrase, onProgress) => runExport(backupApi, passphrase, onProgress),
    async restoreBackup(file, passphrase, onProgress) {
      try {
        return await runRestore(backupApi, file, passphrase, onProgress);
      } finally {
        await call("refresh").catch(() => undefined); // yozuvlar ro'yxati yangilansin
      }
    },
    changeMaster: (oldPassword, newPassword) => call("changeMaster", oldPassword, newPassword),
    updateEntry: (id, patch) => call<EntryMeta>("updateEntry", id, patch),
    listHosts: () => call<HostInfo[]>("listHosts"),
    revokeHost: (slot) => call("revokeHost", slot),
  };
});

export type { Status };

/** Popup ochilganda: engine holatini olish va yangilanishlarga obuna bo'lish. */
export function startSync(): void {
  chrome.runtime.onMessage.addListener((m: Partial<StateEvent>, sender) => {
    if (sender.id === chrome.runtime.id && !sender.tab && m?.type === STATE_EVENT && m.state) {
      useDevice.setState(m.state);
    }
  });
  const pull = () => void send("getState", []).then((r) => useDevice.setState(r.state), () => undefined);
  pull();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && pull());
}
