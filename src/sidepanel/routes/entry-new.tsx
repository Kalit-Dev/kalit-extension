import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Cpu, Loader2, PenLine } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveTab } from "@/hooks/use-active-tab";
import { toOrigin } from "@/lib/domain";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useDevice } from "@/store/device-store";
import { PageHeader } from "../components/screen";

const schema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, "Sayt manzilini kiriting")
      .refine((v) => toOrigin(v) !== null, "Noto'g'ri manzil, masalan: example.com"),
    username: z.string().trim().min(1, "Login kiriting").max(256),
    title: z.string().trim().max(64, "Ko'pi bilan 64 ta belgi"),
    mode: z.enum(["generate", "manual"]),
    password: z.string().max(512),
  })
  .refine((v) => v.mode === "generate" || v.password.length > 0, {
    path: ["password"],
    message: "Parolni kiriting",
  });

type Values = z.infer<typeof schema>;

const MODES = [
  { value: "generate", label: "Qurilmada yaratish", icon: Cpu },
  { value: "manual", label: "Qo'lda kiritish", icon: PenLine },
] as const;

export function NewEntryPage() {
  const addEntry = useDevice((s) => s.addEntry);
  const navigate = useNavigate();
  const tab = useActiveTab();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { url: "", username: "", title: "", mode: "generate", password: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const mode = form.watch("mode");

  // Faol sahifa manzilini avtomatik to'ldirish.
  useEffect(() => {
    if (tab?.origin && !form.getValues("url")) form.setValue("url", tab.origin);
  }, [tab?.origin, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await addEntry({
        origin: toOrigin(v.url)!,
        username: v.username,
        title: v.title || undefined,
        ...(v.mode === "manual" ? { password: v.password } : { generateLength: 20 }),
      });
      toast.success("Saqlandi");
      navigate("/vault");
    } catch (e) {
      toast.error(describeError(e));
    }
  });

  return (
    <div className="animate-in fade-in-0">
      <PageHeader
        title="Yangi yozuv"
        back={
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/vault" aria-label="Orqaga">
              <ChevronLeft />
            </Link>
          </Button>
        }
      />
      <form onSubmit={onSubmit} className="grid gap-4 px-4 pt-2 pb-6" noValidate>
        <Field label="Sayt" htmlFor="url" error={errors.url?.message}>
          <Input id="url" placeholder="example.com" aria-invalid={!!errors.url} {...form.register("url")} />
        </Field>
        <Field label="Login" htmlFor="username" error={errors.username?.message}>
          <Input
            id="username"
            autoComplete="off"
            placeholder="email yoki foydalanuvchi nomi"
            aria-invalid={!!errors.username}
            {...form.register("username")}
          />
        </Field>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Parol</span>
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => form.setValue("mode", value, { shouldValidate: form.formState.isSubmitted })}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-all",
                  mode === value && "bg-background text-foreground shadow-xs",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          {mode === "generate" ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              20 belgili parol qurilmaning hardware RNG'si bilan yaratiladi va kompyuterga umuman chiqmaydi.
            </p>
          ) : (
            <Field htmlFor="password" error={errors.password?.message}>
              <PasswordInput id="password" aria-invalid={!!errors.password} {...form.register("password")} />
            </Field>
          )}
        </div>

        <Field label="Nom (ixtiyoriy)" htmlFor="title" error={errors.title?.message}>
          <Input id="title" placeholder="Masalan: Ish pochtasi" {...form.register("title")} />
        </Field>

        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Qurilmaga saqlash
        </Button>
      </form>
    </div>
  );
}
