import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
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

/** Segmentli tanlov: shadcn ToggleGroup (single). Tanlangan elementni qayta bosish tanlovni olib tashlamaydi. */
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
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      disabled={disabled}
      spacing={1}
      className={cn("rounded-lg border bg-muted/60 p-1", fill ? "w-full" : "w-fit", compact && "rounded-md p-0.5", className)}
    >
      {options.map(({ value: v, label: text, icon: Icon }) => (
        <ToggleGroupItem
          key={v}
          value={v}
          className={cn(
            "rounded-md text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-border",
            fill && "flex-1",
            compact ? "h-7 rounded-[5px] px-2.5 text-xs" : "h-9 px-3",
          )}
        >
          {Icon && <Icon className={compact ? "size-3.5" : "size-4"} />}
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
