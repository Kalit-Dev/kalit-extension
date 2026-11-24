import { useEffect, useState } from "react";
import { kvGet, kvSet, type KvKey } from "@/shared/lib/kv";

/** Zaxira shuncha kundan eski bo'lsa eslatma ko'rsatiladi. */
export const BACKUP_STALE_DAYS = 30;
/** Eslatma yopilsa, shuncha kundan keyin yana ko'rsatiladi (xavf haqiqiy: zaxirasiz master parol unutilsa hammasi yo'qoladi). */
export const BACKUP_SNOOZE_DAYS = 7;

const DAY = 86_400_000;

export async function markBackupDone(now = Date.now()): Promise<void> {
  await kvSet("lastBackupAt", now);
}

/** Eslatmani vaqtincha yopadi. */
export async function snoozeBackupReminder(now = Date.now()): Promise<void> {
  await kvSet("backupReminderSnoozedAt", now);
}

/** undefined = hali o'qilmagan; null = saqlanmagan. */
function useStoredNumber(key: KvKey): number | null | undefined {
  const [value, setValue] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    kvGet(key)
      .then((v) => alive && setValue(typeof v === "number" ? v : null))
      .catch(() => alive && setValue(undefined));
    return () => {
      alive = false;
    };
  }, [key]);
  return value;
}

/** undefined = hali o'qilmagan; null = zaxira hech qachon olinmagan. */
export const useLastBackup = () => useStoredNumber("lastBackupAt");

/** undefined = hali o'qilmagan; null = eslatma hech yopilmagan. */
export const useReminderSnoozedAt = () => useStoredNumber("backupReminderSnoozedAt");

export const isBackupStale = (at: number | null, now = Date.now()) => at === null || now - at > BACKUP_STALE_DAYS * DAY;

export const isReminderSnoozed = (snoozedAt: number | null, now = Date.now()) =>
  snoozedAt !== null && now - snoozedAt < BACKUP_SNOOZE_DAYS * DAY;
