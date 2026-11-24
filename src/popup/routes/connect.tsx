import { Bluetooth, Loader2, Usb } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SerialTransport } from "@/device/serial-transport";
import { forgetDevice } from "@/device/keys";
import { describeError, errorCode } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { Screen } from "../components/screen";

export function ConnectPage() {
  const connect = useDevice((s) => s.connect);
  const busy = useDevice((s) => s.phase === "connecting");
  const supported = SerialTransport.isSupported();

  const run = async () => {
    try {
      // Ruxsat berilgan port bor bo'lsa — jim ulanamiz. Yo'q bo'lsa — faqat shunda ruxsat tab'i ochiladi
      // (popup'da tanlash oynasi chiqmaydi).
      if (!(await SerialTransport.fromGranted())) {
        void chrome.tabs.create({ url: chrome.runtime.getURL("grant.html") });
        return;
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
    <Screen
      icon={Usb}
      title="Qurilmani ulang"
      description="Kalit qurilmasini USB orqali kompyuterga ulang. Parollaringiz faqat qurilmada saqlanadi."
    >
      <div className="grid gap-2">
        <Button size="lg" disabled={!supported || busy} onClick={run}>
          {busy ? <Loader2 className="animate-spin" /> : <Usb />}
          USB orqali ulash
        </Button>
        <Button size="lg" variant="outline" disabled>
          <Bluetooth />
          Bluetooth
          <Badge variant="secondary" className="ml-auto">
            Tez kunda
          </Badge>
        </Button>
        {!supported && (
          <p className="text-xs text-destructive">Bu brauzer Web Serial API'ni qo'llab-quvvatlamaydi.</p>
        )}
      </div>
    </Screen>
  );
}
