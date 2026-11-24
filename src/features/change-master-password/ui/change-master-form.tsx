import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDevice } from "@/entities/device";
import { describeError, errorCode } from "@/shared/lib/errors";
import { passwordStrength } from "@/shared/lib/password-strength";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { PasswordInput } from "@/shared/ui/password-input";
import { PasswordStrengthMeter } from "@/shared/ui/password-strength-meter";

const schema = z
  .object({
    current: z.string().min(1, "Joriy master parolni kiriting").max(128),
    password: z.string().min(12, "Kamida 12 ta belgi").max(128, "Ko'pi bilan 128 ta belgi"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Parollar mos emas" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Yangi parol joriyidan farq qilsin" })
  .refine((v) => passwordStrength(v.password).score >= 2, {
    path: ["password"],
    message: "Parol juda zaif — uzunroq yoki murakkabroq qiling",
  });
type Values = z.infer<typeof schema>;

/** Master parolni almashtirish. Yozuvlar saqlanadi; o'zgarish qurilmada tasdiqlanishi mumkin. */
export function ChangeMasterForm() {
  const changeMaster = useDevice((s) => s.changeMaster);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await changeMaster(v.current, v.password);
      form.reset();
      toast.success("Master parol almashtirildi");
    } catch (e) {
      form.resetField("current");
      if (errorCode(e) === "BAD_PASSWORD") {
        form.setError("current", { message: describeError(e) });
        form.setFocus("current");
      } else {
        toast.error(describeError(e));
      }
    }
  });

  return (
    <Card className="max-w-2xl">
      <form onSubmit={onSubmit} noValidate className="contents">
        <CardHeader>
          <CardIcon>
            <KeyRound />
          </CardIcon>
          <div>
            <CardTitle>Master parolni almashtirish</CardTitle>
            <CardDescription>Yozuvlaringiz saqlanadi; o'zgarish qurilmada tasdiqlanishi mumkin.</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="grid gap-5">
          <Field label="Joriy master parol" htmlFor="current" error={errors.current?.message}>
            <PasswordInput
              id="current"
              placeholder="Joriy master parol"
              autoComplete="current-password"
              aria-invalid={!!errors.current}
              {...form.register("current")}
            />
          </Field>

          <div className="grid gap-5 border-t pt-5">
            <Field
              label="Yangi master parol"
              htmlFor="password"
              error={errors.password?.message}
              hint="Kamida 12 ta belgi: harf, raqam va belgilar aralashmasi."
            >
              <PasswordInput
                id="password"
                placeholder="Kamida 12 ta belgi"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              <PasswordStrengthMeter password={form.watch("password")} className="pt-1" />
            </Field>
            <Field label="Yangi parolni takrorlang" htmlFor="confirm" error={errors.confirm?.message}>
              <PasswordInput
                id="confirm"
                placeholder="Yangi parolni qayta kiriting"
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
                {...form.register("confirm")}
              />
            </Field>
          </div>
        </CardContent>

        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">Qurilmada tugma bilan tasdiqlanishi mumkin</p>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Parolni almashtirish
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
