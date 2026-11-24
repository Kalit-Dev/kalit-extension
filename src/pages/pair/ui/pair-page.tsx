import { Link2 } from "lucide-react";
import { PairDevice } from "@/features/pair-device";
import { Screen } from "@/shared/ui/screen";

export function PairPage() {
  return (
    <Screen
      icon={Link2}
      title="Bu kompyuterni ulang"
      description="Qurilma ekranidagi kod bilan bir xil bo'lganini tanlang."
    >
      <PairDevice />
    </Screen>
  );
}
