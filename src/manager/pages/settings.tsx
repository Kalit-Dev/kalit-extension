import { bytesToHex } from "@noble/hashes/utils.js";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { forgetDevice, getHostKeyPair } from "@/device/keys";
import { getNeverSave, removeNeverSave } from "@/lib/storage";
import { useDevice } from "@/store/device-store";
import { PageTitle } from "./page-header";

export function SettingsPage() {
  const status = useDevice((s) => s.status);
  const count = useDevice((s) => s.entries.length);
  const [never, setNever] = useState<string[]>([]);
  const [hostKey, setHostKey] = useState("");

  useEffect(() => {
    void getNeverSave().then(setNever);
    void getHostKeyPair().then((k) => setHostKey(bytesToHex(k.pub).slice(0, 16)));
  }, []);

  return (
    <div className="grid max-w-2xl gap-8">
      <PageTitle title="Sozlamalar" />
      <Group title="Qurilma">
        <Row label="Ulanish" value="USB" />
        <Row label="Firmware" value={status?.firmware ?? "—"} mono />
        <Row label="Yozuvlar" value={String(count)} />
        <Row label="Bu kompyuter kaliti" value={hostKey} mono />
      </Group>

      <Group title="Saqlash taklif qilinmaydigan saytlar">
        {never.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Ro'yxat bo'sh</p>
        ) : (
          never.map((site) => (
            <div key={site} className="flex items-center justify-between px-4 py-1.5">
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

      <Group title="Qurilma kalitini unutish">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Qurilma almashtirilgan yoki zavod holatiga qaytarilgan bo'lsa, eski ishonchli kalit o'chiriladi.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void forgetDevice().then(() => toast.success("Qurilma kaliti unutildi"))}
          >
            Unutish
          </Button>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-xs font-medium text-muted-foreground">{title}</h2>
      <div className="divide-y rounded-xl border bg-card">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : undefined}>{value}</span>
    </div>
  );
}
