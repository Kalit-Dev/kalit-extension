import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveTheme, setTheme, useTheme, type Theme } from "@/shared/lib/theme";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

const OPTIONS = [
  { value: "light", label: "Yorug'", icon: Sun },
  { value: "dark", label: "Qorong'i", icon: Moon },
  { value: "system", label: "Tizim", icon: Monitor },
] as const satisfies readonly { value: Theme; label: string; icon: typeof Sun }[];

/** Mavzu tanlash dropdown'i: yorug' / qorong'i / tizim. */
export function ThemeSwitcher({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const CurrentIcon = theme === "system" ? Monitor : resolveTheme(theme) === "dark" ? Moon : Sun;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button
        variant={variant}
        size="icon-sm"
        aria-label="Mavzu"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mavzu"
        onClick={() => setOpen((o) => !o)}
      >
        <CurrentIcon />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Mavzu"
          className="absolute right-0 top-full z-50 mt-1.5 w-40 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Mavzu</p>
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                theme === value && "font-medium",
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
              {theme === value && <Check className="ml-auto size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
