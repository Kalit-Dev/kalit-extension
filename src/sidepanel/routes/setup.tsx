import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ScrollText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";
import { passwordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";
import { useDevice } from "@/store/device-store";
import { Screen } from "../components/screen";

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

const BAR_COLORS = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"];

export function SetupPage() {
  const onboard = useDevice((s) => s.onboard);
  const navigate = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;
  const strength = passwordStrength(form.watch("password"));

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
    <Screen
      icon={ShieldCheck}
      title="Master parol yarating"
      description="Bu parol qurilmani ochadi. U faqat qurilmada tekshiriladi va hech qayerda saqlanmaydi."
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Master parol" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoFocus aria-invalid={!!errors.password} {...form.register("password")} />
          <div className="flex items-center gap-2 pt-1">
            <div className="grid flex-1 grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn("h-1 rounded-full bg-muted", strength.score >= i && BAR_COLORS[strength.score])}
                />
              ))}
            </div>
            <span className="w-16 text-right text-[11px] text-muted-foreground">{strength.label}</span>
          </div>
        </Field>

        <Field label="Parolni takrorlang" htmlFor="confirm" error={errors.confirm?.message}>
          <PasswordInput id="confirm" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
        </Field>

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Davom etish
        </Button>
      </form>
    </Screen>
  );
}

export function SetupDonePage() {
  const refresh = useDevice((s) => s.refresh);
  const [busy, setBusy] = useState(false);

  return (
    <Screen
      icon={ScrollText}
      title="Recovery phrase'ni yozib oling"
      description="Qurilma ekranida 24 ta so'z ko'rsatiladi. Master parolni unutsangiz, faqat shu so'zlar bilan tiklash mumkin."
    >
      <ul className="grid gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
        {[
          "So'zlarni qog'ozga, tartibi bilan yozing",
          "Hech qachon kompyuter yoki telefonga yozmang",
          "Xavfsiz, faqat o'zingiz biladigan joyda saqlang",
        ].map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/60" />
            {t}
          </li>
        ))}
      </ul>
      <Button
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refresh().catch((e: unknown) => toast.error(describeError(e)));
          setBusy(false);
        }}
      >
        Yozib oldim
      </Button>
    </Screen>
  );
}
