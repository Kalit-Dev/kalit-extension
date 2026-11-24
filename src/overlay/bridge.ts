import type { HubRequest, OverlayMessage } from "@/lib/messages";

type Payload = OverlayMessage extends infer M ? (M extends OverlayMessage ? Omit<M, "source"> : never) : never;

/** Iframe → content script (faqat o'lcham va yopish — maxfiy ma'lumot yo'q). */
export function post(message: Payload) {
  window.parent.postMessage({ source: "kalit", ...message }, "*");
}

export const closeOverlay = () => post({ type: "close" });

/** Iframe → popup hub. Panel yopiq bo'lsa "NO_PANEL". */
export async function hub<T>(msg: HubRequest): Promise<T> {
  let res: unknown;
  try {
    res = await chrome.runtime.sendMessage(msg);
  } catch {
    throw "NO_PANEL";
  }
  if (res === undefined) throw "NO_PANEL";
  if (res && typeof res === "object" && "ok" in res && res.ok === false && "error" in res) {
    throw String(res.error);
  }
  return res as T;
}
