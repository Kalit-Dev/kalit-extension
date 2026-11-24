import { ChevronRight, KeyRound, Lock, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { SiteAvatar } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntryMeta } from "@/device/protocol";
import { describeError } from "@/lib/errors";
import { useDevice } from "@/store/device-store";
import { isSecret } from "../api";
import { EntryDialog } from "./entry-dialog";
import { PageTitle } from "./page-header";

export function VaultPage() {
  const entries = useDevice((s) => s.entries);
  const deleteEntry = useDevice((s) => s.deleteEntry);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...entries]
      .filter((e) => !q || `${e.site} ${e.username} ${e.title ?? ""}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (a.title || a.site).localeCompare(b.title || b.site) ||
          a.site.localeCompare(b.site) ||
          a.username.localeCompare(b.username),
      );
  }, [entries, query]);

  const remove = async (e: EntryMeta) => {
    try {
      await deleteEntry(e.id); // qurilmada tugma bilan tasdiqlanadi
      setSelectedId(null);
      toast.success("O'chirildi");
    } catch (err) {
      toast.error(describeError(err));
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
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.map((e) => {
            const secret = isSecret(e);
            return (
              <li key={e.id} className="">
                <button
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  {secret ? (
                    <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
                      <Lock className="size-4" />
                    </span>
                  ) : (
                    <SiteAvatar site={e.site} className="size-9" />
                  )}
                  <div className="grid min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{e.title || e.site}</span>
                      {secret && <Badge variant="secondary">Maxfiy</Badge>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {!secret && e.title ? `${e.site} · ` : ""}
                      {e.username}
                    </span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && <EntryDialog entry={selected} onClose={() => setSelectedId(null)} onDelete={remove} />}
    </>
  );
}
