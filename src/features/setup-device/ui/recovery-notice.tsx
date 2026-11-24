import { useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { describeError } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";

const TIPS = [
  "Master parolni qog'ozga yozib, xavfsiz joyda saqlang",
  "Uzun va takrorlanmaydigan parol tanlang (5-6 ta tasodifiy so'z)",
  "Qurilmani ochgach, Sozlamalar → Zaxira orqali shifrlangan nusxa oling",
];

/** Master parol eslatmasi va tasdig'i (qurilmada recovery phrase yo'q). */
export function RecoveryNotice() {
  const refresh = useDevice((s) => s.refresh);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
        {TIPS.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/60" />
            {t}
          </li>
        ))}
      </ul>
      <Button
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refresh().catch((e: unknown) => toast.error(describeError(e)));
          setBusy(false);
        }}
      >
        Tushundim
      </Button>
    </div>
  );
}
