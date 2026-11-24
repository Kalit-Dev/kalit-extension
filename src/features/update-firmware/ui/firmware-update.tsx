import { Loader2, PackageCheck, TriangleAlert } from "lucide-react";
import { useDevice } from "@/entities/device";
import { SerialTransport } from "@/shared/api/device/serial-transport";
import type { FlashProgress } from "@/shared/api/firmware/flash";
import { decideUpdate } from "@/shared/api/firmware/release";
import { isSigningKeyConfigured } from "@/shared/api/firmware/signing-key";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { useFirmware } from "../model/store";

const STAGE_TEXT: Record<FlashProgress["stage"], string> = {
  connecting: "Qurilma bootloader'iga ulanmoqda…",
  writing: "Firmware yozilmoqda…",
  resetting: "Qurilma qayta ishga tushmoqda…",
  done: "Tayyor",
};

/**
 * Firmware'ni brauzerdan yangilash (Web Serial + esptool-js). Tartib:
 *  1. Release yuklanadi va imzo + SHA-256 tekshiriladi (qurilmaga tegmasdan).
 *  2. Engine portni bo'shatadi, esptool-js ROM bootloader orqali yozadi; chip release'ga mos bo'lishi shart.
 *  3. Qurilma qayta ishga tushadi, engine qayta ulanadi.
 */
export function FirmwareUpdate({ flat, onDone }: { flat?: boolean; onDone?: () => void }) {
  const current = useDevice((s) => s.status?.firmware ?? null);
  const phase = useDevice((s) => s.phase);
  const { view, check, update, reset } = useFirmware();

  const supported = SerialTransport.isSupported();
  const keyOk = isSigningKeyConfigured();
  const busy = view.step === "checking" || view.step === "working";
  const decision = view.step === "ready" ? decideUpdate(current, view.release.version) : null;

  return (
    <Card className={cn(flat && "rounded-none border-0 shadow-none")}>
      <CardHeader>
        <CardIcon>
          <PackageCheck />
        </CardIcon>
        <div>
          <CardTitle>Firmware yangilash</CardTitle>
          <CardDescription>
            Yangi versiya GitHub'dan yuklanadi, imzosi va SHA-256 tekshiriladi, keyin USB orqali yoziladi. Yozuvlaringiz saqlanadi.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Qurilmadagi versiya</span>
          <span className="font-mono text-xs">{current ?? (phase === "disconnected" ? "ulanmagan" : "—")}</span>
        </div>

        {!supported && <Notice>Bu brauzer Web Serial'ni qo'llamaydi (Chrome/Edge kerak).</Notice>}
        {supported && !keyOk && (
          <Notice>Bu extension versiyasida imzo kaliti sozlanmagan, shuning uchun yangilash o'chirilgan.</Notice>
        )}

        {view.step === "ready" && decision && (
          <div className="grid gap-1 text-sm" role="status">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mavjud versiya</span>
              <span className="font-mono text-xs">{view.release.version}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {decision.kind === "update" && "Imzo va hash'lar tasdiqlandi. Yangilash mumkin."}
              {decision.kind === "same" && "Qurilmada shu versiya allaqachon bor. Zarur bo'lsa qayta yozish mumkin."}
              {decision.kind === "older" && "Release qurilmadagidan eski: eski versiyaga qaytarish rad etiladi."}
            </p>
          </div>
        )}

        {view.step === "working" && (
          <div className="grid gap-2" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {STAGE_TEXT[view.progress.stage]}
              {view.progress.chip && <span className="text-xs font-normal text-muted-foreground">{view.progress.chip}</span>}
            </p>
            <Progress value={view.progress.fraction * 100} />
            <p className="text-xs text-muted-foreground">Kabelni uzmang va bu oynani yopmang.</p>
          </div>
        )}

        {view.step === "done" && (
          <p role="status" className="text-sm">
            Firmware <b className="font-mono">{view.version}</b> yozildi.{" "}
            {view.reconnected
              ? "Qurilma qayta ulandi; u qulflangan: master parol bilan oching."
              : "Qurilma qayta ishga tushdi: USB orqali qayta ulang."}
          </p>
        )}

        {view.step === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {view.message}
          </p>
        )}

        {(view.step === "idle" || view.step === "error" || view.step === "checking") && (
          <p className="text-xs text-muted-foreground">
            Yangilashdan oldin Sozlamalar → Zaxira bo'limida zaxira nusxa olishni tavsiya qilamiz.
          </p>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {view.step === "done" ? (
          <Button onClick={() => (reset(), onDone?.())}>Davom etish</Button>
        ) : view.step === "ready" && decision && decision.kind !== "older" ? (
          <>
            <Button variant="outline" onClick={reset}>
              Bekor qilish
            </Button>
            <Button onClick={() => void update(view.release)}>
              {decision.kind === "same" ? "Qayta yozish" : `${view.release.version} ga yangilash`}
            </Button>
          </>
        ) : (
          <Button disabled={!supported || !keyOk || busy} onClick={() => void check()}>
            {view.step === "checking" && <Loader2 className="animate-spin" aria-hidden />}
            Yangilanishni tekshirish
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
