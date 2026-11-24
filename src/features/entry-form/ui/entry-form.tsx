import { zodResolver } from "@hookform/resolvers/zod";
import { Cpu, Globe, Loader2, Lock, PenLine, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useDevice } from "@/entities/device";
import { EntryAvatar, isSecret } from "@/entities/entry";
import { toOrigin } from "@/shared/lib/domain";
import { describeError } from "@/shared/lib/errors";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { PasswordInput } from "@/shared/ui/password-input";
import { Segmented } from "@/shared/ui/segmented";

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
export function EntryForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const entry = useDevice((s) => s.entries.find((e) => e.id === id));
  const addEntry = useDevice((s) => s.addEntry);
  const updateEntry = useDevice((s) => s.updateEntry);
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
  const kind = form.watch("kind");
  const secret = kind === "secret";

  if (editing && !entry) {
    return (
      <Card className="max-w-3xl">
        <CardContent className="grid justify-items-start gap-3">
          <p className="text-sm text-muted-foreground">Yozuv topilmadi.</p>
          <Button variant="outline" asChild>
            <Link to="/vault">Ro'yxatga qaytish</Link>
          </Button>
        </CardContent>
      </Card>
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
        await addEntry({
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

  return (
    <Card className="max-w-3xl">
      <form onSubmit={onSubmit} noValidate className="contents">
        {editing && entry ? (
          <CardHeader className="items-center">
            <EntryAvatar entry={entry} className="size-10" />
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.title || entry.site}</span>
                {isSecret(entry) && <Badge variant="secondary">Maxfiy</Badge>}
              </CardTitle>
              <CardDescription className="mt-0.5">
                {isSecret(entry) ? "Maxfiy yozuv" : entry.site}
              </CardDescription>
            </div>
          </CardHeader>
        ) : (
          <div className="grid gap-2 border-b bg-muted/30 px-6 py-5">
            <span className="text-sm font-medium leading-none">Yozuv turi</span>
            <Segmented
              fill
              label="Yozuv turi"
              value={kind}
              options={KINDS}
              onChange={(v) => form.setValue("kind", v)}
              className="bg-background/60"
            />
          </div>
        )}

        <CardContent className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
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
            <div className="flex h-3.5 items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium leading-none">
                Parol
              </label>
              {!editing && (
                <Segmented
                  compact
                  label="Parol manbai"
                  value={mode}
                  options={MODES}
                  onChange={(v) => form.setValue("mode", v)}
                  className="-my-1.5 self-start"
                />
              )}
            </div>
            {mode === "generate" && !editing ? (
              <div
                id="password"
                className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 text-sm text-muted-foreground"
              >
                <Cpu className="size-4 shrink-0" />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">Qurilmada yaratiladi · 20 belgi</span>
              </div>
            ) : (
              <Field
                htmlFor="password"
                error={errors.password?.message}
                hint={editing ? "Bo'sh qoldirsangiz, parol o'zgarmaydi" : undefined}
              >
                <PasswordInput
                  id="password"
                  placeholder={editing ? "Yangi parol (ixtiyoriy)" : "Parolni kiriting"}
                  aria-invalid={!!errors.password} {...form.register("password")} />
              </Field>
            )}
          </div>
        </CardContent>

        <CardFooter className="justify-between">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" />
            Qurilmada tugma bilan tasdiqlanadi
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/vault">Bekor qilish</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Saqlash
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
