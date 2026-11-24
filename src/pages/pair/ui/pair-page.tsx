import { Link2 } from "lucide-react";
import { PairDevice } from "@/features/pair-device";
import { Screen } from "@/shared/ui/screen";

export function PairPage() {
  return (
    <Screen
      icon={Link2}
      title="Bu kompyuterni ulang"
      description="Qurilma bu kompyuterni tanimaydi. Pastdagi kod qurilmada ham chiqadi (ekran yoki serial log) — mos kelsa, qurilmadagi tugmani bosing."
    >
      <PairDevice />
    </Screen>
  );
}
