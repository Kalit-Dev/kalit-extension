import { FileUp, History } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import {
  BACKUP_MAX_FILE_BYTES,
  BackupFileError,
  isValidBackupPassphrase,
  parseBackupFile,
  type BackupFile,
  type BackupProgress,
} from "@/shared/api/device/backup";
import { describeBackupError } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { PasswordInput } from "@/shared/ui/password-input";
import { BackupProgressView } from "./backup-progress";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" });

/** Zaxira faylidan tiklash: fayl avval brauzerda tekshiriladi, keyin qurilma ochadi va tekshiradi. */
export function BackupRestore() {
  const restoreBackup = useDevice((s) => s.restoreBackup);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<BackupFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFile(null);
    setFileError(null);
    setPassphrase("");
    setError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    reset();
    if (f.size > BACKUP_MAX_FILE_BYTES) return setFileError("Fayl juda katta — bu Kalit zaxira fayli emas");
    try {
      setFile(parseBackupFile(await f.text()));
    } catch (e) {
      setFileError(e instanceof BackupFileError ? e.message : "Faylni o'qib bo'lmadi");
    }
  };

  const busy = !!progress;
  const valid = isValidBackupPassphrase(passphrase);

  const run = async () => {
    if (!file || !valid) return;
    setError(null);
    setResult(null);
    setProgress({ stage: "confirm", done: 0, total: 0 });
    try {
      const r = await restoreBackup(file, passphrase, setProgress);
      setResult(r);
      setFile(null);
      toast.success(`${r.added} ta qo'shildi, ${r.skipped} ta o'tkazib yuborildi`);
    } catch (e) {
      setError(describeBackupError(e));
    } finally {
      setPassphrase(""); // parol xotiradan chiqadi
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardIcon>
          <History />
        </CardIcon>
        <div>
          <CardTitle>Zaxiradan tiklash</CardTitle>
          <CardDescription>
            Mavjud yozuvlar o'chirilmaydi: qurilmada allaqachon bor yozuvlar o'tkazib yuboriladi.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5">
        <input
          ref={fileRef}
          id="backup-file"
          type="file"
          accept=".kalit,application/json,application/octet-stream"
          aria-label="Zaxira fayli"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {!file && !result && (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void onFile(e.dataTransfer.files[0]);
            }}
            className={`grid justify-items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 ${dragging ? "bg-accent/50" : ""}`}
          >
            <span className="grid size-10 place-items-center rounded-lg border bg-muted/60">
              <FileUp className="size-5" />
            </span>
            <span className="text-sm font-medium">Zaxira faylini tanlash (.kalit)</span>
            <span className="text-xs text-muted-foreground">Bosing yoki faylni shu yerga tashlang</span>
          </button>
        )}
        {fileError && (
          <p role="alert" className="text-sm text-destructive">
            {fileError}
          </p>
        )}

        {file && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <span>
                <b>{file.count}</b> ta yozuv · {formatDate(file.createdAt)}
              </span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>
                Boshqa fayl
              </Button>
            </div>
            <Field
              label="Zaxira paroli"
              htmlFor="restore-passphrase"
              error={error ?? undefined}
              hint="Zaxira olishda kiritilgan parol (master parol emas)."
            >
              <PasswordInput
                id="restore-passphrase"
                autoComplete="off"
                value={passphrase}
                disabled={busy}
                aria-invalid={!!error}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </Field>
            {progress && <BackupProgressView progress={progress} />}
          </>
        )}

        {result && (
          <div className="grid gap-2 text-sm" role="status">
            <p>
              <b>{result.added}</b> ta qo'shildi, <b>{result.skipped}</b> ta o'tkazib yuborildi.
            </p>
            <Button variant="outline" className="w-fit" onClick={reset}>
              Yana tiklash
            </Button>
          </div>
        )}
      </CardContent>

      {file && (
        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">Qurilmada tugma bilan tasdiqlanadi</p>
          <Button disabled={busy || !valid} onClick={() => void run()}>
            Tiklash
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
