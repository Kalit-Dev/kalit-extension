import { create } from "zustand";
import { DeviceError, type ClientErrorCode } from "@/device/client";
import type { AddEntryParams, Credential, EntryMeta, HostInfo, Status } from "@/device/protocol";
import type { TransportKind } from "@/device/transport";
import {
  STATE_EVENT,
  type BackgroundRequest,
  type EngineOp,
  type EngineReply,
  type EngineSnapshot,
  type PendingConfirm,
  type Phase,
  type StateEvent,
} from "@/engine/protocol";

export type { PendingConfirm, Phase };

/**
 * Popup tomonidagi ko'zgu. Haqiqiy qurilma ulanishi va holat engine'da (offscreen hujjat);
 * bu store engine holatini aks ettiradi va amallarni unga yuboradi.
 */
interface DeviceStore extends EngineSnapshot {
  connect(kind: TransportKind, opts?: { silent?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  pair(): Promise<void>;
  onboard(masterPassword: string): Promise<void>;
  unlock(masterPassword: string): Promise<void>;
  lock(): Promise<void>;
  getCredential(id: string, origin: string): Promise<Credential>;
  addEntry(params: Omit<AddEntryParams, "site">): Promise<EntryMeta>;
  forgetDevice(): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  changeMaster(oldPassword: string, newPassword: string): Promise<void>;
  updateEntry(id: string, patch: { title?: string; username?: string; password?: string }): Promise<EntryMeta>;
  listHosts(): Promise<HostInfo[]>;
  revokeHost(slot: number): Promise<void>;
}

const initial: EngineSnapshot = {
  kind: null,
  phase: "disconnected",
  status: null,
  entries: [],
  pending: null,
  pairingCode: null,
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
    if (!reply.ok) throw new DeviceError(reply.code as ClientErrorCode);
    return reply.value as T;
  }

  return {
    ...initial,
    connect: (kind, opts) => call("connect", kind, opts),
    disconnect: () => call("disconnect"),
    refresh: () => call("refresh"),
    pair: () => call("pair"),
    onboard: (masterPassword) => call("onboard", masterPassword),
    unlock: (masterPassword) => call("unlock", masterPassword),
    lock: () => call("lock"),
    getCredential: (id, origin) => call<Credential>("getCredential", id, origin),
    addEntry: (params) => call<EntryMeta>("addEntry", params),
    forgetDevice: () => call("forgetDevice"),
    deleteEntry: (id) => call("deleteEntry", id),
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
