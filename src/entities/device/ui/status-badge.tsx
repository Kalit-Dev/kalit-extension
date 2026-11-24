import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import { PHASE_STATUS } from "../model/status";
import { useDevice } from "../model/store";

/** Qurilma ulanish holati nishoni (shell sarlavhalarida). */
export function DeviceStatusBadge({ className }: { className?: string }) {
  const phase = useDevice((s) => s.phase);
  const kind = useDevice((s) => s.kind);
  const status = PHASE_STATUS[phase];
  return (
    <Badge variant="outline" className={cn("font-normal text-muted-foreground", className)}>
      <span className={cn("size-1.5 rounded-full", status.dot)} />
      {status.label}
      {kind && <span className="text-muted-foreground/60">· USB</span>}
    </Badge>
  );
}
