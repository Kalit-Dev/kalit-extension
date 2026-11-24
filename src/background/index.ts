import { KV_KEYS, type KvRequest } from "@/lib/kv";
import type { ApplyMessage } from "@/lib/messages";
import type { BackgroundRequest, EngineRequest, TabRemovedEvent } from "@/engine/protocol";

// Background service worker: engine (offscreen hujjat) ni tirik tutadi
// va offscreen'da yo'q API'larni (chrome.storage, chrome.tabs, chrome.idle) engine uchun bajaradi.
// Qurilma ulanishi service worker'da emas: u har ~30 s da to'xtatiladi, Noise sessiyasi yo'qolardi.

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

let ensuring: Promise<void> | null = null;
function ensureEngine(): Promise<void> {
  ensuring ??= (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Keeps the USB serial connection to the Kalit device alive while the popup is closed.",
      });
    }
  })().finally(() => (ensuring = null));
  return ensuring;
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureEngine();
});
chrome.runtime.onStartup.addListener(() => void ensureEngine());
void ensureEngine(); // service worker har uyg'onganda

const fromOffscreen = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id && sender.url?.startsWith(OFFSCREEN_URL) === true;
const fromExtensionPage = (sender: chrome.runtime.MessageSender) => sender.id === chrome.runtime.id && !sender.tab;

chrome.runtime.onMessage.addListener((raw: BackgroundRequest | KvRequest, sender, sendResponse) => {
  switch (raw?.type) {
    case "bg:ensure-engine": {
      if (!fromExtensionPage(sender)) return;
      ensureEngine().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    }
    case "bg:kv": {
      if (!fromOffscreen(sender) || !(KV_KEYS as readonly string[]).includes(raw.key)) return;
      const done = (value?: unknown) => sendResponse({ ok: true, value });
      const fail = () => sendResponse({ ok: false });
      if (raw.op === "get") chrome.storage.local.get(raw.key).then((r) => done(r[raw.key]), fail);
      else if (raw.op === "set") chrome.storage.local.set({ [raw.key]: raw.value }).then(() => done(), fail);
      else chrome.storage.local.remove(raw.key).then(() => done(), fail);
      return true;
    }
    case "bg:apply": {
      if (!fromOffscreen(sender)) return;
      const msg: ApplyMessage = { type: "kalit:apply", username: raw.username, password: raw.password };
      chrome.tabs.sendMessage(raw.tabId, msg, { frameId: 0 }).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
      return true;
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const event: TabRemovedEvent = { type: "bg:tab-removed", tabId };
  chrome.runtime.sendMessage(event).catch(() => undefined);
});

// Kompyuter ekrani qulflansa — qurilma ham qulflanadi.
chrome.idle.onStateChanged.addListener((state) => {
  if (state !== "locked") return;
  const req: EngineRequest = { target: "engine", op: "lockIfUnlocked", args: [] };
  chrome.runtime.sendMessage(req).catch(() => undefined);
});
