import { Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { Screen } from "../components/screen";

export function PairPage() {
  const pair = useDevice((s) => s.pair);
  const disconnect = useDevice((s) => s.disconnect);
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
    <Screen
      icon={Link2}
      title="Bu kompyuterni ulang"
      description="Qurilma bu kompyuterni tanimaydi. Qurilma ekrani va shu yerda bir xil kod chiqadi — mos kelsa, qurilmadagi tugmani bosing."
    >
      <div className="grid gap-2">
        <Button size="lg" disabled={busy} onClick={start}>
          Ulashni boshlash
        </Button>
        <Button variant="ghost" onClick={() => void disconnect()}>
          Bekor qilish
        </Button>
      </div>
    </Screen>
  );
}
