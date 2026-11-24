import { ArchiveRestore, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
  isBackupStale,
  isReminderSnoozed,
  snoozeBackupReminder,
  useLastBackup,
  useReminderSnoozedAt,
} from "../model/last-backup";

/** Parollar bor-u, zaxira yo'q yoki eskirgan bo'lsa: master parol tiklanmasligini eslatadi. Yopilsa 7 kunga yashirinadi. */
export function BackupReminder() {
  const at = useLastBackup();
  const snoozedAt = useReminderSnoozedAt();
  const [closed, setClosed] = useState(false);
  if (closed || at === undefined || snoozedAt === undefined || !isBackupStale(at) || isReminderSnoozed(snoozedAt)) return null;

  const close = () => {
    setClosed(true); // darhol yashiramiz; saqlash orqada
    void snoozeBackupReminder().catch(() => undefined);
  };

  return (
    <div className="relative mb-4 rounded-lg border border-warning/40 bg-warning/10 text-sm transition-colors hover:bg-warning/15">
      <Link to="/settings/backup" className="flex items-start gap-3 rounded-lg p-4 pr-12 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ArchiveRestore className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span className="grid gap-0.5">
          <b>{at === null ? "Zaxira nusxa hali olinmagan" : "Zaxira nusxa eskirgan"}</b>
          <span className="text-muted-foreground">
            Master parol unutilsa qurilma tozalanadi va tiklab bo'lmaydi. Shifrlangan zaxira oling.
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={close}
        aria-label="Eslatmani yopish"
        title="7 kunga yopish"
        className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-warning/20 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
