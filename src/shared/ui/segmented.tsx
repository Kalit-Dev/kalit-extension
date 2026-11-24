import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Yorliq yonida kichik son (masalan, toifadagi yozuvlar soni). */
  count?: number;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Kichik variant (forma maydoni yonida). */
  compact?: boolean;
  /** To'liq kenglikda teng bo'lingan tanlov. */
  fill?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Segmentli tanlov (radiogroup). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  compact,
  fill,
  disabled,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "gap-1 rounded-lg border bg-muted/60 p-1",
        fill ? "grid" : "inline-flex",
        compact && "gap-0.5 rounded-md p-0.5",
        className,
      )}
      style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map(({ value: v, label: text, icon: Icon, count }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md font-medium text-muted-foreground outline-none transition-all",
            "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
            compact ? "rounded-[5px] px-2.5 py-0.5 text-xs" : "px-3 py-2 text-sm",
            value === v && "bg-background text-foreground shadow-sm ring-1 ring-border",
          )}
        >
          {Icon && <Icon className={compact ? "size-3.5" : "size-4"} />}
          {text}
          {count !== undefined && (
            <span className="text-xs font-normal tabular-nums opacity-60" aria-label={`${count} ta`}>
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
