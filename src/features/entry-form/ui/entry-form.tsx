import { zodResolver } from "@hookform/resolvers/zod";
import { Cpu, Globe, KeyRound, Loader2, Lock, NotebookPen, PenLine, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useDevice } from "@/entities/device";
import { EntryAvatar, isSecret } from "@/entities/entry";
import { revealNote } from "@/features/reveal-credential";
import { bytesToBase64 } from "@/shared/api/device/backup";
import { NOTE_MAX_BYTES } from "@/shared/api/device/protocol";
import { toOrigin } from "@/shared/lib/domain";
import { describeError } from "@/shared/lib/errors";
import { parseTotpInput, TotpInputError } from "@/shared/lib/totp";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { PasswordInput } from "@/shared/ui/password-input";
import { Segmented } from "@/shared/ui/segmented";
import {
  DEFAULT_GENERATOR,
  describeGenerator,
  generatorError,
  generatorParams,
  type GeneratorSettings,
} from "../model/generator-options";
import { GeneratorOptions } from "./generator-options";
import { Textarea } from "@/shared/ui/textarea";

const noteBytes = (s: string) => new TextEncoder().encode(s).length;

const schema = z.object({
  url: z.string().trim(),
  kind: z.enum(["web", "secret"]),
  username: z.string().trim().max(256),
  title: z.string().trim().max(64, "Ko'pi bilan 64 ta belgi"),
  mode: z.enum(["generate", "manual"]),
  password: z.string().max(512),
  note: z.string().refine((s) => noteBytes(s) <= NOTE_MAX_BYTES, `Eslatma ${NOTE_MAX_BYTES} baytdan oshmasin`),
  clearNote: z.boolean(),
  /** v0.9: base32 kalit yoki otpauth:// havola (qurilmaga xom baytlar bo'lib ketadi; formada saqlanmaydi). */
  totp: z.string(),
  clearTotp: z.boolean(),
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
      note: "",
      clearNote: false,
      totp: "",
      clearTotp: false,
    },
  });
  const [loadingNote, setLoadingNote] = useState(false);
  /** Tahrirlashda mavjud TOTP bor: "o'rnatilgan" holat, "Almashtirish" bosilsa kiritish maydoni ochiladi. */
  const [replacingTotp, setReplacingTotp] = useState(false);
  const { errors, isSubmitting } = form.formState;
  const mode = form.watch("mode");
  const [gen, setGen] = useState<GeneratorSettings>(DEFAULT_GENERATOR);
  const kind = form.watch("kind");
  const secret = kind === "secret";
  const note = form.watch("note");
  const clearNote = form.watch("clearNote");
  const clearTotp = form.watch("clearTotp");
  const totpInstalled = editing && !!entry?.hasTotp;
  const showTotpInput = !totpInstalled || replacingTotp;

  /** Tahrirlashda joriy eslatma ko'rinmaydi (u qurilmada): xohlasa qurilmadan (tugma bilan) yuklaydi. */
  const loadNote = async () => {
    if (!entry) return;
    setLoadingNote(true);
    try {
      form.setValue("note", await revealNote(entry), { shouldValidate: true });
      form.setValue("clearNote", false);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setLoadingNote(false);
    }
  };

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
    // v0.9: 2FA kaliti — tasdiqdan oldin mahalliy tekshiruv (SHA1/6/30, 10..64 bayt).
    let seed: Uint8Array | undefined;
    if (showTotpInput && v.totp.trim() !== "") {
      try {
        seed = parseTotpInput(v.totp);
      } catch (e) {
        form.setError("totp", { message: e instanceof TotpInputError ? e.message : "2FA kaliti noto'g'ri" });
        return;
      }
    }
    const totp = seed ? bytesToBase64(seed) : undefined;
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
        const patch: { title?: string; username?: string; password?: string; note?: string; totp?: string } = {};
        if (v.username !== entry.username) patch.username = v.username;
        if (v.title !== (entry.title ?? "")) patch.title = v.title;
        if (v.password) patch.password = v.password;
        if (v.clearNote) patch.note = "";
        else if (v.note !== "") patch.note = v.note;
        if (totp) patch.totp = totp;
        else if (v.clearTotp && totpInstalled) patch.totp = ""; // bo'sh = TOTP'ni o'chirish
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
        if (v.mode === "generate" && generatorError(gen)) {
          toast.error(generatorError(gen)!);
          return;
        }
        await addEntry({
          kind: "secret",
          title: v.title,
          username: v.username,
          ...(v.note ? { note: v.note } : {}),
          ...(totp ? { totp } : {}),
          ...(v.mode === "manual" ? { password: v.password } : generatorParams(gen)),
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
        if (v.mode === "generate" && generatorError(gen)) {
          toast.error(generatorError(gen)!);
          return;
        }
        await addEntry({
          origin,
          username: v.username,
          title: v.title || undefined,
          ...(v.note ? { note: v.note } : {}),
          ...(totp ? { totp } : {}),
          ...(v.mode === "manual" ? { password: v.password } : generatorParams(gen)),
        });
      }
      form.reset(); // parol, eslatma va 2FA kaliti formada qolmasin
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
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">Qurilmada yaratiladi · {describeGenerator(gen)}</span>
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

          {mode === "generate" && !editing && <GeneratorOptions value={gen} onChange={setGen} />}

          <div className="grid gap-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="note" className="flex items-center gap-1.5 text-sm font-medium leading-none">
                <NotebookPen className="size-3.5" /> Maxfiy eslatma (ixtiyoriy)
              </label>
              {editing && entry?.hasNote && (
                <Button type="button" variant="ghost" size="sm" disabled={loadingNote || clearNote} onClick={() => void loadNote()}>
                  {loadingNote ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Qurilmadan yuklash
                </Button>
              )}
            </div>
            <Textarea
              id="note"
              rows={4}
              readOnly={clearNote} // disabled bo'lsa react-hook-form qiymatni undefined qiladi
              className={cn(clearNote && "opacity-50")}
              autoComplete="off"
              spellCheck={false}
              placeholder="Tiklash kodlari, PIN, xavfsizlik savollari…"
              aria-invalid={!!errors.note}
              {...form.register("note")}
            />
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {errors.note ? (
                  <span role="alert" className="text-destructive">
                    {errors.note.message}
                  </span>
                ) : editing && entry?.hasNote ? (
                  "Bo'sh qoldirsangiz, eslatma o'zgarmaydi. Qurilmada shifrlanadi."
                ) : (
                  "Qurilmada shifrlanadi; faqat tugma bilan tasdiqlab ko'riladi."
                )}
              </span>
              <span className={cn("shrink-0 tabular-nums", noteBytes(note) > NOTE_MAX_BYTES && "text-destructive")}>
                {noteBytes(note)} / {NOTE_MAX_BYTES}
              </span>
            </div>
            {editing && entry?.hasNote && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-3.5 accent-[var(--color-primary)]" {...form.register("clearNote")} />
                Eslatmani o'chirish
              </label>
            )}
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="totp" className="flex items-center gap-1.5 text-sm font-medium leading-none">
                <KeyRound className="size-3.5" /> 2FA kaliti (TOTP) (ixtiyoriy)
              </label>
              {totpInstalled && !replacingTotp && !clearTotp && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setReplacingTotp(true)}>
                  Almashtirish
                </Button>
              )}
            </div>
            {showTotpInput ? (
              <Input
                id="totp"
                autoComplete="off"
                spellCheck={false}
                placeholder="base32 kalit yoki otpauth://totp/… havolasi"
                aria-invalid={!!errors.totp}
                {...form.register("totp")}
              />
            ) : (
              <div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0" />
                <span>{clearTotp ? "Saqlashda o'chiriladi" : "O'rnatilgan"}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {errors.totp ? (
                <span role="alert" className="text-destructive">
                  {errors.totp.message}
                </span>
              ) : (
                "Qurilmada shifrlanadi; kod har safar tugma bilan tasdiqlab olinadi. Faqat SHA1, 6 raqam, 30 soniya."
              )}
            </p>
            {totpInstalled && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--color-primary)]"
                  {...form.register("clearTotp", {
                    onChange: (e: { target: { checked: boolean } }) => e.target.checked && setReplacingTotp(false),
                  })}
                />
                2FA kalitini o'chirish
              </label>
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
