import { siteOf } from "@/lib/domain";
import { errorCode } from "@/lib/errors";
import {
  HubRequest,
  type HubResult,
  type MatchesResponse,
  type PendingSaveResponse,
} from "@/lib/messages";
import { addNeverSave, getNeverSave } from "@/lib/storage";
import { useDevice } from "./device-store";
import type { BackgroundRequest, TabRemovedEvent } from "./protocol";

/**
 * Engine (offscreen hujjat) — xabarlar markazi (hub). Side panel yopiq bo'lsa ham ishlaydi.
 * Content script va overlay iframe'lar shu yerga murojaat qiladi.
 */

interface PendingSave {
  origin: string;
  site: string;
  username: string;
  password: string;
  createdAt: number;
}

const SAVE_TTL_MS = 2 * 60_000;
const pendingSaves = new Map<number, PendingSave>();
const OVERLAY_URL = chrome.runtime.getURL("overlay.html");

function takePending(tabId: number, site: string | null): PendingSave | null {
  const p = pendingSaves.get(tabId);
  if (!p) return null;
  if (Date.now() - p.createdAt > SAVE_TTL_MS || p.site !== site) {
    pendingSaves.delete(tabId);
    return null;
  }
  return p;
}

export async function applyToTab(tabId: number, username: string, password: string) {
  // Offscreen hujjatda chrome.tabs yo'q — background orqali.
  const req: BackgroundRequest = { type: "bg:apply", tabId, username, password };
  const res = (await chrome.runtime.sendMessage(req).catch(() => undefined)) as { ok?: boolean } | undefined;
  if (!res?.ok) throw "NO_PAGE";
}

async function handle(
  msg: HubRequest,
  tab: { id: number; url: string },
  fromOverlay: boolean,
): Promise<unknown> {
  const device = useDevice.getState();
  const site = siteOf(tab.url);
  const origin = site ? new URL(tab.url).origin : null;

  switch (msg.type) {
    case "kalit:matches": {
      const state =
        device.phase === "unlocked" ? "unlocked" : device.phase === "disconnected" ? "disconnected" : "locked";
      const entries =
        state === "unlocked" && site
          ? device.entries
              .filter((e) => e.site === site)
              .map(({ id, username, title }) => ({ id, username, title }))
          : [];
      return { state, site, entries } satisfies MatchesResponse;
    }

    case "kalit:fill": {
      if (!fromOverlay || !origin) return { ok: false, error: "INTERNAL" } satisfies HubResult;
      const cred = await device.getCredential(msg.id, origin);
      await applyToTab(tab.id, cred.username, cred.password);
      return { ok: true } satisfies HubResult;
    }

    case "kalit:submitted": {
      if (device.phase !== "unlocked" || !site || !origin) return { prompt: false };
      if ((await getNeverSave()).includes(site)) return { prompt: false };
      // TODO(v0.2): mavjud yozuv uchun parol o'zgarganini qurilmada tekshirish (UPDATE oqimi).
      if (device.entries.some((e) => e.site === site && e.username === msg.username)) {
        return { prompt: false };
      }
      pendingSaves.set(tab.id, {
        origin,
        site,
        username: msg.username,
        password: msg.password,
        createdAt: Date.now(),
      });
      return { prompt: true };
    }

    case "kalit:pending-save": {
      const p = takePending(tab.id, site);
      return (p ? { prompt: true, site: p.site, username: p.username } : { prompt: false }) satisfies PendingSaveResponse;
    }

    case "kalit:save-decision": {
      if (!fromOverlay) return { ok: false, error: "INTERNAL" } satisfies HubResult;
      const p = takePending(tab.id, site);
      if (!p) return { ok: false, error: "NOT_FOUND" } satisfies HubResult;
      pendingSaves.delete(tab.id);
      if (msg.decision === "never") await addNeverSave(p.site);
      if (msg.decision === "save") {
        await device.addEntry({ origin: p.origin, username: p.username, password: p.password });
      }
      return { ok: true } satisfies HubResult;
    }
  }
}

export function startHub() {
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    const tab = sender.tab;
    if (tab?.id === undefined || !tab.url) return;
    const parsed = HubRequest.safeParse(raw);
    if (!parsed.success) return;

    const fromOverlay = sender.url?.startsWith(OVERLAY_URL) ?? false;
    handle(parsed.data, { id: tab.id, url: tab.url }, fromOverlay).then(sendResponse, (e: unknown) =>
      sendResponse({ ok: false, error: errorCode(e) } satisfies HubResult),
    );
    return true; // async javob
  });

  chrome.runtime.onMessage.addListener((raw: Partial<TabRemovedEvent>, sender) => {
    if (sender.id === chrome.runtime.id && !sender.tab && raw?.type === "bg:tab-removed" && typeof raw.tabId === "number") {
      pendingSaves.delete(raw.tabId);
    }
  });
}
