import { FileUp, Info, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { isSecret } from "@/entities/entry";
import { siteOf, toOrigin } from "@/shared/lib/domain";
import { describeError, errorCode } from "@/shared/lib/errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import {
  BitwardenFormatError,
  secretTitle,
  truncateBytes,
  type ImportItem,
  type NoUrlItem,
  type Skipped,
} from "../lib/bitwarden";
import { parseImportFile } from "../lib/import-file";

const VAULT_CAPACITY = 32; // firmware: kMaxEntries
const STOP_CODES = new Set(["LOCKED", "DISCONNECTED", "NOT_TRUSTED", "WIPED", "PROTOCOL"]);

type Choice = { mode: "skip" | "web" | "secret"; url: string };
type SecretItem = { title: string; username: string; password: string };
type QueueItem = { kind: "web"; item: ImportItem } | { kind: "secret"; item: SecretItem };

const CHOICES = [
  { value: "skip", label: "O'tkazib yuborish" },
  { value: "web", label: "Veb sayt" },
  { value: "secret", label: "Maxfiy yozuv" },
] as const;
const enc = new TextEncoder();

/** Veb sayt tanlangan yozuv -> ImportItem (yoki xato sababi). */
function toWebItem(n: NoUrlItem, url: string): ImportItem | string {
  const origin = toOrigin(url);
  const site = origin && siteOf(origin);
  if (!origin || !site) return "Noto'g'ri manzil";
  if (!n.username) return "Veb yozuv uchun login kerak";
  const room = 160 - enc.encode(site).length - enc.encode(n.username).length;
  if (room < 0) return "Sayt+login 160 baytdan oshadi";
  const title = truncateBytes(truncateBytes(n.name, 64), room);
  return { origin, site, username: n.username, password: n.password, ...(title ? { title } : {}) };
}

export function ImportEntries() {
  const entries = useDevice((s) => s.entries);
  const addEntry = useDevice((s) => s.addEntry);
  const importBegin = useDevice((s) => s.importBegin);
  const importEnd = useDevice((s) => s.importEnd);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancel = useRef(false);

  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [noUrl, setNoUrl] = useState<NoUrlItem[]>([]);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<Skipped[]>([]);

  const have = new Set(entries.filter((e) => !isSecret(e)).map((e) => `${e.site}\u0000${e.username}`));
  const haveSecret = new Set(entries.filter(isSecret).map((e) => `${e.title ?? ""}\u0000${e.username}`));

  const choiceOf = (i: number): Choice => choices[i] ?? { mode: "skip", url: noUrl[i]?.guessedUrl ?? "" };
  const setChoice = (i: number, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [i]: { ...choiceOf(i), ...patch } }));
  const setAll = (mode: Choice["mode"]) =>
    setChoices(Object.fromEntries(noUrl.map((_, i) => [i, { ...choiceOf(i), mode }])));

  // Tanlangan noUrl yozuvlari: veb (to'g'ri manzil bilan) va maxfiy.
  const chosenWeb: ImportItem[] = [];
  const chosenSecret: SecretItem[] = [];
  const rowError: Record<number, string> = {};
  noUrl.forEach((n, i) => {
    const c = choiceOf(i);
    if (c.mode === "web") {
      const w = toWebItem(n, c.url);
      if (typeof w === "string") rowError[i] = w;
      else chosenWeb.push(w);
    } else if (c.mode === "secret") {
      chosenSecret.push({ title: secretTitle(n.name, n.username), username: n.username, password: n.password });
    }
  });

  const seenWeb = new Set(have);
  const webAll = [...(items ?? []), ...chosenWeb].filter((i) => {
    const k = `${i.site}\u0000${i.username}`;
    if (seenWeb.has(k)) return false;
    seenWeb.add(k);
    return true;
  });
  const seenSecret = new Set(haveSecret);
  const secretAll = chosenSecret.filter((i) => {
    const k = `${i.title}\u0000${i.username}`;
    if (seenSecret.has(k)) return false;
    seenSecret.add(k);
    return true;
  });
  const fresh: QueueItem[] = [
    ...webAll.map((item) => ({ kind: "web", item }) as const),
    ...secretAll.map((item) => ({ kind: "secret", item }) as const),
  ];
  const free = Math.max(0, VAULT_CAPACITY - entries.length);
  const queue = fresh.slice(0, free);
  const overflow = fresh.length - queue.length;
  const total = (items?.length ?? 0) + chosenWeb.length + chosenSecret.length;
  const queuedWeb = queue.filter((q) => q.kind === "web").length;

  const reset = () => {
    setItems(null);
    setNoUrl([]);
    setChoices({});
    setSkipped([]);
    setDone(0);
    setFailed([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    try {
      const parsed = parseImportFile(await file.text());
      setItems(parsed.items);
      setNoUrl(parsed.noUrl);
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
    setConfirming(true);
    try {
      await importBegin(queue.length); // qurilmada BITTA tasdiq
    } catch (e) {
      // Eski firmware IMPORT_BEGIN'ni bilmaydi (INTERNAL qaytaradi).
      const reason = errorCode(e) === "INTERNAL" ? "Firmware yangilanishi kerak (0.4.0+)" : describeError(e);
      toast.error(reason);
      setFailed([{ name: "Import", reason }]);
      setConfirming(false);
      setRunning(false);
      return;
    }
    setConfirming(false);
    let ok = 0;
    try {
      for (const q of queue) {
        if (cancel.current) break;
        const it = q.kind === "web" ? q.item : null;
        try {
          if (q.kind === "web") {
            await addEntry({
              origin: q.item.origin,
              username: q.item.username,
              password: q.item.password,
              ...(q.item.title ? { title: q.item.title } : {}),
            });
          } else {
            await addEntry({ kind: "secret", ...q.item });
          }
          ok++;
          setDone(ok);
        } catch (e) {
          const name = it ? `${it.site} (${it.username})` : `${q.item.title} (maxfiy)`;
          setFailed((f) => [...f, { name, reason: describeError(e) }]);
          if (STOP_CODES.has(errorCode(e))) break;
        }
      }
    } finally {
      try {
        await importEnd();
      } catch {
        // uzilgan/qulflangan: sessiya qurilmada o'zi tugagan
      }
      setItems(null); // parollar xotiradan chiqadi
      setNoUrl([]);
      setChoices({});
      setRunning(false);
    }
    toast.success(`${ok} ta yozuv import qilindi`);
  };

  const hasResult = !items && !running && (done > 0 || failed.length > 0);

  return (
    <div className="grid max-w-3xl gap-5">
      <Card>
        <CardHeader>
          <CardIcon>
            <UploadCloud />
          </CardIcon>
          <div>
            <CardTitle>Eksport faylini tanlang</CardTitle>
            <CardDescription>
              Bitwarden JSON yoki CSV (Chrome, Bitwarden, LastPass, 1Password va boshqalar).
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div className="grid gap-1">
              <p>
                Fayl faqat shu brauzerda o'qiladi, hech qayerga yuborilmaydi. Import boshlashdan oldin qurilmada bir
                marta tasdiqlanadi.
              </p>
              <p>
                Qurilma {VAULT_CAPACITY} tagacha yozuvni saqlaydi. Import tugagach eksport faylini xavfsiz o'chiring.
              </p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {!items && !running && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid justify-items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="grid size-10 place-items-center rounded-lg border bg-muted/60">
                <FileUp className="size-5" />
              </span>
              <span className="text-sm font-medium">JSON yoki CSV tanlash</span>
              <span className="text-xs text-muted-foreground">Faylni tanlash uchun bosing</span>
            </button>
          )}
        </CardContent>
      </Card>

      {items && !running && (
        <Card>
          <CardHeader className="items-center">
            <div className="flex-1">
              <CardTitle>Import xulosasi</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm">
              <b>{queue.length}</b> ta yozuv import qilinadi
              {chosenSecret.length > 0 && (
                <>
                  {" "}
                  ({queuedWeb} ta veb, {queue.length - queuedWeb} ta maxfiy)
                </>
              )}
              {noUrl.length - chosenWeb.length - chosenSecret.length > 0 && (
                <>, {noUrl.length - chosenWeb.length - chosenSecret.length} ta veb manzilsiz o'tkazib yuboriladi</>
              )}
              {skipped.length > 0 && <>, {skipped.length} ta o'tkazib yuboriladi</>}
              {fresh.length < total && <>, {total - fresh.length} ta qurilmada allaqachon bor yoki takror</>}.
            </p>
            {overflow > 0 && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                Qurilmada {free} ta bo'sh joy bor: {overflow} ta yozuv sig'maydi va import qilinmaydi.
              </p>
            )}
            {noUrl.length > 0 && (
              <div className="grid gap-2 rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Veb manzilsiz yozuvlar ({noUrl.length})</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setAll("secret")}>
                      Hammasini maxfiy yozuv qilish
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAll("skip")}>
                      Hammasini o'tkazib yuborish
                    </Button>
                  </div>
                </div>
                <ul className="grid max-h-96 divide-y overflow-auto">
                  {noUrl.map((n, i) => {
                    const c = choiceOf(i);
                    return (
                      <li key={i} className="grid gap-2 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">{n.name}</span>
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                            {n.username}
                          </span>
                        </div>
                        <div role="radiogroup" aria-label={n.name} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                          {CHOICES.map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={c.mode === value}
                              onClick={() => setChoice(i, { mode: value })}
                              className={cn(
                                "rounded-md py-1 text-xs font-medium text-muted-foreground transition-all",
                                c.mode === value && "bg-background text-foreground shadow-xs",
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {c.mode === "web" && (
                          <div className="grid gap-1">
                            <Input
                              value={c.url}
                              onChange={(e) => setChoice(i, { url: e.target.value })}
                              placeholder="example.com"
                              aria-label="Veb sayt manzili"
                              aria-invalid={!!rowError[i]}
                            />
                            {rowError[i] && <p className="text-xs text-destructive">{rowError[i]}</p>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {skipped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">O'tkazib yuboriladiganlar</summary>
                <ul className="mt-2 grid gap-0.5 text-muted-foreground">
                  {skipped.map((s, i) => (
                    <li key={i} className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {s.name} — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="outline" onClick={reset}>
              Bekor qilish
            </Button>
            <Button disabled={queue.length === 0} onClick={() => void run()}>
              Importni boshlash
            </Button>
          </CardFooter>
        </Card>
      )}

      {running && (
        <Card>
          <CardContent className="grid gap-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin" />
              {confirming ? "Qurilmada tasdiqlang" : `${done} / ${queue.length}`}
            </p>
            <Button variant="outline" className="w-fit" onClick={() => (cancel.current = true)}>
              To'xtatish
            </Button>
          </CardContent>
        </Card>
      )}

      {hasResult && (
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <b>{done}</b> ta import qilindi{failed.length > 0 && <>, {failed.length} ta bajarilmadi</>}.
            </p>
            {failed.length > 0 && (
              <ul className="grid gap-0.5 text-muted-foreground">
                {failed.map((f, i) => (
                  <li key={i} className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {f.name} — {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
