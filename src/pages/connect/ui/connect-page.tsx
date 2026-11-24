import { Usb } from "lucide-react";
import { ConnectDevice } from "@/features/connect-device";
import { Screen } from "@/shared/ui/screen";

export function ConnectPage() {
  return (
    <Screen
      icon={Usb}
      title="Qurilmani ulang"
      description="Kalit qurilmasini USB orqali kompyuterga ulang. Parollaringiz faqat qurilmada saqlanadi."
    >
      <ConnectDevice />
    </Screen>
  );
}
