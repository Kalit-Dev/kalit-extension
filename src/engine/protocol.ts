import type { ConfirmInfo, EntryMeta, Status } from "@/device/protocol";
import type { TransportKind } from "@/device/transport";

/**
 * Engine (offscreen hujjat) <-> side panel shartnomasi.
 * Engine qurilma ulanishi, Noise sessiyasi va hub'ning egasi; side panel faqat UI.
 */
export type Phase = "disconnected" | "connecting" | "pairing" | "factory" | "locked" | "unlocked";

export interface PendingConfirm extends ConfirmInfo {
  expiresAt: number;
}

/** Side panel ko'zgusi: faqat serializatsiya qilinadigan holat (parollar yo'q). */
export interface EngineSnapshot {
  kind: TransportKind | null;
  phase: Phase;
  status: Status | null;
  entries: EntryMeta[];
  pending: PendingConfirm | null;
  pairingCode: string | null;
}

export const ENGINE_OPS = [
  "getState",
  "connect",
  "disconnect",
  "refresh",
  "pair",
  "onboard",
  "unlock",
  "lock",
  "lockIfUnlocked",
  "getCredential",
  "addEntry",
  "deleteEntry",
  "forgetDevice",
  "press",
] as const;
export type EngineOp = (typeof ENGINE_OPS)[number];

export interface EngineRequest {
  target: "engine";
  op: EngineOp;
  args: unknown[];
}

export type EngineReply =
  | { ok: true; value: unknown; state: EngineSnapshot }
  | { ok: false; code: string; state: EngineSnapshot };

export const STATE_EVENT = "engine:state";
export interface StateEvent {
  type: typeof STATE_EVENT;
  state: EngineSnapshot;
}

export const isEngineRequest = (m: unknown): m is EngineRequest =>
  typeof m === "object" &&
  m !== null &&
  (m as EngineRequest).target === "engine" &&
  (ENGINE_OPS as readonly string[]).includes((m as EngineRequest).op) &&
  Array.isArray((m as EngineRequest).args);

/** extension sahifasi -> background */
export type BackgroundRequest =
  | { type: "bg:ensure-engine" }
  | { type: "bg:apply"; tabId: number; username: string; password: string };

/** background -> engine */
export interface TabRemovedEvent {
  type: "bg:tab-removed";
  tabId: number;
}

/** grant.html -> engine */
export const PORT_GRANTED = "KALIT_PORT_GRANTED";
