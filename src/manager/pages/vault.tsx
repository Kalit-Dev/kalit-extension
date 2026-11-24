import { Copy, KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { SiteAvatar } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntryMeta } from "@/device/protocol";
import { describeError } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { PageTitle } from "./page-header";

export function VaultPage() {
  const entries = useDevice((s) => s.entries);
  const deleteEntry = useDevice((s) => s.deleteEntry);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...entries]
      .filter((e) => !q || `${e.site} ${e.username} ${e.title ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.site.localeCompare(b.site) || a.username.localeCompare(b.username));
  }, [entries, query]);

  const remove = async (e: EntryMeta) => {
    setBusyId(e.id);
    try {
      await deleteEntry(e.id); // qurilmada tugma bilan tasdiqlanadi
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  const copyUsername = async (e: EntryMeta) => {
    try {
      await navigator.clipboard.writeText(e.username);
      toast.success("Login nusxalandi");
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
  };

  return (
    <>
      <PageTitle
        title="Parollar"
        description={`${entries.length} ta yozuv · parollar faqat qurilmada saqlanadi`}
        actions={
          <Button asChild>
            <Link to="/vault/new">
              <Plus /> Yangi yozuv
            </Link>
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sayt, login yoki nom bo'yicha qidirish"
          className="pl-9"
          aria-label="Qidirish"
        />
      </div>

      {entries.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl border bg-muted/50">
            <KeyRound className="size-5" />
          </span>
          <p className="text-sm font-medium">Hali parollar yo'q</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Birinchi yozuvingizni qo'shing yoki saytga kirganda Kalit saqlashni taklif qiladi.
          </p>
        </div>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Hech narsa topilmadi</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {list.map((e) => (
            <li
              key={e.id}
              className="group flex items-center gap-3 px-4 py-3 transition-colors animate-in fade-in-0 hover:bg-accent/50"
            >
              <SiteAvatar site={e.site} className="size-9" />
              <div className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{e.title || e.site}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {e.title ? `${e.site} · ` : ""}
                  {e.username}
                </span>
              </div>
              {confirming === e.id ? (
                <div className="flex items-center gap-2 animate-in fade-in-0">
                  <span className="text-xs text-muted-foreground">O'chirilsinmi?</span>
                  <Button size="sm" variant="ghost" disabled={busyId === e.id} onClick={() => setConfirming(null)}>
                    Yo'q
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busyId === e.id} onClick={() => void remove(e)}>
                    Ha, o'chirish
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Button variant="ghost" size="icon-sm" aria-label="Loginni nusxalash" onClick={() => void copyUsername(e)}>
                    <Copy />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Tahrirlash" asChild>
                    <Link to={`/vault/${encodeURIComponent(e.id)}/edit`}>
                      <Pencil />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="O'chirish"
                    className="hover:text-destructive"
                    onClick={() => setConfirming(e.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
