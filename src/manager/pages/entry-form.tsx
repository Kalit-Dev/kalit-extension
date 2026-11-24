import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Cpu, Loader2, PenLine } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toOrigin } from "@/lib/domain";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useDevice } from "@/store/device-store";
import { updateEntry } from "../api";
import { PageTitle } from "./page-header";

const schema = z.object({
  url: z.string().trim(),
  username: z.string().trim().min(1, "Login kiriting").max(256),
  title: z.string().trim().max(64, "Ko'pi bilan 64 ta belgi"),
  mode: z.enum(["generate", "manual"]),
  password: z.string().max(512),
});
type Values = z.infer<typeof schema>;

const MODES = [
  { value: "generate", label: "Qurilmada yaratish", icon: Cpu },
  { value: "manual", label: "Qo'lda kiritish", icon: PenLine },
] as const;

/** Yangi yozuv (/vault/new) va tahrirlash (/vault/:id/edit) uchun umumiy forma. */
export function EntryFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const entry = useDevice((s) => s.entries.find((e) => e.id === id));
  const addEntry = useDevice((s) => s.addEntry);
  const navigate = useNavigate();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      url: entry?.site ?? "",
      username: entry?.username ?? "",
      title: entry?.title ?? "",
      mode: editing ? "manual" : "generate",
      password: "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const mode = form.watch("mode");

  if (editing && !entry) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">Yozuv topilmadi.</p>
        <Button variant="outline" className="w-fit" asChild>
          <Link to="/vault">Ro'yxatga qaytish</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      if (editing && entry) {
        const patch: { title?: string; username?: string; password?: string } = {};
        if (v.username !== entry.username) patch.username = v.username;
        if (v.title !== (entry.title ?? "")) patch.title = v.title;
        if (v.password) patch.password = v.password;
        if (Object.keys(patch).length === 0) {
          navigate("/vault");
          return;
        }
        await updateEntry(entry.id, patch);
      } else {
        const origin = toOrigin(v.url);
        if (!origin) {
          form.setError("url", { message: "Noto'g'ri manzil, masalan: example.com" });
          return;
        }
        if (v.mode === "manual" && !v.password) {
          form.setError("password", { message: "Parolni kiriting" });
          return;
        }
        await addEntry({
          origin,
          username: v.username,
          title: v.title || undefined,
          ...(v.mode === "manual" ? { password: v.password } : { generateLength: 20 }),
        });
      }
      form.reset(); // parol formada qolmasin
      toast.success("Saqlandi");
      navigate("/vault");
    } catch (e) {
      toast.error(describeError(e));
    }
  });

  return (
    <div className="max-w-lg">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
        <Link to="/vault">
          <ChevronLeft /> Parollar
        </Link>
      </Button>
      <PageTitle
        title={editing ? "Yozuvni tahrirlash" : "Yangi yozuv"}
        description="O'zgarish qurilmada tugma bilan tasdiqlanadi."
      />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field
          label="Sayt"
          htmlFor="url"
          error={errors.url?.message}
          hint={editing ? "Saytni o'zgartirib bo'lmaydi" : undefined}
        >
          <Input id="url" placeholder="example.com" disabled={editing} aria-invalid={!!errors.url} {...form.register("url")} />
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
          {!editing && (
            <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {MODES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => form.setValue("mode", value)}
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
          )}
          {mode === "generate" && !editing ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              20 belgili parol qurilmaning hardware RNG'si bilan yaratiladi va kompyuterga umuman chiqmaydi.
            </p>
          ) : (
            <Field
              htmlFor="password"
              error={errors.password?.message}
              hint={editing ? "Bo'sh qoldirsangiz, parol o'zgarmaydi" : undefined}
            >
              <PasswordInput id="password" aria-invalid={!!errors.password} {...form.register("password")} />
            </Field>
          )}
        </div>

        <Field label="Nom (ixtiyoriy)" htmlFor="title" error={errors.title?.message}>
          <Input id="title" placeholder="Masalan: Ish pochtasi" {...form.register("title")} />
        </Field>

        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Qurilmaga saqlash
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/vault">Bekor qilish</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
