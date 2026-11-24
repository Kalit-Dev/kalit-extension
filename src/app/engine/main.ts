import { DeviceError } from "@/shared/api/device/client";
import { errorCode } from "@/shared/lib/errors";
import { kvGet } from "@/shared/lib/kv";
import { engineSnapshot, useDevice } from "./device-store";
import { startHub } from "./hub";
import {
  isEngineRequest,
  STATE_EVENT,
  type EngineReply,
  type EngineRequest,
  type StateEvent,
} from "@/shared/api/engine/protocol";

/**
 * Engine: offscreen hujjatda yashaydi — brauzer ochiq ekan, popup yopiq bo'lsa ham.
 * Qurilma ulanishi (Web Serial), Noise sessiyasi, holat va content script hub'i shu yerda.
 * Popup faqat UI: holat ko'zgusini oladi va buyruqlarni shu yerga yuboradi.
 */

const snapshot = engineSnapshot;

const broadcast = () => {
  const event: StateEvent = { type: STATE_EVENT, state: snapshot() };
  chrome.runtime.sendMessage(event).catch(() => undefined); // tinglovchi (popup) bo'lmasligi mumkin
};
useDevice.subscribe(broadcast);

type Handler = (...args: never[]) => unknown;

async function run({ op, args }: EngineRequest): Promise<unknown> {
  const s = useDevice.getState();
  const handlers: Record<EngineRequest["op"], Handler> = {
    getState: () => null,
    connect: s.connect,
    disconnect: s.disconnect,
    refresh: s.refresh,
    pair: s.pair,
    pairChoose: s.pairChoose,
    onboard: s.onboard,
    unlock: s.unlock,
    lock: s.lock,
    lockIfUnlocked: () => (s.phase === "unlocked" ? s.lock() : undefined),
    getCredential: s.getCredential,
    revealSecret: s.revealSecret,
    getNote: s.getNote,
    getTotp: s.getTotp,
    auditPasswords: s.auditPasswords,
    addEntry: s.addEntry,
    deleteEntry: s.deleteEntry,
    importBegin: s.importBegin,
    importEnd: s.importEnd,
    exportBegin: s.exportBegin,
    exportGet: s.exportGet,
    exportEnd: s.exportEnd,
    restoreBegin: s.restoreBegin,
    restoreEntry: s.restoreEntry,
    restoreEnd: s.restoreEnd,
    changeMaster: s.changeMaster,
    updateEntry: s.updateEntry,
    listHosts: s.listHosts,
    revokeHost: s.revokeHost,
    forgetDevice: s.forgetDevice,
  };
  return (handlers[op] as (...a: unknown[]) => unknown)(...args);
}

const MANAGER_URL = chrome.runtime.getURL("manager.html");

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  // Faqat extension'ning tab'siz sahifalari (popup, background) va manager.html tab'i.
  // Content script / overlay tab'lari rad etiladi (ularning sender.url'i boshqa).
  if (sender.id !== chrome.runtime.id || !isEngineRequest(raw)) return;
  if (sender.tab && !(sender.url === MANAGER_URL || sender.url?.startsWith(MANAGER_URL + "#"))) return;
  run(raw).then(
    (value): EngineReply => ({ ok: true, value: value ?? null, state: snapshot() }),
    (e: unknown): EngineReply => ({
      ok: false,
      code: e instanceof DeviceError ? e.code : errorCode(e),
      detail: e instanceof DeviceError ? e.detail : e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      state: snapshot(),
    }),
  ).then(sendResponse);
  return true; // async javob
});

startHub();

/** Avval ruxsat berilgan qurilmaga jim ulanish. Foydalanuvchi qo'lda uzgan bo'lsa — ulanmaydi. */
async function autoConnect() {
  if ((await kvGet("autoConnect")) === false) return;
  try {
    await useDevice.getState().connect("usb", { silent: true });
  } catch (e) {
    console.warn("[kalit-engine] auto-connect failed", e);
  }
}

if (!("serial" in navigator)) {
  console.error("[kalit-engine] navigator.serial yo'q: offscreen hujjatda Web Serial mavjud emas");
} else {
  // Qurilma kabeli qayta ulansa — o'zi qayta ulanadi.
  navigator.serial.addEventListener("connect", () => void autoConnect());
}
void autoConnect();
