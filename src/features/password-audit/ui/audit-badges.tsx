import type { AuditFlags } from "../model/audit";
import { Badge } from "@/shared/ui/badge";

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
