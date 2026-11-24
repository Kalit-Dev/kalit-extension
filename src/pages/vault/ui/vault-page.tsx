import { ChevronRight, Clock, KeyRound, Plus, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { compareEntries, EntryAvatar, formatUpdatedAt, isSecret, isStalePassword, matchesQuery } from "@/entities/entry";
import { BackupReminder } from "@/features/backup";
import { AuditBadges, AuditPanel, useAudit } from "@/features/password-audit";
import { EntryDetailsDialog } from "@/widgets/entry-details-dialog";
import type { EntryMeta } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { PageTitle } from "@/shared/ui/page-title";

export function VaultPage() {
  const entries = useDevice((s) => s.entries);
  const deleteEntry = useDevice((s) => s.deleteEntry);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const { report, running, run, flags } = useAudit(entries);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const onlyFlagged = flaggedOnly && report !== null && flags.size > 0; // natija eskirsa filtr o'z-o'zidan o'chadi

  const list = useMemo(
    () => entries.filter((e) => matchesQuery(e, query) && (!onlyFlagged || flags.has(e.id))).sort(compareEntries),
    [entries, query, onlyFlagged, flags],
  );

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

      {entries.length > 0 && (
        <AuditPanel
          report={report}
          running={running}
          onRun={() => void run()}
          onlyFlagged={onlyFlagged}
          onToggleFlagged={() => setFlaggedOnly((v) => !v)}
        />
      )}

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
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
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
        <Card>
          <ul className="divide-y">
            {list.map((e) => {
              const secret = isSecret(e);
              return (
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
                        {secret && <Badge variant="secondary">Maxfiy</Badge>}
                        <AuditBadges flags={flags.get(e.id)} />
                        {e.hasTotp && (
                          <span title="2FA kodi bor" aria-label="2FA kodi bor" className="text-muted-foreground">
                            <ShieldCheck className="size-3.5" />
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
        </Card>
      )}

      {selected && <EntryDetailsDialog entry={selected} onClose={() => setSelectedId(null)} onDelete={remove} />}
    </>
  );
}
