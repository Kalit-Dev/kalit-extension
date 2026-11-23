import { z } from "zod";

/**
 * Kalit device protocol — PoC v0.1
 *
 * Transport: NDJSON (har bir frame = bitta JSON qator + "\n").
 *   → { id, cmd, params }
 *   ← { id, ok: true, result } | { id, ok: false, error }
 *   ← { event, data? }            (so'rovsiz xabarlar)
 *
 * TODO(v0.2): Noise_XX secure channel + CBOR. Hozircha USB kabel orqali ochiq JSON —
 * faqat development uchun.
 */

export const CONFIRM_TIMEOUT_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 8_000;

export const ErrorCode = z.enum([
  "USER_REJECTED",
  "TIMEOUT",
  "BUSY",
  "LOCKED",
  "BAD_PASSWORD",
  "WIPED",
  "NOT_FOUND",
  "ORIGIN_MISMATCH",
  "RATE_LIMITED",
  "NOT_TRUSTED",
  "INVALID_STATE",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const DeviceState = z.enum(["FACTORY", "LOCKED", "UNLOCKED"]);
export type DeviceState = z.infer<typeof DeviceState>;

export const EntryMeta = z.object({
  id: z.string(),
  site: z.string(),
  username: z.string(),
  title: z.string().optional(),
  updatedAt: z.number(),
});
export type EntryMeta = z.infer<typeof EntryMeta>;

export const Status = z.object({
  state: DeviceState,
  firmware: z.string(),
  hostTrusted: z.boolean(),
  attemptsLeft: z.number().int().nonnegative(),
});
export type Status = z.infer<typeof Status>;

export const Credential = z.object({ username: z.string(), password: z.string() });
export type Credential = z.infer<typeof Credential>;

export const ConfirmAction = z.enum(["pair", "fill", "save", "delete"]);
export type ConfirmAction = z.infer<typeof ConfirmAction>;

export const ConfirmInfo = z.object({
  action: ConfirmAction,
  site: z.string().optional(),
  username: z.string().optional(),
  code: z.string().optional(),
  timeoutMs: z.number().int().positive(),
});
export type ConfirmInfo = z.infer<typeof ConfirmInfo>;

export const AddEntryParams = z.object({
  origin: z.string().max(2048),
  username: z.string().min(1).max(256),
  title: z.string().max(64).optional(),
  /** Bo'sh bo'lsa — parolni qurilma o'zi generatsiya qiladi (hardware RNG). */
  password: z.string().min(1).max(512).optional(),
  generateLength: z.number().int().min(12).max(64).optional(),
});
export type AddEntryParams = z.infer<typeof AddEntryParams>;

const Empty = z.object({});

/** Buyruqlar ro'yxati — firmware bilan umumiy kontrakt. */
export const Commands = {
  // hostId — PoC uchun. v0.2'da host secure-channel static key orqali aniqlanadi.
  GET_STATUS: { params: z.object({ hostId: z.string() }), result: Status, confirm: false },
  PAIR_HOST: {
    params: z.object({ hostId: z.string(), hostName: z.string().max(64) }),
    result: Empty,
    confirm: true,
  },
  ONBOARD: {
    params: z.object({ masterPassword: z.string().min(12).max(128) }),
    result: Empty,
    confirm: false,
  },
  UNLOCK: {
    params: z.object({ masterPassword: z.string().min(1).max(128) }),
    result: Empty,
    confirm: false,
  },
  LOCK: { params: Empty, result: Empty, confirm: false },
  LIST: { params: Empty, result: z.object({ entries: z.array(EntryMeta) }), confirm: false },
  GET_CREDENTIAL: {
    params: z.object({ id: z.string(), origin: z.string() }),
    result: Credential,
    confirm: true,
  },
  ADD_ENTRY: { params: AddEntryParams, result: z.object({ entry: EntryMeta }), confirm: true },
  DELETE_ENTRY: { params: z.object({ id: z.string() }), result: Empty, confirm: true },
} as const;

export type CommandName = keyof typeof Commands;

export const WireResponse = z.union([
  z.object({ id: z.number().int(), ok: z.literal(true), result: z.unknown() }),
  z.object({ id: z.number().int(), ok: z.literal(false), error: ErrorCode.catch("INTERNAL") }),
]);

export const WireEvent = z.discriminatedUnion("event", [
  z.object({ event: z.literal("CONFIRM_PENDING"), data: ConfirmInfo }),
  z.object({ event: z.literal("CONFIRM_DONE") }),
  z.object({ event: z.literal("LOCKED") }),
]);
export type DeviceEvent = z.infer<typeof WireEvent>;
