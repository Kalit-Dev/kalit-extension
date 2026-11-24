import { siteOf } from "@/shared/lib/domain";
import { errorCode } from "@/shared/lib/errors";
import {
  HubRequest,
  type HubResult,
  type MatchesResponse,
  type PendingSaveResponse,
} from "@/shared/api/messages";
import { addNeverSave, getNeverSave } from "@/shared/lib/storage";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { useDevice } from "./device-store";
import { pickByUsername, UsernameMemory } from "./username-memory";
import type { BackgroundRequest, TabRemovedEvent } from "@/shared/api/engine/protocol";

/**
 * Engine (offscreen hujjat) — xabarlar markazi (hub). Popup yopiq bo'lsa ham ishlaydi.
 * Content script va overlay iframe'lar shu yerga murojaat qiladi.
 */

interface PendingSave {
  origin: string;
  site: string;
  username: string;
  password: string;
  createdAt: number;
  /** Mavjud yozuv id'si: bor bo'lsa "save" UPDATE_ENTRY qiladi. */
  updateId?: string;
}

const SAVE_TTL_MS = 2 * 60_000;
const FILL_TTL_MS = 10 * 60_000;
const pendingSaves = new Map<number, PendingSave>();
const usernames = new UsernameMemory();
/** Kalit o'zi to'ldirgan parol (SHA-256) — o'sha parol submit qilinsa, "yangilash" taklif qilinmaydi. */
const filled = new Map<number, { site: string; username: string; hash: string; at: number }>();
const passwordHash = (pw: string) => bytesToHex(sha256(utf8ToBytes(pw)));
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

export async function applyTotpToTab(tabId: number, code: string) {
  const req: BackgroundRequest = { type: "bg:apply-totp", tabId, code };
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
      const siteEntries =
        state === "unlocked" && site
          ? device.entries
              .filter((e) => e.site === site)
              .map(({ id, username, title, hasTotp }) => ({ id, username, title, ...(hasTotp ? { hasTotp: true as const } : {}) }))
          : [];
      const entries = msg.passwordOnly ? pickByUsername(siteEntries, usernames.get(tab.id, site)) : siteEntries;
      return { state, site, entries } satisfies MatchesResponse;
    }

    case "kalit:fill": {
      if (!fromOverlay || !origin) return { ok: false, error: "INTERNAL" } satisfies HubResult;
      const cred = await device.getCredential(msg.id, origin);
      await applyToTab(tab.id, cred.username, cred.password);
      if (site) filled.set(tab.id, { site, username: cred.username, hash: passwordHash(cred.password), at: Date.now() });
      return { ok: true } satisfies HubResult;
    }

    case "kalit:totp": {
      if (!fromOverlay || !origin) return { ok: false, error: "INTERNAL" } satisfies HubResult;
      const { code } = await device.getTotp(msg.id, origin);
      await applyTotpToTab(tab.id, code);
      return { ok: true } satisfies HubResult;
    }

    case "kalit:submitted": {
      if (device.phase !== "unlocked" || !site || !origin) return { prompt: false };
      if ((await getNeverSave()).includes(site)) return { prompt: false };
      // Parol-only sahifada login oldingi bosqichdan olinadi (agar bo'lmasa — taklif yo'q).
      const username = msg.username ?? usernames.get(tab.id, site);
      if (!username) return { prompt: false };
      // Kalit o'zi to'ldirgan o'sha parol: o'zgarish yo'q.
      const f = filled.get(tab.id);
      if (f && f.site === site && f.username === username && f.hash === passwordHash(msg.password) && Date.now() - f.at < FILL_TTL_MS) {
        return { prompt: false };
      }
      // Mavjud yozuv (sayt+login): parolni qurilmada ko'rmasdan solishtirib bo'lmaydi — doim "yangilash" taklif qilinadi.
      const existing = device.entries.find((e) => e.kind !== "secret" && e.site === site && e.username === username);
      pendingSaves.set(tab.id, {
        origin,
        site,
        username,
        password: msg.password,
        createdAt: Date.now(),
        ...(existing ? { updateId: existing.id } : {}),
      });
      usernames.forget(tab.id);
      return { prompt: true };
    }

    case "kalit:remember-username": {
      if (site) usernames.remember(tab.id, site, msg.username);
      return { ok: true } satisfies HubResult;
    }

    case "kalit:pending-save": {
      const p = takePending(tab.id, site);
      return (
        p ? { prompt: true, site: p.site, username: p.username, ...(p.updateId ? { update: true } : {}) } : { prompt: false }
      ) satisfies PendingSaveResponse;
    }

    case "kalit:save-decision": {
      if (!fromOverlay) return { ok: false, error: "INTERNAL" } satisfies HubResult;
      const p = takePending(tab.id, site);
      if (!p) return { ok: false, error: "NOT_FOUND" } satisfies HubResult;
      pendingSaves.delete(tab.id);
      if (msg.decision === "never") await addNeverSave(p.site);
      if (msg.decision === "save") {
        if (p.updateId) await device.updateEntry(p.updateId, { password: p.password }); // qurilmada tugma bilan tasdiqlanadi
        else await device.addEntry({ origin: p.origin, username: p.username, password: p.password });
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
      usernames.forget(raw.tabId);
      filled.delete(raw.tabId);
    }
  });
}
