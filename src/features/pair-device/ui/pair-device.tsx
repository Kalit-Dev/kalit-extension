import { useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { describeError } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";
import { pairView } from "../model/pair-view";

/** Kompyuterni qurilmaga ulash: qurilma ekranidagi 2 xonali kodni tanlash (to'g'ri tanlovdan keyin tugma kerak emas). */
export function PairDevice() {
  const pair = useDevice((s) => s.pair);
  const disconnect = useDevice((s) => s.disconnect);
  const pairChoices = useDevice((s) => s.pairChoices);
  const pairState = useDevice((s) => s.pairState);
  const pairChoose = useDevice((s) => s.pairChoose);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(false);
  const pickedRef = useRef(false);

  const start = async () => {
    pickedRef.current = false;
    setPicked(false);
    setBusy(true);
    try {
      await pair();
      toast.success("Kompyuter ulandi");
    } catch (e) {
      // Mos kelmaganda doimiy ogohlantirish ko'rsatiladi (pastda); "Qurilmada rad etildi" toast'i chalg'itadi.
      if (useDevice.getState().pairState !== "mismatch") toast.error(describeError(e));
    } finally {
      setBusy(false);
      pickedRef.current = false;
      setPicked(false);
    }
  };

  const choose = (code: string | null) => {
    if (pickedRef.current) return;
    pickedRef.current = true;
    setPicked(true);
    void pairChoose(code);
  };

  // Moslikni engine hal qiladi; "Ulanmoqda…" faqat shu urinishda tanlov qilingan va engine ogohlantirmaganda.
  const view = pairView({ pairState, choices: pairChoices, picked });

  const cancel = (
    <Button variant="outline" onClick={() => void disconnect()}>
      Bekor qilish
    </Button>
  );

  const startButton = (label: string) => (
    <div className="grid grid-cols-2 gap-2">
      {cancel}
      <Button disabled={busy} onClick={start}>
        {label}
      </Button>
    </div>
  );

  if (view === "connecting") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Ulanmoqda…</p>
      </div>
    );
  }

  if (view === "mismatch") {
    return (
      <div className="grid gap-3">
        <div
          role="alert"
          className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="grid gap-1">
            <p className="text-sm font-medium">Kod mos kelmadi.</p>
            <p>
              Ulanish rad etildi. Kimdir ulanishga aralashayotgan bo&apos;lishi mumkin: kabel va kompyuterni tekshirib,
              qayta urinib ko&apos;ring. Agar qurilma ekranida baribir &quot;Ulandi&quot; chiqqan bo&apos;lsa, bu begona
              ulanish belgisi — kirgandan keyin uni ulangan kompyuterlar ro&apos;yxatidan o&apos;chiring.
            </p>
          </div>
        </div>
        {startButton("Qayta urinish")}
      </div>
    );
  }

  if (view === "choosing" && pairChoices) {
    return (
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          {pairChoices.map((code) => (
            <button
              key={code}
              type="button"
              aria-label={`Kod ${code}`}
              disabled={picked}
              onClick={() => choose(code)}
              className="h-16 rounded-lg border bg-background font-mono text-3xl tabular-nums tracking-widest shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
            >
              {code}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/40"
            disabled={picked}
            onClick={() => choose(null)}
          >
            Hech biri mos emas
          </Button>
          {cancel}
        </div>
      </div>
    );
  }

  return <div className="grid gap-2">{startButton("Ulashni boshlash")}</div>;
}
