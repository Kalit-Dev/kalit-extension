import { Bluetooth, Loader2, Usb } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SerialTransport } from "@/device/serial-transport";
import type { TransportKind } from "@/device/transport";
import { forgetDevice } from "@/device/keys";
import { describeError, errorCode } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { Screen } from "../components/screen";

export function ConnectPage() {
  const connect = useDevice((s) => s.connect);
  const busy = useDevice((s) => s.phase === "connecting");
  const supported = SerialTransport.isSupported();

  const run = async (kind: TransportKind) => {
    try {
      await connect(kind);
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        // Side panel'da tanlash oynasi ochilmasligi mumkin: ruxsatni alohida tab'da olamiz.
        void chrome.tabs.create({ url: chrome.runtime.getURL("grant.html") });
        return;
      }
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
        <Button size="lg" disabled={!supported || busy} onClick={() => run("usb")}>
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

      <button
        type="button"
        disabled={busy}
        onClick={() => run("mock")}
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Qurilmasiz demo rejimda sinab ko'rish
      </button>
    </Screen>
  );
}
