import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/** Markazdagi modal oyna: fon bosilsa yoki Esc bosilsa yopiladi. Kontent `children` ichida o'z skrolini boshqaradi. */
export function Dialog({ title, description, onClose, children, className }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-0 duration-200" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[min(90vh,52rem)] w-full max-w-lg animate-in flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl duration-200 fade-in-0 zoom-in-95",
          className,
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 className="text-base leading-tight font-semibold">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
