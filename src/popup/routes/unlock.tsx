import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { describeError, errorCode } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { Screen } from "../components/screen";

const schema = z.object({ password: z.string().min(1, "Master parolni kiriting").max(128) });
type Values = z.infer<typeof schema>;

export function UnlockPage() {
  const unlock = useDevice((s) => s.unlock);
  const disconnect = useDevice((s) => s.disconnect);
  const attemptsLeft = useDevice((s) => s.status?.attemptsLeft ?? 10);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await unlock(password);
      form.reset();
    } catch (e) {
      form.resetField("password");
      if (errorCode(e) === "BAD_PASSWORD") {
        const left = useDevice.getState().status?.attemptsLeft;
        form.setError("password", {
          message: left !== undefined ? `Noto'g'ri parol. Qolgan urinishlar: ${left}` : describeError(e),
        });
        form.setFocus("password");
      } else {
        toast.error(describeError(e));
      }
    }
  });

  return (
    <Screen icon={Lock} title="Qurilma qulflangan" description="Davom etish uchun master parolni kiriting.">
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field
          label="Master parol"
          htmlFor="password"
          error={errors.password?.message}
          hint={attemptsLeft < 10 ? `Qolgan urinishlar: ${attemptsLeft}. 0 bo'lsa qurilma tozalanadi.` : undefined}
        >
          <PasswordInput id="password" autoFocus aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Ochish
        </Button>
        <Button type="button" variant="ghost" onClick={() => void disconnect()}>
          Uzish
        </Button>
      </form>
    </Screen>
  );
}
