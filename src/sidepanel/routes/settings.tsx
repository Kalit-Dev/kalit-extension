import { ChevronLeft, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";
import { getHostId, getNeverSave, removeNeverSave } from "@/lib/storage";
import { useDevice } from "@/store/device-store";
import { PageHeader } from "../components/screen";

export function SettingsPage() {
  const status = useDevice((s) => s.status);
  const kind = useDevice((s) => s.kind);
  const count = useDevice((s) => s.entries.length);
  const lock = useDevice((s) => s.lock);
  const disconnect = useDevice((s) => s.disconnect);
  const [never, setNever] = useState<string[]>([]);
  const [hostId, setHostId] = useState("");

  useEffect(() => {
    void getNeverSave().then(setNever);
    void getHostId().then(setHostId);
  }, []);

  return (
    <div className="animate-in fade-in-0">
      <PageHeader
        title="Sozlamalar"
        back={
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/vault" aria-label="Orqaga">
              <ChevronLeft />
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 px-4 pt-2 pb-6">
        <Group title="Qurilma">
          <Row label="Ulanish" value={kind === "usb" ? "USB" : "Demo (simulyator)"} />
          <Row label="Firmware" value={status?.firmware ?? "—"} mono />
          <Row label="Yozuvlar" value={String(count)} />
          <Row label="Bu kompyuter ID" value={hostId.slice(0, 8)} mono />
        </Group>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => lock().catch((e: unknown) => toast.error(describeError(e)))}>
            Qulflash
          </Button>
          <Button variant="outline" onClick={() => void disconnect()}>
            Uzish
          </Button>
        </div>

        <Group title="Saqlash taklif qilinmaydigan saytlar">
          {never.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Ro'yxat bo'sh</p>
          ) : (
            never.map((site) => (
              <div key={site} className="flex items-center justify-between px-3 py-1.5">
                <span className="truncate text-sm">{site}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${site} ni olib tashlash`}
                  onClick={async () => {
                    await removeNeverSave(site);
                    setNever((l) => l.filter((s) => s !== site));
                  }}
                >
                  <X />
                </Button>
              </div>
            ))
          )}
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h2 className="px-1 text-xs font-medium text-muted-foreground">{title}</h2>
      <div className="divide-y rounded-lg border">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : undefined}>{value}</span>
    </div>
  );
}
