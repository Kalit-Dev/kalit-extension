import type { ApplyMessage } from "@/shared/api/messages";

/** Popup'dan faol tab'dagi login formasini to'ldirish. */
export async function applyToTab(tabId: number, username: string, password: string): Promise<void> {
  const msg: ApplyMessage = { type: "kalit:apply", username, password };
  try {
    await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
  } catch {
    throw "NO_PAGE";
  }
}
