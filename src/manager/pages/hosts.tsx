import { Loader2, Monitor } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";
import { listHosts, revokeHost, type HostInfo } from "../api";
import { PageTitle } from "./page-header";

export function HostsPage() {
  const [hosts, setHosts] = useState<HostInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setHosts(await listHosts());
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (h: HostInfo) => {
    setBusy(h.slot);
    try {
      await revokeHost(h.slot);
      toast.success("Host bekor qilindi");
      await load();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <>
      <PageTitle
        title="Hostlar"
        description="Qurilma bilan ulangan kompyuterlar (4 tagacha). Bekor qilingan kompyuter qayta ulanishi kerak bo'ladi."
      />
      {error ? (
        <div className="grid justify-items-start gap-3 rounded-xl border p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Qayta urinish
          </Button>
        </div>
      ) : hosts === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Yuklanmoqda
        </div>
      ) : hosts.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Ulangan hostlar yo'q</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {hosts.map((h) => (
            <li key={h.slot} className="flex items-center gap-3 px-4 py-3 animate-in fade-in-0">
              <span className="grid size-9 place-items-center rounded-md border bg-muted">
                <Monitor className="size-4" />
              </span>
              <div className="grid min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  Slot {h.slot + 1}
                  {h.current && <Badge variant="secondary">Bu kompyuter</Badge>}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">{h.fp}</span>
              </div>
              {confirming === h.slot ? (
                <div className="flex items-center gap-2 animate-in fade-in-0">
                  <span className="text-xs text-muted-foreground">
                    {h.current ? "Bu kompyuter ham uziladi. " : ""}Bekor qilinsinmi?
                  </span>
                  <Button size="sm" variant="ghost" disabled={busy === h.slot} onClick={() => setConfirming(null)}>
                    Yo'q
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy === h.slot} onClick={() => void revoke(h)}>
                    {busy === h.slot && <Loader2 className="animate-spin" />}
                    Ha
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(h.slot)}>
                  Bekor qilish
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
