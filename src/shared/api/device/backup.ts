import { z } from "zod";
import { DeviceError } from "./client";
import { BackupPassphrase } from "./protocol";

/**
 * v0.6 shifrlangan zaxira: fayl formati (extension egasi) va eksport/tiklash oqimi.
 * Kripto to'liq qurilmada; bu yerda faqat shaffof (opaque) base64 blob'lar. Parol ochiq matn bu fayllarda yo'q.
 */

export const BACKUP_FORMAT = "kalit-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_KDF = "pbkdf2-hmac-sha256";
export const BACKUP_MAX_FILE_BYTES = 256 * 1024;
export const BACKUP_MAX_RECORD_CHARS = 4096; // base64 belgi; bitta yozuv (≤ ~1 KiB ochiq matn) + AEAD qo'shimchasi
export const BACKUP_MIN_ITER = 100_000;
export const BACKUP_MAX_ITER = 1_000_000;
export const BACKUP_MAX_ENTRIES = 32;

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const b64 = (max: number) => z.string().min(1).max(max).regex(B64);

export const BackupFileSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    kdf: z.literal(BACKUP_KDF),
    iter: z.number().int().min(BACKUP_MIN_ITER).max(BACKUP_MAX_ITER),
    salt: z.string().max(24).refine((s) => B64.test(s) && base64ToBytes(s).length === 16),
    count: z.number().int().min(1).max(BACKUP_MAX_ENTRIES),
    records: z.array(b64(BACKUP_MAX_RECORD_CHARS)).min(1).max(BACKUP_MAX_ENTRIES),
    createdAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))),
  })
  .strict()
  .refine((f) => f.records.length === f.count, { message: "count != records.length", path: ["count"] });
export type BackupFile = z.infer<typeof BackupFileSchema>;

export class BackupFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupFileError";
  }
}

/** Fayl matnini tekshiradi. Qurilmaga hech narsa yuborilmasdan oldin chaqiriladi. Xato matnlari o'zbekcha. */
export function parseBackupFile(text: string): BackupFile {
  if (text.length > BACKUP_MAX_FILE_BYTES) throw new BackupFileError("Fayl juda katta — bu Kalit zaxira fayli emas");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFileError("Bu Kalit zaxira fayli emas (JSON o'qilmadi)");
  }
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    throw new BackupFileError("Bu Kalit zaxira fayli emas");
  }
  if ((raw as { version?: unknown }).version !== BACKUP_VERSION) {
    throw new BackupFileError("Zaxira fayli versiyasi qo'llab-quvvatlanmaydi");
  }
  const parsed = BackupFileSchema.safeParse(raw);
  if (!parsed.success) throw new BackupFileError("Zaxira fayli buzilgan yoki noto'g'ri tuzilgan");
  return parsed.data;
}

export const backupFileName = (d = new Date()) => `kalit-backup-${d.toISOString().slice(0, 10)}.kalit`;

export const serializeBackup = (file: BackupFile) => JSON.stringify(file);

/** Parol UTF-8 bo'yicha 10..128 bayt (qurilma ham shuni talab qiladi). Parol hech qachon xato matniga tushmaydi. */
export const isValidBackupPassphrase = (s: string) => BackupPassphrase.safeParse(s).success;

export interface BackupProgress {
  /** "confirm": qurilmada tasdiq kutilmoqda (+PBKDF2); "transfer": blob'lar almashilmoqda. */
  stage: "confirm" | "transfer";
  done: number;
  total: number;
}

/** Engine operatsiyalari (base64 satrlari bilan; chrome.runtime JSON'da Uint8Array yashamaydi). */
export interface BackupDeviceApi {
  exportBegin(passphrase: string): Promise<{ count: number; salt: string; iter: number }>;
  exportGet(index: number): Promise<string>;
  exportEnd(): Promise<void>;
  restoreBegin(passphrase: string, salt: string, iter: number, count: number): Promise<void>;
  restoreEntry(index: number, blob: string): Promise<"added" | "duplicate">;
  restoreEnd(): Promise<{ added: number; skipped: number }>;
}

function checkPassphrase(passphrase: string) {
  if (!isValidBackupPassphrase(passphrase)) throw new DeviceError("INVALID_STATE");
}

export async function runExport(
  api: Pick<BackupDeviceApi, "exportBegin" | "exportGet" | "exportEnd">,
  passphrase: string,
  onProgress?: (p: BackupProgress) => void,
): Promise<BackupFile> {
  checkPassphrase(passphrase);
  try {
    onProgress?.({ stage: "confirm", done: 0, total: 0 });
    const { count, salt, iter } = await api.exportBegin(passphrase);
    if (count < 1 || count > BACKUP_MAX_ENTRIES) throw new DeviceError("PROTOCOL");
    const records: string[] = [];
    onProgress?.({ stage: "transfer", done: 0, total: count });
    for (let i = 0; i < count; i++) {
      records.push(await api.exportGet(i));
      onProgress?.({ stage: "transfer", done: i + 1, total: count });
    }
    const file = { format: BACKUP_FORMAT, version: BACKUP_VERSION, kdf: BACKUP_KDF, iter, salt, count, records, createdAt: new Date().toISOString() };
    const check = BackupFileSchema.safeParse(file);
    if (!check.success) throw new DeviceError("PROTOCOL");
    return check.data;
  } finally {
    await api.exportEnd().catch(() => undefined);
  }
}

export async function runRestore(
  api: Pick<BackupDeviceApi, "restoreBegin" | "restoreEntry" | "restoreEnd">,
  file: BackupFile,
  passphrase: string,
  onProgress?: (p: BackupProgress) => void,
): Promise<{ added: number; skipped: number }> {
  checkPassphrase(passphrase);
  const checked = BackupFileSchema.safeParse(file);
  if (!checked.success) throw new BackupFileError("Zaxira fayli buzilgan yoki noto'g'ri tuzilgan");
  const tally = { added: 0, skipped: 0 };
  try {
    onProgress?.({ stage: "confirm", done: 0, total: 0 });
    await api.restoreBegin(passphrase, file.salt, file.iter, file.count);
    onProgress?.({ stage: "transfer", done: 0, total: file.count });
    // Birinchi xato (BAD_PASSWORD, INVALID_STATE, uzilish...) oqimni to'xtatadi.
    for (let i = 0; i < file.count; i++) {
      const r = await api.restoreEntry(i, file.records[i]!);
      if (r === "added") tally.added++;
      else tally.skipped++;
      onProgress?.({ stage: "transfer", done: i + 1, total: file.count });
    }
  } finally {
    // Oxirgi yozuvdan keyin qurilma sessiyani o'zi yopadi: RESTORE_END faqat tozalash, jami hisob yozuvlardan olinadi.
    await api.restoreEnd().catch(() => undefined);
  }
  return tally;
}
