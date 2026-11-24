import { z } from "zod";

/**
 * Content script / overlay iframe → popup (hub) xabarlari.
 * Origin hech qachon payload'dan olinmaydi — faqat `sender.tab.url` dan.
 */
export const HubRequest = z.discriminatedUnion("type", [
  /** `passwordOnly`: sahifada parol bor, login maydoni yo'q (ko'p bosqichli login 2-qadami). */
  z.object({ type: z.literal("kalit:matches"), passwordOnly: z.boolean().optional() }),
  z.object({ type: z.literal("kalit:fill"), id: z.string().min(1).max(64) }),
  /** v0.9: 2FA kodini qurilmadan olib, sahifadagi OTP maydoniga to'ldirish (kod overlay'ga qaytmaydi). */
  z.object({ type: z.literal("kalit:totp"), id: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("kalit:submitted"),
    /** Yo'q bo'lsa (parol-only sahifa) — hub oldingi bosqichda eslab qolingan loginni ishlatadi. */
    username: z.string().trim().min(1).max(256).optional(),
    password: z.string().min(1).max(512),
  }),
  /** Ko'p bosqichli login 1-qadami: login yuborildi, parol maydoni yo'q. Parol hech qachon yuborilmaydi. */
  z.object({ type: z.literal("kalit:remember-username"), username: z.string().trim().min(1).max(256) }),
  z.object({ type: z.literal("kalit:pending-save") }),
  z.object({
    type: z.literal("kalit:save-decision"),
    decision: z.enum(["save", "dismiss", "never"]),
  }),
]);
export type HubRequest = z.infer<typeof HubRequest>;

export interface MatchItem {
  id: string;
  username: string;
  title?: string;
  /** v0.9: yozuvda 2FA (TOTP) bor. */
  hasTotp?: true;
}

export interface MatchesResponse {
  state: "unlocked" | "locked" | "disconnected";
  site: string | null;
  entries: MatchItem[];
}

export interface PendingSaveResponse {
  prompt: boolean;
  site?: string;
  username?: string;
  /** v0.7: shu sayt+login uchun yozuv bor — "saqlash" emas, "yangilash" taklif qilinadi. */
  update?: boolean;
}

export type HubResult = { ok: true } | { ok: false; error: string };

/** Popup → content script: formani to'ldirish. */
export interface ApplyMessage {
  type: "kalit:apply";
  username: string;
  password: string;
}

/** Popup/hub → content script: 2FA kodini OTP maydon(lar)iga to'ldirish. */
export interface ApplyTotpMessage {
  type: "kalit:apply-totp";
  code: string;
}

/** Overlay iframe → content script (window.postMessage). */
export type OverlayMessage =
  | { source: "kalit"; type: "resize"; height: number }
  | { source: "kalit"; type: "close" };
