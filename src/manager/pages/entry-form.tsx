import { zodResolver } from "@hookform/resolvers/zod";
import { Cpu, Globe, Loader2, Lock, PenLine, type LucideIcon } from "lucide-react";
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
import { addSecret, isSecret, updateEntry } from "../api";
import { PageTitle } from "./page-header";

const schema = z.object({
  url: z.string().trim(),
  kind: z.enum(["web", "secret"]),
  username: z.string().trim().max(256),
  title: z.string().trim().max(64, "Ko'pi bilan 64 ta belgi"),
  mode: z.enum(["generate", "manual"]),
  password: z.string().max(512),
});
type Values = z.infer<typeof schema>;

const KINDS = [
  { value: "web", label: "Veb sayt", icon: Globe },
  { value: "secret", label: "Maxfiy yozuv", icon: Lock },
] as const;

const MODES = [
  { value: "generate", label: "Qurilmada", icon: Cpu },
  { value: "manual", label: "Qo'lda", icon: PenLine },
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
      kind: entry && isSecret(entry) ? "secret" : "web",
      username: entry?.username ?? "",
      title: entry?.title ?? "",
      mode: editing ? "manual" : "generate",
      password: "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const mode = form.watch("mode");
  const secret = form.watch("kind") === "secret";

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
        if (!isSecret(entry) && !v.username) {
          form.setError("username", { message: "Login kiriting" });
          return;
        }
        if (isSecret(entry) && !v.title) {
          form.setError("title", { message: "Nom kiriting" });
          return;
        }
        const patch: { title?: string; username?: string; password?: string } = {};
        if (v.username !== entry.username) patch.username = v.username;
        if (v.title !== (entry.title ?? "")) patch.title = v.title;
        if (v.password) patch.password = v.password;
        if (Object.keys(patch).length === 0) {
          navigate("/vault");
          return;
        }
        await updateEntry(entry.id, patch);
      } else if (v.kind === "secret") {
        if (!v.title) {
          form.setError("title", { message: "Nom kiriting" });
          return;
        }
        if (new TextEncoder().encode(v.title + v.username).length > 160) {
          form.setError("title", { message: "Nom va login birgalikda 160 baytdan oshmasin" });
          return;
        }
        if (v.mode === "manual" && !v.password) {
          form.setError("password", { message: "Parolni kiriting" });
          return;
        }
        await addSecret({
          kind: "secret",
          title: v.title,
          username: v.username,
          ...(v.mode === "manual" ? { password: v.password } : { generateLength: 20 }),
        });
      } else {
        if (!v.username) {
          form.setError("username", { message: "Login kiriting" });
          return;
        }
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

  const kind = form.watch("kind");

  return (
    <div>
      <PageTitle
        back={{ to: "/vault", label: "Parollar" }}
        title={editing ? "Yozuvni tahrirlash" : "Yangi yozuv"}
        description={
          editing
            ? "O'zgarishlar qurilmada tugma bilan tasdiqlanadi."
            : "Yozuv qurilmaga saqlanadi; parol kompyuterda saqlanmaydi."
        }
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {!editing && (
          <Segmented fill label="Yozuv turi" value={kind} options={KINDS} onChange={(v) => form.setValue("kind", v)} />
        )}

        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          {secret ? (
            <>
              <Field label="Nom" htmlFor="title" error={errors.title?.message}>
                <Input id="title" placeholder="Wi-Fi, SSH kaliti…" aria-invalid={!!errors.title} {...form.register("title")} />
              </Field>
              <Field label="Login (ixtiyoriy)" htmlFor="username" error={errors.username?.message}>
                <Input id="username" autoComplete="off" placeholder="foydalanuvchi nomi" {...form.register("username")} />
              </Field>
            </>
          ) : (
            <>
              <Field
                label="Sayt"
                htmlFor="url"
                error={errors.url?.message}
                hint={editing ? "Saytni o'zgartirib bo'lmaydi" : undefined}
              >
                <Input id="url" placeholder="example.com" disabled={editing} aria-invalid={!!errors.url} {...form.register("url")} />
              </Field>
              <Field label="Nom (ixtiyoriy)" htmlFor="title" error={errors.title?.message}>
                <Input id="title" placeholder="Ish pochtasi" {...form.register("title")} />
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
            </>
          )}

          <div className={cn("grid content-start gap-1.5", secret && "sm:col-span-2")}>
            <div className="flex h-5 items-center justify-between">
              <span className="text-sm font-medium leading-none">Parol</span>
              {!editing && (
                <Segmented compact label="Parol manbai" value={mode} options={MODES} onChange={(v) => form.setValue("mode", v)} />
              )}
            </div>
            {mode === "generate" && !editing ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                <Cpu className="size-4 shrink-0" />
                <span className="truncate">Qurilmada yaratiladi · 20 belgi</span>
              </div>
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
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">Qurilmada tugma bilan tasdiqlanadi</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to="/vault">Bekor qilish</Link>
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Saqlash
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon: LucideIcon }[];
  onChange: (value: T) => void;
  compact?: boolean;
  /** To'liq kenglikda teng bo'lingan tanlov. */
  fill?: boolean;
}

/** Kichik segmentli tanlov (radiogroup). */
function Segmented<T extends string>({ label, value, options, onChange, compact, fill }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("gap-0.5 rounded-md bg-muted p-0.5", fill ? "grid grid-cols-2" : "inline-flex")}>
      {options.map(({ value: v, label: text, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
            compact ? "px-2 py-0.5" : "px-2.5 py-1",
            value === v && "bg-background text-foreground shadow-xs",
          )}
        >
          <Icon className="size-3.5" />
          {text}
        </button>
      ))}
    </div>
  );
}
