import { Globe, LayoutGrid, Lock, ShieldCheck, StickyNote, type LucideIcon } from "lucide-react";
import type { EntryCategory } from "../model/category";

export const CATEGORY_META: Record<EntryCategory, { label: string; icon: LucideIcon }> = {
  all: { label: "Hammasi", icon: LayoutGrid },
  web: { label: "Veb", icon: Globe },
  secret: { label: "Maxfiy", icon: Lock },
  totp: { label: "2FA", icon: ShieldCheck },
  note: { label: "Eslatma", icon: StickyNote },
};
