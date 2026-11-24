import { ArchiveRestore } from "lucide-react";
import { Link } from "react-router";
import { isBackupStale, useLastBackup } from "../model/last-backup";

/** Parollar bor-u, zaxira yo'q yoki eskirgan bo'lsa: master parol tiklanmasligini eslatadi. */
export function BackupReminder() {
  const at = useLastBackup();
  if (at === undefined || !isBackupStale(at)) return null;
  return (
    <Link
      to="/settings/backup"
      className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm hover:bg-warning/15"
    >
      <ArchiveRestore className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span className="grid gap-0.5">
        <b>{at === null ? "Zaxira nusxa hali olinmagan" : "Zaxira nusxa eskirgan"}</b>
        <span className="text-muted-foreground">
          Master parol unutilsa qurilma tozalanadi va tiklab bo'lmaydi. Shifrlangan zaxira oling.
        </span>
      </span>
    </Link>
  );
}
