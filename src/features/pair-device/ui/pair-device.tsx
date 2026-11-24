import { useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { describeError } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";

/** Kompyuterni qurilmaga ulash: kod + tasdiqlash boshlash. */
export function PairDevice() {
  const pair = useDevice((s) => s.pair);
  const disconnect = useDevice((s) => s.disconnect);
  const code = useDevice((s) => s.pairingCode);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await pair();
      toast.success("Kompyuter ulandi");
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      {code && (
        <p className="rounded-lg border bg-muted py-3 text-center font-mono text-2xl tracking-[0.4em]" aria-label="Ulash kodi">
          {code}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={() => void disconnect()}>
          Bekor qilish
        </Button>
        <Button size="lg" disabled={busy} onClick={start}>
          Ulashni boshlash
        </Button>
      </div>
    </div>
  );
}
