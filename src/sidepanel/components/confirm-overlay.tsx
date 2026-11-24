import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ConfirmAction } from "@/device/protocol";
import { useCountdown } from "@/hooks/use-countdown";
import { useDevice } from "@/store/device-store";

const TITLES: Record<ConfirmAction, string> = {
  pair: "Kompyuterni ulash",
  fill: "Parolni berish",
  save: "Parolni saqlash",
  delete: "Yozuvni o'chirish",
  master: "Master parolni almashtirish",
  update: "Yozuvni yangilash",
  revoke: "Hostni bekor qilish",
};

/** Qurilma tugma bosilishini kutayotganda butun panel ustida ko'rinadi. */
export function ConfirmOverlay({ centered = false }: { centered?: boolean }) {
  const pending = useDevice((s) => s.pending);
  const kind = useDevice((s) => s.kind);
  const press = useDevice((s) => s.press);
  const remaining = useCountdown(pending?.expiresAt);

  if (!pending) return null;
  const progress = (remaining / pending.timeoutMs) * 100;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className={`fixed inset-0 z-50 flex bg-background/70 backdrop-blur-sm animate-in fade-in-0 ${centered ? "items-center justify-center" : "items-end"}`}
    >
      <div className={`m-3 grid w-full gap-4 ${centered ? "max-w-md" : ""}  rounded-xl border bg-card p-5 shadow-lg animate-in slide-in-from-bottom-4 duration-300`}>
        <div className="flex items-center gap-3">
          <span className="relative grid size-10 place-items-center rounded-full bg-primary/10">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
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

        {kind === "mock" && (
          <div className="grid grid-cols-2 gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => press("long")}>
              Rad etish
            </Button>
            <Button onClick={() => press("short")}>Tasdiqlash</Button>
            <p className="col-span-2 text-center text-[11px] text-muted-foreground">
              Demo rejim: qurilma tugmasi simulyatsiyasi
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
