import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useDevice } from "@/entities/device";
import { describeError } from "@/shared/lib/errors";
import { passwordStrength } from "@/shared/lib/password-strength";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { PasswordInput } from "@/shared/ui/password-input";
import { PasswordStrengthMeter } from "@/shared/ui/password-strength-meter";

const schema = z
  .object({
    password: z.string().min(12, "Kamida 12 ta belgi").max(128, "Ko'pi bilan 128 ta belgi"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Parollar mos emas" })
  .refine((v) => passwordStrength(v.password).score >= 2, {
    path: ["password"],
    message: "Parol juda zaif — uzunroq yoki murakkabroq qiling",
  });
type Values = z.infer<typeof schema>;

/** Master parol yaratish (qurilmani birinchi marta sozlash). */
export function SetupForm() {
  const onboard = useDevice((s) => s.onboard);
  const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await onboard(password);
      form.reset();
      navigate("/setup/done");
    } catch (e) {
      toast.error(describeError(e));
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Master parol" htmlFor="password" error={errors.password?.message}>
        <PasswordInput id="password" placeholder="Kamida 12 ta belgi" autoFocus aria-invalid={!!errors.password} {...form.register("password")} />
        <PasswordStrengthMeter password={form.watch("password")} className="pt-1" />
      </Field>
      <Field label="Parolni takrorlang" htmlFor="confirm" error={errors.confirm?.message}>
        <PasswordInput id="confirm" placeholder="Parolni qayta kiriting" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Davom etish
      </Button>
    </form>
  );
}
