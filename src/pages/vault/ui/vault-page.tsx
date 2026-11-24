import { ChevronRight, Clock, Globe, KeyRound, LayoutGrid, Lock, Plus, Search, ShieldCheck, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import {
  categoryCounts,
  compareEntries,
  EntryAvatar,
  formatUpdatedAt,
  groupByKind,
  isStalePassword,
  matchesCategory,
  matchesQuery,
  type EntryCategory,
} from "@/entities/entry";
import { BackupReminder } from "@/features/backup";
import { AuditBadges, useAudit } from "@/features/password-audit";
import { EntryDetailsDialog } from "@/widgets/entry-details-dialog";
import type { EntryMeta } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { PageTitle } from "@/shared/ui/page-title";
import { Segmented, type SegmentedOption } from "@/shared/ui/segmented";

const CATEGORY_META: Record<EntryCategory, { label: string; icon: SegmentedOption<EntryCategory>["icon"] }> = {
  all: { label: "Hammasi", icon: LayoutGrid },
  web: { label: "Veb", icon: Globe },
  secret: { label: "Maxfiy", icon: Lock },
  totp: { label: "2FA", icon: ShieldCheck },
  note: { label: "Eslatma", icon: StickyNote },
};

const GROUP_META = {
  web: { title: "Veb parollar", icon: Globe },
  secret: { title: "Maxfiy yozuvlar", icon: Lock },
} as const;

export function VaultPage() {
  const entries = useDevice((s) => s.entries);
  const deleteEntry = useDevice((s) => s.deleteEntry);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const { flags } = useAudit(entries); // qurilmada o'zi ishlaydi; natija faqat qatordagi belgilar uchun

  const [category, setCategory] = useState<EntryCategory>("all");
  const counts = useMemo(() => categoryCounts(entries), [entries]);
  const active: EntryCategory = counts[category] > 0 ? category : "all"; // toifa bo'shab qolsa (o'chirilgach) — "Hammasi"
  const categoryOptions = (["all", "web", "secret", "totp", "note"] as const)
    .filter((c) => c === "all" || counts[c] > 0)
    .map((c) => ({ value: c, label: CATEGORY_META[c].label, icon: CATEGORY_META[c].icon, count: counts[c] }));
  // Faqat bitta toifa bo'lsa (masalan, hammasi veb) filtr ma'nosiz: yashiramiz.
  const showCategories = categoryOptions.length > 2;

  const groups = useMemo(
    () =>
      groupByKind(entries.filter((e) => matchesCategory(e, active) && matchesQuery(e, query)).sort(compareEntries)),
    [entries, active, query],
  );
  const empty = groups.length === 0;

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

      {entries.length > 0 && <BackupReminder />}

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

      {showCategories && (
        <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
          <Segmented label="Yozuv turi" value={active} options={categoryOptions} onChange={setCategory} compact />
        </div>
      )}

      {entries.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl border bg-muted/50">
            <KeyRound className="size-5" />
          </span>
          <p className="text-sm font-medium">Hali parollar yo'q</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Birinchi yozuvingizni qo'shing yoki saytga kirganda Kalit saqlashni taklif qiladi.
          </p>
        </div>
      ) : empty ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Hech narsa topilmadi</p>
      ) : (
        <div key={active} className="grid animate-in gap-6 duration-200 fade-in-0">
          {groups.map((g) => {
            const GroupIcon = GROUP_META[g.kind].icon;
            return (
              <section key={g.kind} aria-label={GROUP_META[g.kind].title}>
                {groups.length > 1 && (
                  <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <GroupIcon className="size-3.5" aria-hidden />
                    {GROUP_META[g.kind].title}
                    <span className="font-normal tabular-nums opacity-70">{g.items.length}</span>
                  </h2>
                )}
                <Card>
                  <ul className="divide-y">
                    {g.items.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(e.id)}
                          className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                        >
                          <EntryAvatar entry={e} className="size-9" />
                          <div className="grid min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">
                                {e.title || e.site}
                              </span>
                              <AuditBadges flags={flags.get(e.id)} />
                              {e.hasTotp && (
                                <span title="2FA kodi bor" aria-label="2FA kodi bor" className="text-muted-foreground">
                                  <ShieldCheck className="size-3.5" />
                                </span>
                              )}
                              {e.hasNote && (
                                <span title="Eslatma bor" aria-label="Eslatma bor" className="text-muted-foreground">
                                  <StickyNote className="size-3.5" />
                                </span>
                              )}
                              {isStalePassword(e) && (
                                <span
                                  title={`Bu parol 1 yildan eski (${formatUpdatedAt(e.updatedAt)})`}
                                  aria-label="Parol 1 yildan eski"
                                  className="text-warning"
                                >
                                  <Clock className="size-3.5" />
                                </span>
                              )}
                            </span>
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                              {g.kind === "web" && e.title ? `${e.site} · ` : ""}
                              {e.username}
                            </span>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      {selected && <EntryDetailsDialog entry={selected} onClose={() => setSelectedId(null)} onDelete={remove} />}
    </>
  );
}
