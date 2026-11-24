import { Usb } from "lucide-react";
import { Link } from "react-router";
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
      <Link to="/firmware" className="text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Firmware yangilash
      </Link>
    </Screen>
  );
}
