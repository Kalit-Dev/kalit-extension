import { Fingerprint } from "lucide-react";
import { Progress } from "@/shared/ui/progress";
import { CONFIRM_TIMEOUT_MS } from "@/shared/api/device/protocol";
import { useCountdown } from "@/shared/lib/hooks/use-countdown";

/** Overlay ichida: "qurilmada tasdiqlang" holati, 10 s teskari sanoq bilan. */
export function ConfirmWait({ subtitle, expiresAt }: { subtitle: string; expiresAt: number }) {
  const remaining = useCountdown(expiresAt);
  return (
    <div className="grid gap-3 p-3">
      <div className="flex items-center gap-3">
        <span className="relative grid size-8 place-items-center rounded-full bg-primary/10">
          <span className="absolute inset-0 rounded-full bg-primary/10" />
          <Fingerprint className="size-4" />
        </span>
        <div className="grid min-w-0">
          <span className="text-sm font-medium">Qurilmada tasdiqlang</span>
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        </div>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{Math.ceil(remaining / 1000)} s</span>
      </div>
      <Progress value={(remaining / CONFIRM_TIMEOUT_MS) * 100} />
    </div>
  );
}
