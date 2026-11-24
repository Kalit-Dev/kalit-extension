import { Check, Globe, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type Kind = "web" | "secret";

const OPTIONS: readonly { value: Kind; icon: LucideIcon; title: string; description: string }[] = [
  {
    value: "web",
    icon: Globe,
    title: "Veb sayt",
    description: "Saytga bog'lanadi; kirish formasi avtomatik to'ldiriladi.",
  },
  {
    value: "secret",
    icon: Lock,
    title: "Maxfiy yozuv",
    description: "Wi-Fi, SSH kaliti, E-IMZO paroli kabi saytga bog'lanmagan sirlar.",
  },
];

/** Yozuv turini tanlash: ikki katta kartochka (radiogroup). */
export function KindPicker({ value, onChange }: { value: Kind; onChange: (kind: Kind) => void }) {
  return (
    <div role="radiogroup" aria-label="Yozuv turi" className="grid gap-3 sm:grid-cols-2">
      {OPTIONS.map(({ value: v, icon: Icon, title, description }) => {
        const checked = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(v)}
            className={cn(
              "flex items-start gap-3.5 rounded-2xl border bg-card p-4 text-left shadow-sm outline-none transition-colors",
              "hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
              checked && "border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5",
            )}
          >
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/60 transition-colors [&_svg]:size-5",
                checked && "border-primary/40 bg-primary/10",
              )}
            >
              <Icon aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-sm font-semibold leading-tight">{title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
            >
              {checked && <Check className="size-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
