import { Fingerprint } from "lucide-react";
import { Progress } from "@/shared/ui/progress";
import type { ConfirmAction } from "@/shared/api/device/protocol";
import { useCountdown } from "@/shared/lib/hooks/use-countdown";
import { useDevice } from "../model/store";

const TITLES: Record<ConfirmAction, string> = {
  pair: "Kompyuterni ulash",
  fill: "Parolni berish",
  save: "Parolni saqlash",
  delete: "Yozuvni o'chirish",
  master: "Master parolni almashtirish",
  update: "Yozuvni yangilash",
  revoke: "Hostni bekor qilish",
  reveal: "Maxfiy parolni ko'rsatish",
  import: "Importni tasdiqlash",
};

/** Qurilma tugma bosilishini kutayotganda butun panel ustida ko'rinadi. */
export function ConfirmOverlay({ centered = false }: { centered?: boolean }) {
  const pending = useDevice((s) => s.pending);
  const remaining = useCountdown(pending?.expiresAt);

  if (!pending) return null;
  const progress = (remaining / pending.timeoutMs) * 100;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className={`fixed inset-0 z-50 flex bg-background/70 backdrop-blur-sm ${centered ? "items-center justify-center" : "items-end"}`}
    >
      <div className={`m-3 grid w-full gap-4 ${centered ? "max-w-md" : ""} rounded-xl border bg-card p-5 shadow-lg`}>
        <div className="flex items-center gap-3">
          <span className="relative grid size-10 place-items-center rounded-full bg-primary/10">
            <span className="absolute inset-0 rounded-full bg-primary/10" />
            <Fingerprint className="size-5" />
          </span>
          <div className="grid">
            <p className="text-sm font-medium">{TITLES[pending.action]}</p>
            <p className="text-xs text-muted-foreground">Qurilmada tasdiqlang</p>
          </div>
        </div>

        {pending.code ? (
          <div className="grid gap-1 rounded-lg bg-muted py-3 text-center">
            <span className="font-mono text-3xl font-semibold tracking-[0.35em]">{pending.code}</span>
            <span className="text-xs text-muted-foreground">Qurilma ekranidagi kod bilan solishtiring</span>
          </div>
        ) : (
          <div className="grid gap-0.5 rounded-lg bg-muted px-3 py-2.5">
            <span className="truncate text-sm font-medium">{pending.site}</span>
            <span className="truncate text-xs text-muted-foreground">{pending.username}</span>
          </div>
        )}

        <div className="grid gap-2">
          <Progress value={progress} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Bosing — tasdiqlash · 3 s ushlang — rad etish</span>
            <span className="tabular-nums">{Math.ceil(remaining / 1000)} s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
