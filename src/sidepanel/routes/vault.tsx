import { Copy, KeyRound, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { SiteAvatar } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntryMeta } from "@/device/protocol";
import { useActiveTab } from "@/hooks/use-active-tab";
import { describeError } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { applyToTab } from "../apply";

export function VaultPage() {
  const entries = useDevice((s) => s.entries);
  const getCredential = useDevice((s) => s.getCredential);
  const deleteEntry = useDevice((s) => s.deleteEntry);
  const tab = useActiveTab();
  const [query, setQuery] = useState("");

  const { here, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...entries]
      .filter((e) => !q || `${e.site} ${e.username} ${e.title ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.site.localeCompare(b.site) || a.username.localeCompare(b.username));
    const site = tab?.site;
    return { here: site ? list.filter((e) => e.site === site) : [], rest: site ? list.filter((e) => e.site !== site) : list };
  }, [entries, query, tab?.site]);

  const fill = async (entry: EntryMeta) => {
    if (!tab?.origin) return;
    try {
      const cred = await getCredential(entry.id, tab.origin);
      await applyToTab(tab.id, cred.username, cred.password);
      toast.success("To'ldirildi");
    } catch (e) {
      toast.error(describeError(e));
    }
  };

  const remove = async (entry: EntryMeta) => {
    try {
      await deleteEntry(entry.id);
      toast.success("O'chirildi");
    } catch (e) {
      toast.error(describeError(e));
    }
  };

  const copyUsername = async (entry: EntryMeta) => {
    await navigator.clipboard.writeText(entry.username);
    toast.success("Login nusxalandi");
  };

  if (entries.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-8 text-center animate-in fade-in-0">
        <span className="grid size-11 place-items-center rounded-xl border bg-muted/50">
          <KeyRound className="size-5" />
        </span>
        <div className="grid gap-1">
          <p className="text-sm font-medium">Hali parollar yo'q</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Saytga kirganingizda Kalit saqlashni taklif qiladi. Yoki qo'lda qo'shing.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link to="/vault/new">
            <Plus /> Qo'shish
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Qidirish"
            className="pl-8"
            aria-label="Qidirish"
          />
        </div>
        <Button size="icon" asChild>
          <Link to="/vault/new" aria-label="Yangi yozuv">
            <Plus />
          </Link>
        </Button>
      </div>

      {here.length > 0 && (
        <Section title={`Shu sayt · ${tab?.site}`}>
          {here.map((e) => (
            <EntryRow key={e.id} entry={e} onFill={() => fill(e)} onCopy={() => copyUsername(e)} onDelete={() => remove(e)} />
          ))}
        </Section>
      )}

      {rest.length > 0 && (
        <Section title={here.length ? "Boshqa yozuvlar" : `Barcha yozuvlar · ${rest.length}`}>
          {rest.map((e) => (
            <EntryRow key={e.id} entry={e} onCopy={() => copyUsername(e)} onDelete={() => remove(e)} />
          ))}
        </Section>
      )}

      {here.length + rest.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Hech narsa topilmadi</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <h2 className="truncate px-2 text-xs font-medium text-muted-foreground">{title}</h2>
      <div className="grid">{children}</div>
    </section>
  );
}

interface EntryRowProps {
  entry: EntryMeta;
  onFill?: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

function EntryRow({ entry, onFill, onCopy, onDelete }: EntryRowProps) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent">
      <SiteAvatar site={entry.site} />
      <div className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{entry.title || entry.site}</span>
        <span className="truncate text-xs text-muted-foreground">{entry.username}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="icon-sm" onClick={onCopy} aria-label="Loginni nusxalash">
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="O'chirish"
          className="hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
      {onFill && (
        <Button size="sm" variant="secondary" onClick={onFill}>
          To'ldirish
        </Button>
      )}
    </div>
  );
}
