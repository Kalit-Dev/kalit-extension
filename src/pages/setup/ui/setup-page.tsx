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
      title="Master parolni unutmang"
      description="Master parolni tiklash imkoni yo'q. Unutsangiz yoki 10 marta noto'g'ri kiritsangiz, qurilma tozalanadi."
    >
      <RecoveryNotice />
    </Screen>
  );
}
