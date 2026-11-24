import { CircleCheck, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { AuditReport } from "@/shared/api/device/protocol";
import { auditSummary, type AuditFlags } from "../model/audit";
import { Badge } from "@/shared/ui/badge";

interface AuditPanelProps {
  report: AuditReport | null;
  running: boolean;
  onRun: () => void;
  onlyFlagged: boolean;
  onToggleFlagged: () => void;
}

/** Parol sog'lig'i: tekshiruv qurilmada bajariladi, bu yerda faqat natija sonlari ko'rsatiladi. */
export function AuditPanel({ report, running, onRun, onlyFlagged, onToggleFlagged }: AuditPanelProps) {
  const summary = report ? auditSummary(report) : null;
  const Icon = report ? (summary ? ShieldAlert : CircleCheck) : ShieldCheck;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <Icon
        className={`size-4 shrink-0 ${report ? (summary ? "text-warning" : "text-success") : "text-muted-foreground"}`}
        aria-hidden
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b>Parol sog'lig'i</b>
        <span className="text-muted-foreground" aria-live="polite">
          {report
            ? summary ?? `${report.total} ta parolda takror yoki zaiflik topilmadi`
            : "Takroriy va zaif parollar qurilmada tekshiriladi; parollar qurilmadan chiqmaydi."}
        </span>
      </span>
      {report && summary && (
        <Button type="button" variant={onlyFlagged ? "secondary" : "outline"} size="sm" aria-pressed={onlyFlagged} onClick={onToggleFlagged}>
          Faqat muammolilar
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onRun} disabled={running}>
        {running && <Loader2 className="animate-spin" />}
        {report ? "Qayta tekshirish" : "Tekshirish"}
      </Button>
    </div>
  );
}

/** Ro'yxat qatoridagi belgilar. */
export function AuditBadges({ flags }: { flags: AuditFlags | undefined }) {
  if (!flags) return null;
  return (
    <>
      {flags.duplicate && <Badge variant="warning">Takroriy</Badge>}
      {flags.weak && <Badge variant="warning">Zaif</Badge>}
    </>
  );
}
