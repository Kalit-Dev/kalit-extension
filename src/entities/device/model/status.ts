import type { Phase } from "@/shared/api/engine/protocol";

/** Qurilma bosqichi -> foydalanuvchiga ko'rinadigan holat (matn va indikator rangi). */
export const PHASE_STATUS: Record<Phase, { label: string; dot: string }> = {
  disconnected: { label: "Ulanmagan", dot: "bg-muted-foreground/40" },
  connecting: { label: "Ulanmoqda", dot: "bg-warning animate-pulse" },
  pairing: { label: "Ulash kerak", dot: "bg-warning" },
  factory: { label: "Sozlanmagan", dot: "bg-warning" },
  locked: { label: "Qulflangan", dot: "bg-warning" },
  unlocked: { label: "Ochiq", dot: "bg-success" },
};
