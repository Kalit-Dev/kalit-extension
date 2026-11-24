import { Check, Clock, Copy, Eye, EyeOff, KeyRound, Loader2, NotebookPen, Pencil, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EntryAvatar, formatUpdatedAt, isSecret, isStalePassword } from "@/entities/entry";
import { revealNote, revealPassword, revealTotp } from "@/features/reveal-credential";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { EntryMeta } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import { groupTotp } from "@/shared/lib/totp";

const SHOW_MS = 20_000;
const NOTE_SHOW_MS = 60_000; // eslatma uzunroq o'qiladi

/** Yozuv tafsilotlari. Parol faqat "Ko'rsatish" bosilib, qurilmada tugma bilan tasdiqlangandan keyin olinadi. */
export function EntryDetailsDialog({
  entry,
  onClose,
  onDelete,
}: {
  entry: EntryMeta;
  onClose: () => void;
  onDelete: (e: EntryMeta) => Promise<void>;
}) {
  const secret = isSecret(entry);
  const stale = isStalePassword(entry);
  const [password, setPassword] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [totp, setTotp] = useState<{ code: string; validFor: number; period: number; end: number } | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpLeft, setTotpLeft] = useState(0);
  const totpTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const [copied, setCopied] = useState<"login" | "parol" | "eslatma" | "2fa" | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const clear = () => {
    clearInterval(timer.current);
    setPassword(null);
  };

  useEffect(() => {
    alive.current = true;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive.current = false;
      clearInterval(timer.current); // yopilganda parol state bilan birga xotiradan o'chadi
      clearTimeout(noteTimer.current);
      clearInterval(totpTimer.current); // kod ham state bilan birga o'chadi
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const reveal = async () => {
    setBusy(true);
    try {
      const cred = await revealPassword(entry); // qurilmada tugma bosiladi
      if (!alive.current) return;
      setPassword(cred.password);
      setVisible(true);
      const end = Date.now() + SHOW_MS;
      setLeft(SHOW_MS);
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        const rest = end - Date.now();
        if (rest <= 0) clear();
        else setLeft(rest);
      }, 250);
    } catch (err) {
      if (alive.current) toast.error(describeError(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const showNote = async () => {
    setNoteBusy(true);
    try {
      const text = await revealNote(entry); // qurilmada tugma bosiladi
      if (!alive.current) return;
      setNote(text);
      clearTimeout(noteTimer.current);
      noteTimer.current = setTimeout(() => alive.current && setNote(null), NOTE_SHOW_MS);
    } catch (err) {
      if (alive.current) toast.error(describeError(err));
    } finally {
      if (alive.current) setNoteBusy(false);
    }
  };

  const showTotp = async () => {
    setTotpBusy(true);
    try {
      const res = await revealTotp(entry); // qurilmada tugma bosiladi
      if (!alive.current) return;
      const end = Date.now() + res.validFor * 1000;
      setTotp({ ...res, end });
      setTotpLeft(res.validFor * 1000);
      clearInterval(totpTimer.current);
      totpTimer.current = setInterval(() => {
        const rest = end - Date.now();
        if (rest <= 0) {
          clearInterval(totpTimer.current);
          setTotp(null); // muddati tugagan kod tozalanadi
        } else setTotpLeft(rest);
      }, 250);
    } catch (err) {
      if (alive.current) toast.error(describeError(err));
    } finally {
      if (alive.current) setTotpBusy(false);
    }
  };

  const copy = async (text: string, what: "login" | "parol" | "eslatma" | "2fa") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => alive.current && setCopied(null), 1500);
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Yozuv tafsilotlari"
        className="w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-xl"
      >
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <EntryAvatar entry={entry} className="size-10" />
          <div className="grid min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight">{entry.title || entry.site}</h2>
              {secret && <Badge variant="secondary">Maxfiy</Badge>}
            </span>
            {!secret && entry.title && <span className="truncate text-xs text-muted-foreground">{entry.site}</span>}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Yopish" onClick={onClose}>
            <X />
          </Button>
        </div>

        <dl className="grid gap-4 px-5 py-4">
          {!secret && <Row label="Sayt">{entry.site}</Row>}
          <Row
            label="Login"
            action={
              entry.username ? (
                <Button variant="outline" size="icon-sm" aria-label="Loginni nusxalash" onClick={() => void copy(entry.username, "login")}>
                  {copied === "login" ? <Check className="text-success" /> : <Copy />}
                </Button>
              ) : null
            }
          >
            {entry.username || <span className="text-muted-foreground">—</span>}
          </Row>

          <Row
            label="Parol"
            action={
              password !== null ? (
                <>
                  <Button variant="outline" size="icon-sm" aria-label={visible ? "Yashirish" : "Ko'rsatish"} onClick={() => setVisible((v) => !v)}>
                    {visible ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button variant="outline" size="icon-sm" aria-label="Parolni nusxalash" onClick={() => void copy(password, "parol")}>
                    {copied === "parol" ? <Check className="text-success" /> : <Copy />}
                  </Button>
                </>
              ) : null
            }
          >
            {password !== null ? (
              <div className="grid gap-1.5">
                <code className="break-all font-mono text-sm">{visible ? password : "•".repeat(Math.min(password.length, 24))}</code>
                <div className="h-0.5 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary/60 transition-[width] duration-200 ease-linear"
                    style={{ width: `${(left / SHOW_MS) * 100}%` }}
                  />
                </div>
              </div>
            ) : busy ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Qurilmada tasdiqlang…
              </span>
            ) : (
              <span className="font-mono tracking-widest text-muted-foreground">••••••••••</span>
            )}
          </Row>

          {entry.hasTotp && (
            <Row
              label="2FA kodi"
              action={
                totp ? (
                  <Button variant="outline" size="icon-sm" aria-label="Kodni nusxalash" onClick={() => void copy(totp.code, "2fa")}>
                    {copied === "2fa" ? <Check className="text-success" /> : <Copy />}
                  </Button>
                ) : null
              }
            >
              {totp ? (
                <div className="grid gap-1.5">
                  <code className="font-mono text-2xl font-semibold tracking-widest">{groupTotp(totp.code)}</code>
                  <div className="h-0.5 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-primary/60 transition-[width] duration-200 ease-linear"
                      style={{ width: `${(totpLeft / (totp.period * 1000)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{Math.ceil(totpLeft / 1000)} soniya amal qiladi</span>
                </div>
              ) : totpBusy ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Qurilmada tasdiqlang…
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void showTotp()}>
                  <KeyRound /> Kodni ko'rsatish
                </Button>
              )}
            </Row>
          )}

          {entry.hasNote && (
            <Row label="Maxfiy eslatma">
              {note !== null ? (
                <div className="grid gap-2">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{note}</pre>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void copy(note, "eslatma")}>
                      {copied === "eslatma" ? <Check className="text-success" /> : <Copy />} Nusxalash
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setNote(null)}>
                      <EyeOff /> Yashirish
                    </Button>
                  </div>
                </div>
              ) : noteBusy ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Qurilmada tasdiqlang…
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void showNote()}>
                  <NotebookPen /> Eslatmani ko'rsatish
                </Button>
              )}
            </Row>
          )}

          <Row label="Oxirgi o'zgargan">
            <span className="flex flex-wrap items-center gap-2">
              {formatUpdatedAt(entry.updatedAt)}
              {stale && (
                <span className="inline-flex items-center gap-1 text-xs text-warning">
                  <Clock className="size-3" /> bu parol 1 yildan eski — almashtirishni o'ylab ko'ring
                </span>
              )}
            </span>
          </Row>

          {password === null && !busy && (
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => void reveal()}>
                <ShieldCheck /> Parolni ko'rsatish
              </Button>
              <p className="text-xs text-muted-foreground">
                Qurilmada tugma bilan tasdiqlanadi. Parol {SHOW_MS / 1000} soniyadan keyin yashiriladi.
              </p>
            </div>
          )}
        </dl>

        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3">
          {confirmDelete ? (
            <>
              <span className="text-sm text-muted-foreground">O'chirilsinmi?</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                  Yo'q
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    clear();
                    void onDelete(entry);
                  }}
                >
                  Ha, o'chirish
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> O'chirish
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/vault/${encodeURIComponent(entry.id)}/edit`}>
                  <Pencil /> Tahrirlash
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex min-h-8 items-center justify-between gap-2 text-sm">
        <div className="min-w-0 flex-1 break-all">{children}</div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </dd>
    </div>
  );
}
