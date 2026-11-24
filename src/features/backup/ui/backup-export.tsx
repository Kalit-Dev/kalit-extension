import { zodResolver } from "@hookform/resolvers/zod";
import { Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDevice } from "@/entities/device";
import {
  backupFileName,
  isValidBackupPassphrase,
  serializeBackup,
  type BackupProgress,
} from "@/shared/api/device/backup";
import { describeBackupError } from "@/shared/lib/errors";
import { passwordStrength } from "@/shared/lib/password-strength";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { PasswordInput } from "@/shared/ui/password-input";
import { PasswordStrengthMeter } from "@/shared/ui/password-strength-meter";
import { BackupProgressView } from "./backup-progress";

const schema = z
  .object({
    passphrase: z.string().refine(isValidBackupPassphrase, "Zaxira paroli 10 dan 128 baytgacha bo'lsin"),
    confirm: z.string(),
  })
  .refine((v) => v.passphrase === v.confirm, { path: ["confirm"], message: "Parollar mos emas" })
  .refine((v) => passwordStrength(v.passphrase).score >= 2, {
    path: ["passphrase"],
    message: "Parol juda zaif — uzunroq yoki murakkabroq qiling",
  });
type Values = z.infer<typeof schema>;

/** Faylni brauzer yuklamalariga yuboradi. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Shifrlangan zaxira nusxa: shifrlash to'liq qurilmada, extension faqat blob'larni faylga yozadi. */
export function BackupExport() {
  const exportBackup = useDevice((s) => s.exportBackup);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { passphrase: "", confirm: "" } });
  const { errors } = form.formState;
  const [progress, setProgress] = useState<BackupProgress | null>(null);

  const onSubmit = form.handleSubmit(async (v) => {
    setProgress({ stage: "confirm", done: 0, total: 0 });
    try {
      const file = await exportBackup(v.passphrase, setProgress);
      download(backupFileName(), serializeBackup(file));
      form.reset(); // parol formadan ham tozalanadi
      toast.success(`${file.count} ta yozuv zaxiraga olindi`);
    } catch (e) {
      toast.error(describeBackupError(e));
    } finally {
      setProgress(null);
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="contents">
        <CardHeader>
          <CardIcon>
            <Download />
          </CardIcon>
          <div>
            <CardTitle>Zaxira nusxa olish</CardTitle>
            <CardDescription>
              Barcha yozuvlar qurilmada shifrlanib, <code>.kalit</code> faylga saqlanadi. Fayl ichida ochiq matn yo'q.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="grid gap-5">
          <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="grid gap-1">
              <p>
                <b>Zaxira paroli tiklanmaydi.</b> Uni yo'qotsangiz, fayl hech qachon ochilmaydi — hech kim yordam
                bera olmaydi.
              </p>
              <p className="text-muted-foreground">
                Bu master paroldan <b>boshqa</b> parol bo'lsin. Fayl himoyasi faqat shu parol kuchiga bog'liq: uzun va
                noyob iboradan foydalaning.
              </p>
            </div>
          </div>

          <Field
            label="Zaxira paroli"
            htmlFor="backup-passphrase"
            error={errors.passphrase?.message}
            hint="Kamida 10 ta belgi; uzun ibora yaxshiroq."
          >
            <PasswordInput
              id="backup-passphrase"
              autoComplete="new-password"
              disabled={!!progress}
              aria-invalid={!!errors.passphrase}
              {...form.register("passphrase")}
            />
            <PasswordStrengthMeter password={form.watch("passphrase")} className="pt-1" />
          </Field>
          <Field label="Zaxira parolini takrorlang" htmlFor="backup-confirm" error={errors.confirm?.message}>
            <PasswordInput
              id="backup-confirm"
              autoComplete="new-password"
              disabled={!!progress}
              aria-invalid={!!errors.confirm}
              {...form.register("confirm")}
            />
          </Field>

          {progress && <BackupProgressView progress={progress} />}
        </CardContent>

        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">Qurilmada tugma bilan tasdiqlanadi</p>
          <Button type="submit" disabled={!!progress}>
            Zaxira nusxa olish
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
