import { z } from "zod";

/**
 * Content script / overlay iframe → popup (hub) xabarlari.
 * Origin hech qachon payload'dan olinmaydi — faqat `sender.tab.url` dan.
 */
export const HubRequest = z.discriminatedUnion("type", [
  z.object({ type: z.literal("kalit:matches") }),
  z.object({ type: z.literal("kalit:fill"), id: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("kalit:submitted"),
    username: z.string().trim().min(1).max(256),
    password: z.string().min(1).max(512),
  }),
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
}

export type HubResult = { ok: true } | { ok: false; error: string };

/** Popup → content script: formani to'ldirish. */
export interface ApplyMessage {
  type: "kalit:apply";
  username: string;
  password: string;
}

/** Overlay iframe → content script (window.postMessage). */
export type OverlayMessage =
  | { source: "kalit"; type: "resize"; height: number }
  | { source: "kalit"; type: "close" };
