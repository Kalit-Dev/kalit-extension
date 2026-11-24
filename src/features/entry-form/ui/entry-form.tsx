import { zodResolver } from "@hookform/resolvers/zod";
import { Globe, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { EntryAvatar, isSecret } from "@/entities/entry";
import { bytesToBase64 } from "@/shared/api/device/backup";
import { toOrigin } from "@/shared/lib/domain";
import { describeError } from "@/shared/lib/errors";
import { parseTotpInput, TotpInputError } from "@/shared/lib/totp";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Segmented } from "@/shared/ui/segmented";
import { DEFAULT_GENERATOR, generatorError, generatorParams, type GeneratorSettings } from "../model/generator-options";
import { schema, type Values } from "../model/entry-schema";
import { NoteField } from "./note-field";
import { PasswordSection } from "./password-section";
import { TotpField } from "./totp-field";

const KINDS = [
  { value: "web", label: "Veb sayt", icon: Globe },
  { value: "secret", label: "Maxfiy yozuv", icon: Lock },
] as const;

/** Yangi yozuv (/vault/new) va tahrirlash (/vault/:id/edit) uchun umumiy forma. */
export function EntryForm({ onClose }: { onClose: () => void }) {
  const { id } = useParams();
  const editing = id !== undefined;
  const entry = useDevice((s) => s.entries.find((e) => e.id === id));
  const addEntry = useDevice((s) => s.addEntry);
  const updateEntry = useDevice((s) => s.updateEntry);

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
  /** Tahrirlashda mavjud TOTP bor: "o'rnatilgan" holat, "Almashtirish" bosilsa kiritish maydoni ochiladi. */
  const [replacingTotp, setReplacingTotp] = useState(false);
  const { errors, isSubmitting } = form.formState;
  const [gen, setGen] = useState<GeneratorSettings>(DEFAULT_GENERATOR);
  const kind = form.watch("kind");
  const secret = kind === "secret";
  const totpInstalled = editing && !!entry?.hasTotp;
  const showTotpInput = !totpInstalled || replacingTotp;

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
          onClose();
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
      onClose();
    } catch (e) {
      toast.error(describeError(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 content-start gap-4 overflow-y-auto px-5 py-4">
        {editing && entry ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <EntryAvatar entry={entry} className="size-9" />
            <div className="grid min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm leading-tight font-medium">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.title || entry.site}</span>
                {isSecret(entry) && <Badge variant="secondary">Maxfiy</Badge>}
              </p>
              <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                {isSecret(entry) ? "Maxfiy yozuv" : entry.title ? entry.site : entry.username}
              </p>
            </div>
          </div>
        ) : (
          <Segmented
            fill
            label="Yozuv turi"
            value={kind}
            options={KINDS}
            onChange={(v) => form.setValue("kind", v)}
          />
        )}

        {secret ? (
          <>
            <Field label="Nom" htmlFor="title" error={errors.title?.message}>
              <Input id="title" autoFocus placeholder="Wi-Fi, SSH kaliti…" aria-invalid={!!errors.title} {...form.register("title")} />
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
              <Input id="url" autoFocus={!editing} placeholder="example.com" disabled={editing} aria-invalid={!!errors.url} {...form.register("url")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Login" htmlFor="username" error={errors.username?.message}>
                <Input
                  id="username"
                  autoComplete="off"
                  placeholder="email yoki nom"
                  aria-invalid={!!errors.username}
                  {...form.register("username")}
                />
              </Field>
              <Field label="Nom (ixtiyoriy)" htmlFor="title" error={errors.title?.message}>
                <Input id="title" placeholder="Ish pochtasi" {...form.register("title")} />
              </Field>
            </div>
          </>
        )}

        <PasswordSection form={form} editing={editing} gen={gen} onGen={setGen} />

        <div className="overflow-hidden rounded-xl border">
          <NoteField form={form} entry={entry} />
          <TotpField
            form={form}
            installed={totpInstalled}
            replacing={replacingTotp}
            onReplace={() => setReplacingTotp(true)}
            onClearToggle={(checked) => checked && setReplacingTotp(false)}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
        <p className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Qurilmada tasdiqlanadi
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Saqlash
          </Button>
        </div>
      </div>
    </form>
  );
}
