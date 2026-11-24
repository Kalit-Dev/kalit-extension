import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDevice } from "@/entities/device";
import { describeError, errorCode } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { PasswordInput } from "@/shared/ui/password-input";

const schema = z.object({ password: z.string().min(1, "Master parolni kiriting").max(128) });
type Values = z.infer<typeof schema>;

export function UnlockForm() {
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
      <Button type="button" variant="outline" size="lg" onClick={() => void disconnect()}>
        Uzish
      </Button>
    </form>
  );
}
