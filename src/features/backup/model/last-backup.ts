import { useEffect, useState } from "react";
import { kvGet, kvSet } from "@/shared/lib/kv";

/** Zaxira shuncha kundan eski bo'lsa eslatma ko'rsatiladi. */
export const BACKUP_STALE_DAYS = 30;

export async function markBackupDone(now = Date.now()): Promise<void> {
  await kvSet("lastBackupAt", now);
}

/** undefined = hali o'qilmagan; null = zaxira hech qachon olinmagan. */
export function useLastBackup(): number | null | undefined {
  const [at, setAt] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    kvGet("lastBackupAt")
      .then((v) => alive && setAt(typeof v === "number" ? v : null))
      .catch(() => alive && setAt(undefined));
    return () => {
      alive = false;
    };
  }, []);
  return at;
}

export const isBackupStale = (at: number | null, now = Date.now()) =>
  at === null || now - at > BACKUP_STALE_DAYS * 86_400_000;
