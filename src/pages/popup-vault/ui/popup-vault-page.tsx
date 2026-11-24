import { Copy, KeyRound, LogIn, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { isSecret, matchesQuery, SiteAvatar } from "@/entities/entry";
import { applyToTab } from "@/features/fill-credential";
import type { EntryMeta } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import { useActiveTab } from "@/shared/lib/hooks/use-active-tab";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function PopupVaultPage() {
  const entries = useDevice((s) => s.entries);
  const getCredential = useDevice((s) => s.getCredential);
  const tab = useActiveTab();
  const [query, setQuery] = useState("");

  const { here, rest } = useMemo(() => {
    const list = entries
      .filter((e) => !isSecret(e))
      .filter((e) => matchesQuery(e, query))
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

  const copyUsername = async (entry: EntryMeta) => {
    await navigator.clipboard.writeText(entry.username);
    toast.success("Login nusxalandi");
  };

  if (entries.every(isSecret)) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="grid size-11 place-items-center rounded-xl border bg-muted/50">
          <KeyRound className="size-5" />
        </span>
        <div className="grid gap-1">
          <p className="text-sm font-medium">Hali parollar yo'q</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Saytga kirganingizda Kalit saqlashni taklif qiladi. Qo'lda qo'shish — boshqaruv sahifasida.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 border-b bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Qidirish"
            className="pl-8"
            aria-label="Qidirish"
          />
        </div>
      </div>

      <div className="grid gap-4 p-3">
      {here.length > 0 && (
        <Section title={`Shu sayt · ${tab?.site}`}>
          {here.map((e) => (
            <EntryRow key={e.id} entry={e} onFill={() => fill(e)} onCopy={() => copyUsername(e)} />
          ))}
        </Section>
      )}

      {rest.length > 0 && (
        <Section title={here.length ? "Boshqa yozuvlar" : `Barcha yozuvlar · ${rest.length}`}>
          {rest.map((e) => (
            <EntryRow key={e.id} entry={e} onCopy={() => copyUsername(e)} />
          ))}
        </Section>
      )}

      {here.length + rest.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Hech narsa topilmadi</p>
      )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <h2 className="overflow-hidden text-ellipsis whitespace-nowrap px-2 text-xs font-medium text-muted-foreground">{title}</h2>
      <div className="grid">{children}</div>
    </section>
  );
}

interface EntryRowProps {
  entry: EntryMeta;
  onFill?: () => void;
  onCopy: () => void;
}

function EntryRow({ entry, onFill, onCopy }: EntryRowProps) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent">
      <SiteAvatar site={entry.site} />
      <div className="grid min-w-0 flex-1">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">{entry.title || entry.site}</span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">{entry.username}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Button variant="outline" size="icon-sm" onClick={onCopy} aria-label="Loginni nusxalash">
          <Copy />
        </Button>
      </div>
      {onFill && (
        <Button size="sm" variant="outline" onClick={onFill}>
          <LogIn /> To'ldirish
        </Button>
      )}
    </div>
  );
}
