import { z } from "zod";

/**
 * Kalit device protocol — v0.9 (docs/protocol-v0.9.md; v0.8 = v0.7 + eslatma, v0.9 = + TOTP)
 *
 * Transport: COBS kadrlari ichida Noise_XX shifrlangan CBOR. Bu fayl faqat mantiqiy xabarlarni
 * ta'riflaydi (SecureTransport ularni {i,c,p} / {i,ok,r|e} / {ev,d} ko'rinishida tashiydi):
 *   → { id, cmd, params }
 *   ← { id, ok: true, result } | { id, ok: false, error }
 *   ← { event, data? }            (so'rovsiz xabarlar)
 */

/** v0.7: qurilma sig'imi (firmware kMaxEntries). */
export const MAX_ENTRIES = 256;
/** v0.7: LIST bir sahifada ko'pi bilan shuncha yozuv qaytaradi (kamroq ham bo'lishi mumkin). */
export const LIST_PAGE_SIZE = 16;
/** v0.7: LIST sahifalash himoyasi (256 / 16 = 16 sahifa; zaxira bilan). */
export const LIST_MAX_PAGES = 64;

export const CONFIRM_TIMEOUT_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 8_000;
/** v0.11: pairing kodini solishtirish (PAIR_VERIFY) bosqichi: qurilma shuncha kutadi (undan keyin tugma bosqichi yo'q). */
export const PAIR_VERIFY_TIMEOUT_MS = 30_000;
/** v0.11: PAIR_VERIFY (kod tanlovi) shu firmware versiyasidan boshlab. */
export const PAIR_VERIFY_MIN_FIRMWARE: readonly [number, number, number] = [1, 3, 0];
/**
 * Firmware satrida (masalan "1.3.0", "mock-1.3.0") PAIR_VERIFY bormi. O'qib bo'lmaydigan versiya = yo'q
 * (fail-closed: eski firmware verify bosqichisiz tugma bilan pin qiladi).
 */
export function supportsPairVerify(firmware: string | undefined | null): boolean {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(firmware ?? "");
  if (!m) return false;
  const v = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (let i = 0; i < 3; i++) {
    if (v[i]! !== PAIR_VERIFY_MIN_FIRMWARE[i]) return v[i]! > PAIR_VERIFY_MIN_FIRMWARE[i]!;
  }
  return true;
}
/** v0.11: pairing kodi (SAS) — aynan 2 raqam (nol bilan to'ldirilgan, masalan "07"). */
export const PAIR_CODE_RE = /^\d{2}$/;
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

/** v0.8: maxfiy eslatma — UTF-8 bo'yicha ko'pi bilan 1024 bayt (firmware kMaxNote). */
export const NOTE_MAX_BYTES = 1024;
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
export const Note = z.string().refine((s) => utf8Bytes(s) <= NOTE_MAX_BYTES, { message: "note must be <= 1024 UTF-8 bytes" });

export const EntryMeta = z.object({
  id: z.string(),
  /** v0.4: "secret" yozuvlar veb-saytga bog'lanmagan; ularda `site` bo'sh ("") va `title` ko'rsatiladi. */
  kind: z.enum(["web", "secret"]).default("web"),
  site: z.string(),
  username: z.string(),
  title: z.string().optional(),
  updatedAt: z.number(),
  /** v0.8: yozuvda maxfiy eslatma bor. Matn LIST'da yo'q: faqat GET_NOTE (qurilmada tasdiq bilan). */
  hasNote: z.boolean().optional(),
  /** v0.9: yozuvda TOTP (2FA) urug'i bor. Urug'ning o'zi hech qachon qaytarilmaydi: faqat GET_TOTP (qurilmada tasdiq bilan). */
  hasTotp: z.boolean().optional(),
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

export const TotpCode = z.object({
  code: z.string().regex(/^\d{6}$/),
  /** Joriy 30 s qadamda qolgan soniyalar (1..30). */
  validFor: z.number().int().min(1).max(30),
  period: z.number().int().positive(),
});
export type TotpCode = z.infer<typeof TotpCode>;

export const ConfirmAction = z.enum(["pair", "fill", "save", "delete", "master", "update", "revoke", "reveal", "import", "export", "restore", "totp"]);
export type ConfirmAction = z.infer<typeof ConfirmAction>;

export const ConfirmInfo = z.object({
  action: ConfirmAction,
  site: z.string().optional(),
  username: z.string().optional(),
  code: z.string().optional(),
  /** v0.11: action "pair" uchun "verify" = kod solishtirish bosqichi (qurilma tugmasi o'chiq). 1.3.0 pair uchun faqat shuni yuboradi; phase'siz "pair" = eski firmware. */
  phase: z.literal("verify").optional(),
  timeoutMs: z.number().int().positive(),
});
export type ConfirmInfo = z.infer<typeof ConfirmInfo>;

/** v0.7: yozuvni yaratuvchi/o'zgartiruvchi so'rovlarga klient avtomatik qo'shadi (unix soniya) -> updatedAt. */
const Now = z.number().int().nonnegative().optional();

/** v0.9: TOTP urug'i (xom baytlar) — 10..64 bayt. UPDATE_ENTRY'da bo'sh Bytes = TOTP'ni o'chirish. Hech qachon log/saqlanmaydi. */
export const TOTP_SEED_MIN = 10;
export const TOTP_SEED_MAX = 64;
export const TOTP_PERIOD = 30;
const Bytes = z.custom<Uint8Array>((v) => v instanceof Uint8Array, "bytes expected");
const TotpSeed = Bytes.refine((b) => b.length >= TOTP_SEED_MIN && b.length <= TOTP_SEED_MAX, { message: "totp seed must be 10..64 bytes" });
const TotpSeedOrEmpty = Bytes.refine((b) => b.length === 0 || (b.length >= TOTP_SEED_MIN && b.length <= TOTP_SEED_MAX), {
  message: "totp seed must be 10..64 bytes (or empty to remove)",
});

/** v0.10: generator bayroqlari (`charset`). Standart (yo'q) = to'liq to'plam. */
export const CHARSET = { lower: 1, upper: 2, digit: 4, symbol: 8, all: 15 } as const;
export const GEN_MIN_FULL = 12;
export const GEN_MIN_CUSTOM = 4;
export const GEN_MAX = 64;
export const WORDS_MIN = 4;
export const WORDS_MAX = 10;
export const WORDS_DEFAULT = 6;

/**
 * v0.10 generator maydonlari (ADD_ENTRY). `words` (diceware) `charset`/`generateLength` bilan birga kelmaydi.
 * To'liq to'plamda uzunlik >= 12; boshqa to'plamlarda (PIN, simvolsiz...) >= 4. `password` berilsa generator e'tiborsiz.
 */
const generatorShape = {
  generateLength: z.number().int().min(GEN_MIN_CUSTOM).max(GEN_MAX).optional(),
  charset: z.number().int().min(1).max(CHARSET.all).optional(),
  words: z.number().int().min(WORDS_MIN).max(WORDS_MAX).optional(),
};
const checkGenerator = (p: { generateLength?: number; charset?: number; words?: number }, ctx: z.RefinementCtx) => {
  if (p.words !== undefined && (p.charset !== undefined || p.generateLength !== undefined)) {
    ctx.addIssue({ code: "custom", message: "words cannot be combined with charset/generateLength" });
  }
  if (p.generateLength !== undefined && p.generateLength < GEN_MIN_FULL && (p.charset === undefined || p.charset === CHARSET.all)) {
    ctx.addIssue({ code: "custom", message: "generateLength < 12 needs a reduced charset" });
  }
};

export const AddWebEntryParams = z.object({
  kind: z.literal("web").optional(),
  origin: z.string().max(2048),
  /** Registrable domain (extension tldts bilan hisoblaydi); qurilma uni origin host'ining suffiksi ekanini tekshiradi. */
  site: z.string().min(3).max(256),
  username: z.string().min(1).max(256),
  title: z.string().max(64).optional(),
  /** Bo'sh bo'lsa — parolni qurilma o'zi generatsiya qiladi (hardware RNG). */
  password: z.string().min(1).max(512).optional(),
  ...generatorShape,
  note: Note.optional(),
  totp: TotpSeed.optional(),
  now: Now,
}).superRefine(checkGenerator);
export type AddWebEntryParams = z.infer<typeof AddWebEntryParams>;

/** v0.4: veb-saytga bog'lanmagan sir. Parol yoki generator parametrlaridan biri majburiy. */
export const AddSecretEntryParams = z
  .object({
    kind: z.literal("secret"),
    title: z.string().min(1).max(64),
    username: z.string().max(256).optional(),
    password: z.string().min(1).max(512).optional(),
    ...generatorShape,
    note: Note.optional(),
    totp: TotpSeed.optional(),
    now: Now,
  })
  .superRefine(checkGenerator)
  .refine((p) => p.password !== undefined || p.generateLength !== undefined || p.charset !== undefined || p.words !== undefined, {
    message: "password or generator options required",
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
    /** "" = eslatmani o'chirish. */
    note: Note.optional(),
    /** v0.9: bo'sh Bytes = TOTP'ni o'chirish. */
    totp: TotpSeedOrEmpty.optional(),
    now: Now,
  })
  .refine((p) => p.title !== undefined || p.username !== undefined || p.password !== undefined || p.note !== undefined || p.totp !== undefined, {
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

/** v0.10: auditda bayroqlangan yozuv. */
export const AuditItem = z.object({ id: z.string(), duplicate: z.boolean(), weak: z.boolean() });
export type AuditItem = z.infer<typeof AuditItem>;
/** v0.10: to'liq audit hisoboti (DeviceClient.auditAll): sonlar butun vault bo'yicha, `items` faqat bayroqlangan yozuvlar. */
export interface AuditReport {
  total: number;
  duplicates: number;
  weak: number;
  items: AuditItem[];
}
/** v0.10: AUDIT_PASSWORDS sahifalash himoyasi (256 / 64 = 4 sahifa; zaxira bilan). */
export const AUDIT_MAX_PAGES = 16;

/** Buyruqlar ro'yxati — firmware bilan umumiy kontrakt. */
export const Commands = {
  // Host Noise static key orqali aniqlanadi (hostId yo'q).
  GET_STATUS: { params: Empty, result: Status, confirm: false },
  PAIR_HOST: { params: Empty, result: Empty, confirm: true },
  // v0.11: PAIR_HOST kutayotganda foydalanuvchining kod tanlovi. match=true -> darhol pin (tugmasiz), PAIR_HOST {};
  // match=false -> PAIR_HOST USER_REJECTED. Boshqa paytda INVALID_STATE. Javob darhol keladi (tasdiq bosqichi yo'q).
  PAIR_VERIFY: { params: z.object({ match: z.boolean() }), result: Empty, confirm: false },
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
  // v0.7: sahifalangan. `next` bor bo'lsa — keyingi sahifa, uni `cursor` sifatida qaytaring (DeviceClient.listAll).
  LIST: {
    params: z.object({ cursor: z.number().int().nonnegative().optional() }),
    result: z.object({ entries: z.array(EntryMeta), next: z.number().int().nonnegative().optional() }),
    confirm: false,
  },
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
  // v0.8: maxfiy eslatma matni (web va secret). Yozuvda eslatma yo'q bo'lsa -> INVALID_STATE (tasdiqsiz). Tasdiq: "reveal".
  GET_NOTE: { params: z.object({ id: z.string() }), result: z.object({ note: Note }), confirm: true },
  // v0.9: TOTP kodi (HMAC-SHA1, 30 s, 6 raqam). Qurilmada RTC yo'q: `now` ni klient qo'shadi. Tasdiq: "totp".
  // Xatolar: NOT_FOUND, LOCKED, ORIGIN_MISMATCH (origin berilgan, web yozuv mos emas), INVALID_STATE (TOTP yo'q yoki `now` rad etildi).
  GET_TOTP: {
    params: z.object({ id: z.string(), origin: z.string().max(2048).optional(), now: Now }),
    result: TotpCode,
    confirm: true,
  },
  // v0.10: parol sog'lig'i auditi. Takror va zaif parollar qurilmada aniqlanadi; hostga faqat sonlar va yozuv id'lari
  // bayroqlari chiqadi (ochiq parol ham, xesh ham emas). Tasdiq yo'q (LIST kabi). Sahifalanadi: `next` -> `cursor`
  // (DeviceClient.auditAll); `total/duplicates/weak` har sahifada butun vault bo'yicha.
  AUDIT_PASSWORDS: {
    params: z.object({ cursor: z.number().int().nonnegative().optional() }),
    result: z.object({
      total: z.number().int().nonnegative(),
      duplicates: z.number().int().nonnegative(),
      weak: z.number().int().nonnegative(),
      items: z.array(AuditItem),
      next: z.number().int().nonnegative().optional(),
    }),
    confirm: false,
  },
  // v0.5: bitta tasdiq bilan `count` tagacha ADD_ENTRY (tugmasiz). Sessiya 120 s, IMPORT_END, LOCK yoki uzilishda tugaydi.
  IMPORT_BEGIN: {
    params: z.object({ count: z.number().int().min(1).max(MAX_ENTRIES) }),
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
      count: z.number().int().min(1).max(MAX_ENTRIES),
    }),
    result: Empty,
    confirm: true,
  },
  RESTORE_ENTRY: {
    params: z.object({ index: z.number().int().nonnegative(), blob: Bytes, now: Now }),
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
