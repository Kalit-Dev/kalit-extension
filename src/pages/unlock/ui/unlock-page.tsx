import { Lock } from "lucide-react";
import { UnlockForm } from "@/features/unlock-device";
import { Screen } from "@/shared/ui/screen";

export function UnlockPage() {
  return (
    <Screen icon={Lock} title="Qurilma qulflangan" description="Davom etish uchun master parolni kiriting.">
      <UnlockForm />
    </Screen>
  );
}
