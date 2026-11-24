import { ScrollText, ShieldCheck } from "lucide-react";
import { RecoveryNotice, SetupForm } from "@/features/setup-device";
import { Screen } from "@/shared/ui/screen";

export function SetupPage() {
  return (
    <Screen
      icon={ShieldCheck}
      title="Master parol yarating"
      description="Bu parol qurilmani ochadi. U faqat qurilmada tekshiriladi va hech qayerda saqlanmaydi."
    >
      <SetupForm />
    </Screen>
  );
}

export function SetupDonePage() {
  return (
    <Screen
      icon={ScrollText}
      title="Recovery phrase'ni yozib oling"
      description="Qurilma ekranida 24 ta so'z ko'rsatiladi. Master parolni unutsangiz, faqat shu so'zlar bilan tiklash mumkin."
    >
      <RecoveryNotice />
    </Screen>
  );
}
