import { Loader2, Monitor, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import type { HostInfo } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardDescription, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";

/** Qurilma bilan ulangan kompyuterlar ro'yxati va ularni bekor qilish. */
export function HostList() {
  const listHosts = useDevice((s) => s.listHosts);
  const revokeHost = useDevice((s) => s.revokeHost);
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
  }, [listHosts]);

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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardIcon>
          <Monitor />
        </CardIcon>
        <div>
          <CardTitle>Ulangan kompyuterlar</CardTitle>
          <CardDescription>
            Qurilma bilan ulangan kompyuterlar (4 tagacha). Bekor qilingan kompyuter qayta ulanishi kerak bo'ladi.
          </CardDescription>
        </div>
      </CardHeader>

      {error ? (
        <div className="grid justify-items-start gap-3 px-6 py-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Qayta urinish
          </Button>
        </div>
      ) : hosts === null ? (
        <div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Yuklanmoqda
        </div>
      ) : hosts.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">Ulangan hostlar yo'q</p>
      ) : (
        <ul className="divide-y">
          {hosts.map((h) => (
            <li key={h.slot} className="flex animate-in flex-wrap items-center gap-3 px-6 py-4 fade-in-0">
              <span className="grid size-9 place-items-center rounded-md border bg-muted">
                <Monitor className="size-4" />
              </span>
              <div className="grid min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  Slot {h.slot + 1}
                  {h.current && <Badge variant="secondary">Bu kompyuter</Badge>}
                </span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {h.fp}
                </span>
              </div>
              {confirming === h.slot ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {h.current ? "Bu kompyuter ham uziladi. " : ""}Bekor qilinsinmi?
                  </span>
                  <Button size="sm" variant="outline" disabled={busy === h.slot} onClick={() => setConfirming(null)}>
                    Yo'q
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy === h.slot} onClick={() => void revoke(h)}>
                    {busy === h.slot && <Loader2 className="animate-spin" />}
                    Ha
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(h.slot)}>
                  <ShieldOff /> Bekor qilish
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
