import type {
  ApplyMessage,
  HubRequest,
  MatchesResponse,
  OverlayMessage,
  PendingSaveResponse,
} from "@/lib/messages";
import { findLoginFields, isLoginField, setValue } from "./forms";
import { Overlay } from "./overlay";

// Content script yengil: zod/React yo'q, faqat DOM bilan ishlaydi.
// Parollar bu yerda faqat to'ldirish/saqlash lahzasida bo'ladi.

const EXT_ORIGIN = new URL(chrome.runtime.getURL("/")).origin;
const overlay = new Overlay();
let lastField: HTMLInputElement | null = null;
let lastCapture = 0;
let suppressMenuUntil = 0; // to'ldirish paytida focus menyuni qayta ochmasin

async function ask<T>(msg: HubRequest): Promise<T | null> {
  if (!chrome.runtime?.id) return null; // extension qayta yuklangan
  try {
    return ((await chrome.runtime.sendMessage(msg)) as T | undefined) ?? null;
  } catch {
    return null; // side panel yopiq
  }
}

// ── Autofill: login maydoniga fokus → inline menu ─────────────────────────────
document.addEventListener(
  "focusin",
  async (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !isLoginField(el)) return;
    lastField = el;
    if (overlay.current === "save" || Date.now() < suppressMenuUntil) return;

    const res = await ask<MatchesResponse>({ type: "kalit:matches" });
    if (!res || res.state === "disconnected") return;
    if (res.state === "unlocked" && res.entries.length === 0) return;
    if (document.activeElement === el) overlay.show("menu", el);
  },
  true,
);

document.addEventListener(
  "mousedown",
  (e) => {
    if (overlay.current !== "menu") return;
    if (e.target === overlay.element || e.target === lastField) return;
    overlay.hide();
  },
  true,
);

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && overlay.current === "menu") overlay.hide();
    if (e.key === "Enter" && e.target instanceof HTMLInputElement && isLoginField(e.target)) {
      capture(e.target.form ?? document);
    }
  },
  true,
);

// ── Overlay iframe → content (faqat extension origin'dan) ─────────────────────
window.addEventListener("message", (e: MessageEvent<OverlayMessage>) => {
  if (e.origin !== EXT_ORIGIN || e.source !== overlay.window || e.data?.source !== "kalit") return;
  if (e.data.type === "resize") overlay.setHeight(e.data.height);
  if (e.data.type === "close") overlay.hide();
});

// ── Side panel → content: to'ldirish ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((raw: unknown, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  const msg = raw as ApplyMessage;
  if (msg?.type !== "kalit:apply") return;

  suppressMenuUntil = Date.now() + 1000;
  const { username, password } = findLoginFields(lastField?.form ?? document);
  if (username && msg.username) setValue(username, msg.username);
  if (password) setValue(password, msg.password);
  overlay.hide();
});

// ── Saqlash: submit'ni ushlash ────────────────────────────────────────────────
const SUBMIT_TEXT = /log ?in|sign ?in|continue|next|kirish|davom|войти|далее/i;

function capture(scope: ParentNode) {
  if (Date.now() - lastCapture < 1500) return;
  const { username, password } = findLoginFields(scope);
  if (!password?.value || !username?.value.trim()) return; // TODO: multi-step formalar
  lastCapture = Date.now();

  void ask<PendingSaveResponse>({
    type: "kalit:submitted",
    username: username.value.trim(),
    password: password.value,
  }).then((res) => {
    // SPA: sahifa o'zgarmasa shu yerda ko'rsatamiz; aks holda keyingi sahifada.
    if (res?.prompt) setTimeout(() => overlay.show("save"), 600);
  });
}

document.addEventListener("submit", (e) => capture(e.target as HTMLFormElement), true);

document.addEventListener(
  "click",
  (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const btn = target?.closest<HTMLElement>('button, input[type="submit"], [role="button"]');
    if (!btn) return;
    const isSubmit =
      (btn instanceof HTMLButtonElement && btn.type === "submit") ||
      (btn instanceof HTMLInputElement && btn.type === "submit") ||
      SUBMIT_TEXT.test(btn.textContent ?? "");
    if (isSubmit) capture(btn.closest("form") ?? document);
  },
  true,
);

// Yangi sahifa yuklanganda — oldingi sahifadan kutilayotgan saqlash bormi?
void ask<PendingSaveResponse>({ type: "kalit:pending-save" }).then((res) => {
  if (res?.prompt) overlay.show("save");
});
