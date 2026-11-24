import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { describeError, errorCode } from "@/lib/errors";
import { passwordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";
import { changeMaster } from "../api";

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

const BAR_COLORS = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"];

export function SecurityPage() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const strength = passwordStrength(form.watch("password"));

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
    <div>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Joriy master parol" htmlFor="current" error={errors.current?.message}>
          <PasswordInput id="current" aria-invalid={!!errors.current} {...form.register("current")} />
        </Field>
        <Field label="Yangi master parol" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" aria-invalid={!!errors.password} {...form.register("password")} />
          <div className="flex items-center gap-2 pt-1">
            <div className="grid flex-1 grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn("h-1 rounded-full bg-muted transition-colors", strength.score >= i && BAR_COLORS[strength.score])}
                />
              ))}
            </div>
            <span className="w-16 text-right text-[11px] text-muted-foreground">{strength.label}</span>
          </div>
        </Field>
        <Field label="Yangi parolni takrorlang" htmlFor="confirm" error={errors.confirm?.message}>
          <PasswordInput id="confirm" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
        </Field>
        <Button type="submit" className="w-fit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Parolni almashtirish
        </Button>
      </form>
    </div>
  );
}
