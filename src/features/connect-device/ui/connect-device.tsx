import { Loader2, Usb } from "lucide-react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { forgetDevice } from "@/shared/api/device/keys";
import { SerialTransport } from "@/shared/api/device/serial-transport";
import { describeError, errorCode } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";

/** USB orqali ulanish tugmasi (manager tab'ida: Chrome tanlash oynasi shu yerda ochiladi). */
export function ConnectDevice() {
  const connect = useDevice((s) => s.connect);
  const busy = useDevice((s) => s.phase === "connecting");
  const supported = SerialTransport.isSupported();

  const run = async () => {
    try {
      // Ruxsat berilgan port bo'lmasa — tanlash oynasi. Ruxsat extension origin'iga tegishli,
      // shuning uchun engine (offscreen) keyin shu portni getPorts() bilan ochadi.
      if (!(await SerialTransport.grantedPort())) {
        try {
          await SerialTransport.requestPort();
        } catch (e) {
          if (e instanceof DOMException && e.name === "NotFoundError") return; // foydalanuvchi bekor qildi
          throw e;
        }
      }
      await connect("usb");
    } catch (e) {
      toast.error("Ulanib bo'lmadi", {
        description: e instanceof DOMException ? e.message : describeError(e),
        action:
          errorCode(e) === "DEVICE_KEY_CHANGED"
            ? { label: "Qurilmani unutish", onClick: () => void forgetDevice() }
            : undefined,
      });
    }
  };

  return (
    <div className="grid gap-2">
      <Button size="lg" disabled={!supported || busy} onClick={run}>
        {busy ? <Loader2 className="animate-spin" /> : <Usb />}
        USB orqali ulash
      </Button>
      {!supported && <p className="text-xs text-destructive">Bu brauzer Web Serial API'ni qo'llab-quvvatlamaydi.</p>}
    </div>
  );
}
