import { bytesToHex } from "@noble/hashes/utils.js";
import { Cpu, EyeOff, RotateCcw, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { forgetDevice, getHostKeyPair } from "@/shared/api/device/keys";
import { getNeverSave, removeNeverSave } from "@/shared/lib/storage";
import { Button } from "@/shared/ui/button";
import { Card, CardDescription, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";

export function SettingsGeneralPage() {
  const status = useDevice((s) => s.status);
  const count = useDevice((s) => s.entries.length);
  const [never, setNever] = useState<string[]>([]);
  const [hostKey, setHostKey] = useState("");

  useEffect(() => {
    void getNeverSave().then(setNever);
    void getHostKeyPair().then((k) => setHostKey(bytesToHex(k.pub).slice(0, 16)));
  }, []);

  return (
    <div className="grid max-w-2xl gap-5">
      <Group icon={<Cpu />} title="Qurilma" description="Ulangan Kalit qurilmasi haqida ma'lumot.">
        <div className="divide-y">
          <Row label="Ulanish" value="USB" />
          <Row
            label="Firmware"
            value={status?.firmware ?? "—"}
            mono
            action={
              <Link to="/firmware" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                Yangilash
              </Link>
            }
          />
          <Row label="Yozuvlar" value={String(count)} />
          <Row label="Bu kompyuter kaliti" value={hostKey} mono />
        </div>
      </Group>

      <Group
        icon={<EyeOff />}
        title="Saqlash taklif qilinmaydigan saytlar"
        description="Bu saytlarda Kalit yangi parolni saqlashni taklif qilmaydi."
      >
        {never.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Ro'yxat bo'sh</p>
        ) : (
          <div className="divide-y">
            {never.map((site) => (
              <div key={site} className="flex items-center justify-between px-6 py-2">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm">{site}</span>
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
            ))}
          </div>
        )}
      </Group>

      <Group
        icon={<RotateCcw />}
        title="Qurilma kalitini unutish"
        description="Qurilma almashtirilgan yoki zavod holatiga qaytarilgan bo'lsa, eski ishonchli kalit o'chiriladi."
      >
        <div className="flex justify-end px-6 py-4">
          <Button
            variant="outline"
            onClick={() => void forgetDevice().then(() => toast.success("Qurilma kaliti unutildi"))}
          >
            Unutish
          </Button>
        </div>
      </Group>
    </div>
  );
}

function Group({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardIcon>{icon}</CardIcon>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

function Row({ label, value, mono, action }: { label: string; value: string; mono?: boolean; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-3">
        <span className={mono ? "font-mono text-xs" : undefined}>{value}</span>
        {action}
      </span>
    </div>
  );
}
