import { z } from "zod";

/**
 * Kalit device protocol — v0.5 (docs/protocol-v0.5.md, delta: v0.4 ustiga)
 *
 * Transport: COBS kadrlari ichida Noise_XX shifrlangan CBOR. Bu fayl faqat mantiqiy xabarlarni
 * ta'riflaydi (SecureTransport ularni {i,c,p} / {i,ok,r|e} / {ev,d} ko'rinishida tashiydi):
 *   → { id, cmd, params }
 *   ← { id, ok: true, result } | { id, ok: false, error }
 *   ← { event, data? }            (so'rovsiz xabarlar)
 */

export const CONFIRM_TIMEOUT_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 8_000;
/** v0.6: *_BEGIN tasdiqdan keyin qurilma PBKDF2 hisoblaydi (ESP32'da ~1-3 s; zaxira bilan 30 s). */
export const BACKUP_KDF_TIMEOUT_MS = 30_000;
/** UNLOCK/ONBOARD: qurilmada PBKDF2 (ESP32'da soniyalar) — oddiy timeout yetmaydi. */
export const KDF_TIMEOUT_MS = 30_000;

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
  "DEVICE_KEY_CHANGED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const DeviceState = z.enum(["FACTORY", "LOCKED", "UNLOCKED"]);
export type DeviceState = z.infer<typeof DeviceState>;

export const EntryMeta = z.object({
  id: z.string(),
  /** v0.4: "secret" yozuvlar veb-saytga bog'lanmagan; ularda `site` bo'sh ("") va `title` ko'rsatiladi. */
  kind: z.enum(["web", "secret"]).default("web"),
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

export const ConfirmAction = z.enum(["pair", "fill", "save", "delete", "master", "update", "revoke", "reveal", "import", "export", "restore"]);
export type ConfirmAction = z.infer<typeof ConfirmAction>;

export const ConfirmInfo = z.object({
  action: ConfirmAction,
  site: z.string().optional(),
  username: z.string().optional(),
  code: z.string().optional(),
  timeoutMs: z.number().int().positive(),
});
export type ConfirmInfo = z.infer<typeof ConfirmInfo>;

export const AddWebEntryParams = z.object({
  kind: z.literal("web").optional(),
  origin: z.string().max(2048),
  /** Registrable domain (extension tldts bilan hisoblaydi); qurilma uni origin host'ining suffiksi ekanini tekshiradi. */
  site: z.string().min(3).max(256),
  username: z.string().min(1).max(256),
  title: z.string().max(64).optional(),
  /** Bo'sh bo'lsa — parolni qurilma o'zi generatsiya qiladi (hardware RNG). */
  password: z.string().min(1).max(512).optional(),
  generateLength: z.number().int().min(12).max(64).optional(),
});
export type AddWebEntryParams = z.infer<typeof AddWebEntryParams>;

/** v0.4: veb-saytga bog'lanmagan sir. Parol yoki generateLength'dan biri majburiy. */
export const AddSecretEntryParams = z
  .object({
    kind: z.literal("secret"),
    title: z.string().min(1).max(64),
    username: z.string().max(256).optional(),
    password: z.string().min(1).max(512).optional(),
    generateLength: z.number().int().min(12).max(64).optional(),
  })
  .refine((p) => p.password !== undefined || p.generateLength !== undefined, {
    message: "password or generateLength required",
  });
export type AddSecretEntryParams = z.infer<typeof AddSecretEntryParams>;

export const AddEntryParams = z.union([AddSecretEntryParams, AddWebEntryParams]);
export type AddEntryParams = z.infer<typeof AddEntryParams>;

export const UpdateEntryParams = z
  .object({
    id: z.string(),
    title: z.string().max(64).optional(),
    username: z.string().min(1).max(256).optional(),
    password: z.string().min(1).max(512).optional(),
  })
  .refine((p) => p.title !== undefined || p.username !== undefined || p.password !== undefined, {
    message: "at least one field",
  });
export type UpdateEntryParams = z.infer<typeof UpdateEntryParams>;

export const HostInfo = z.object({
  slot: z.number().int().min(0).max(3),
  /** Host static key SHA-256'ining birinchi 8 bayti (16 hex belgi). */
  fp: z.string().regex(/^[0-9a-f]{16}$/),
  current: z.boolean(),
});
export type HostInfo = z.infer<typeof HostInfo>;

const Empty = z.object({});

const utf8Len = (s: string) => new TextEncoder().encode(s).length;
/** v0.6: zaxira paroli — UTF-8 bo'yicha 10..128 bayt. */
export const BackupPassphrase = z
  .string()
  .refine((s) => utf8Len(s) >= 10 && utf8Len(s) <= 128, { message: "passphrase must be 10..128 UTF-8 bytes" });
const Bytes = z.custom<Uint8Array>((v) => v instanceof Uint8Array, "bytes expected");

/** Buyruqlar ro'yxati — firmware bilan umumiy kontrakt. */
export const Commands = {
  // Host Noise static key orqali aniqlanadi (hostId yo'q).
  GET_STATUS: { params: Empty, result: Status, confirm: false },
  PAIR_HOST: { params: Empty, result: Empty, confirm: true },
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
  // v0.3
  CHANGE_MASTER: {
    params: z.object({ oldPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }),
    result: Empty,
    confirm: true,
  },
  UPDATE_ENTRY: { params: UpdateEntryParams, result: z.object({ entry: EntryMeta }), confirm: true },
  LIST_HOSTS: { params: Empty, result: z.object({ hosts: z.array(HostInfo) }), confirm: false },
  REVOKE_HOST: { params: z.object({ slot: z.number().int().min(0).max(3) }), result: Empty, confirm: true },
  // v0.4: faqat "secret" yozuvlar uchun (web -> INVALID_STATE, noma'lum id -> NOT_FOUND).
  REVEAL_SECRET: { params: z.object({ id: z.string() }), result: Credential, confirm: true },
  // v0.5: bitta tasdiq bilan `count` tagacha ADD_ENTRY (tugmasiz). Sessiya 120 s, IMPORT_END, LOCK yoki uzilishda tugaydi.
  IMPORT_BEGIN: {
    params: z.object({ count: z.number().int().min(1).max(32) }),
    result: Empty,
    confirm: true,
  },
  /** Idempotent: sessiya bo'lmasa ham {added: 0}. Tasdiq talab qilinmaydi. */
  IMPORT_END: { params: Empty, result: z.object({ added: z.number().int().nonnegative() }), confirm: false },
  // v0.6: shifrlangan zaxira. Kripto to'liq qurilmada; extension faqat shaffof (opaque) blob'larni tashiydi.
  EXPORT_BEGIN: {
    params: z.object({ passphrase: BackupPassphrase }),
    result: z.object({ count: z.number().int().nonnegative(), salt: Bytes.refine((b) => b.length === 16), iter: z.number().int().positive() }),
    confirm: true,
  },
  EXPORT_GET: { params: z.object({ index: z.number().int().nonnegative() }), result: z.object({ blob: Bytes }), confirm: false },
  /** Idempotent: istalgan paytda xavfsiz (finally'da chaqiring). */
  EXPORT_END: { params: Empty, result: Empty, confirm: false },
  RESTORE_BEGIN: {
    params: z.object({
      passphrase: BackupPassphrase,
      salt: Bytes.refine((b) => b.length === 16),
      iter: z.number().int().min(100_000).max(1_000_000),
      count: z.number().int().min(1).max(32),
    }),
    result: Empty,
    confirm: true,
  },
  RESTORE_ENTRY: {
    params: z.object({ index: z.number().int().nonnegative(), blob: Bytes }),
    result: z.object({ result: z.enum(["added", "duplicate"]) }),
    confirm: false,
  },
  /** Idempotent: sessiya bo'lmasa ham {added: 0, skipped: 0}. */
  RESTORE_END: {
    params: Empty,
    result: z.object({ added: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }),
    confirm: false,
  },
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
