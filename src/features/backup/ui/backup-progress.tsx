import { Loader2 } from "lucide-react";
import type { BackupProgress } from "@/shared/api/device/backup";
import { Progress } from "@/shared/ui/progress";

/** Qurilmada tasdiq kutilmoqda yoki x / y almashinuvi. */
export function BackupProgressView({ progress }: { progress: BackupProgress }) {
  const confirming = progress.stage === "confirm";
  return (
    <div className="grid gap-2" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {confirming ? "Qurilmada tasdiqlang" : `${progress.done} / ${progress.total}`}
      </p>
      {!confirming && <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />}
    </div>
  );
}
