import { useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { describeError } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";

const TIPS = [
  "So'zlarni qog'ozga, tartibi bilan yozing",
  "Hech qachon kompyuter yoki telefonga yozmang",
  "Xavfsiz, faqat o'zingiz biladigan joyda saqlang",
];

/** Recovery phrase eslatmasi va "yozib oldim" tasdig'i. */
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
        Yozib oldim
      </Button>
    </div>
  );
}
