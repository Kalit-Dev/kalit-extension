import { FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BitwardenFormatError, parseBitwardenExport, type ImportItem, type Skipped } from "@/lib/bitwarden";
import { describeError, errorCode } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { PageTitle } from "./page-header";

const VAULT_CAPACITY = 32; // firmware: kMaxEntries
const STOP_CODES = new Set(["LOCKED", "DISCONNECTED", "NOT_TRUSTED", "WIPED", "PROTOCOL"]);

export function ImportPage() {
  const entries = useDevice((s) => s.entries);
  const addEntry = useDevice((s) => s.addEntry);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancel = useRef(false);

  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<Skipped[]>([]);

  const have = new Set(entries.map((e) => `${e.site}\u0000${e.username}`));
  const fresh = (items ?? []).filter((i) => !have.has(`${i.site}\u0000${i.username}`));
  const free = Math.max(0, VAULT_CAPACITY - entries.length);
  const queue = fresh.slice(0, free);
  const overflow = fresh.length - queue.length;

  const reset = () => {
    setItems(null);
    setSkipped([]);
    setDone(0);
    setFailed([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    try {
      const parsed = parseBitwardenExport(await file.text());
      setItems(parsed.items);
      setSkipped(parsed.skipped);
    } catch (e) {
      toast.error(e instanceof BitwardenFormatError ? e.message : "Faylni o'qib bo'lmadi");
    }
  };

  const run = async () => {
    cancel.current = false;
    setRunning(true);
    setDone(0);
    setFailed([]);
    let ok = 0;
    for (const it of queue) {
      if (cancel.current) break;
      try {
        await addEntry({
          origin: it.origin,
          username: it.username,
          password: it.password,
          ...(it.title ? { title: it.title } : {}),
        });
        ok++;
        setDone(ok);
      } catch (e) {
        setFailed((f) => [...f, { name: `${it.site} (${it.username})`, reason: describeError(e) }]);
        if (STOP_CODES.has(errorCode(e))) break;
      }
    }
    setItems(null); // parollar xotiradan chiqadi
    setRunning(false);
    toast.success(`${ok} ta yozuv import qilindi`);
  };

  return (
    <div className="max-w-2xl animate-in fade-in-0">
      <PageTitle
        title="Import"
        description="Bitwarden eksportidan (shifrlanmagan .json) yozuvlarni qurilmaga ko'chirish."
      />

      <div className="grid gap-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p>Fayl faqat shu brauzerda o'qiladi, hech qayerga yuborilmaydi. Har bir yozuv uchun <b>qurilmada tugma bosish</b> kerak (10 s ichida).</p>
          <p className="mt-1">Qurilma {VAULT_CAPACITY} tagacha yozuvni saqlaydi. Import tugagach eksport faylini xavfsiz o'chiring.</p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {!items && !running && (
          <Button variant="outline" className="w-fit" onClick={() => fileRef.current?.click()}>
            <FileUp /> Bitwarden JSON tanlash
          </Button>
        )}

        {items && !running && (
          <div className="grid gap-3 rounded-lg border p-4">
            <p className="text-sm">
              <b>{queue.length}</b> ta yozuv import qilinadi
              {skipped.length > 0 && <>, {skipped.length} ta o'tkazib yuboriladi</>}
              {fresh.length < items.length && <>, {items.length - fresh.length} ta qurilmada allaqachon bor</>}.
            </p>
            {overflow > 0 && (
              <p className="text-sm text-warning">
                Qurilmada {free} ta bo'sh joy bor: {overflow} ta yozuv sig'maydi va import qilinmaydi.
              </p>
            )}
            {skipped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">O'tkazib yuboriladiganlar</summary>
                <ul className="mt-2 grid gap-0.5 text-muted-foreground">
                  {skipped.map((s, i) => (
                    <li key={i} className="truncate">
                      {s.name} — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex gap-2">
              <Button disabled={queue.length === 0} onClick={() => void run()}>
                Importni boshlash
              </Button>
              <Button variant="ghost" onClick={reset}>
                Bekor qilish
              </Button>
            </div>
          </div>
        )}

        {running && (
          <div className="grid gap-3 rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {done} / {queue.length} — qurilmada tugmani bosing
            </p>
            <Button variant="outline" className="w-fit" onClick={() => (cancel.current = true)}>
              To'xtatish
            </Button>
          </div>
        )}

        {!items && !running && (done > 0 || failed.length > 0) && (
          <div className="grid gap-2 rounded-lg border p-4 text-sm">
            <p>
              <b>{done}</b> ta import qilindi{failed.length > 0 && <>, {failed.length} ta bajarilmadi</>}.
            </p>
            {failed.length > 0 && (
              <ul className="grid gap-0.5 text-muted-foreground">
                {failed.map((f, i) => (
                  <li key={i} className="truncate">
                    {f.name} — {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
