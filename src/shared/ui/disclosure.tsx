import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface DisclosureProps {
  id: string;
  icon: LucideIcon;
  title: string;
  /** Yopiq holatda sarlavha ostida ko'rinadigan qisqa holat ("Qo'shilmagan", "O'rnatilgan"...). */
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Ixcham: kichikroq paddinglar (panel ichida). */
  dense?: boolean;
}

/**
 * Yig'iladigan qator (ro'yxat ichida). Panel yopiq paytda ham DOM'da qoladi (`hidden`), shuning uchun
 * ichidagi forma maydonlari qiymatini yo'qotmaydi.
 */
export function Disclosure({ id, icon: Icon, title, summary, open, onToggle, children, dense }: DisclosureProps) {
  return (
    <div className="border-b last:border-b-0">
      <h3>
        <button
          type="button"
          id={`${id}-trigger`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className={cn("flex w-full items-center gap-3.5 px-6 py-4 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50", dense && "gap-3 px-4 py-3")}
        >
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 [&_svg]:size-4", dense && "size-8")}>
            <Icon aria-hidden />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-sm font-medium leading-tight">{title}</span>
            {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        hidden={!open}
        className={cn("animate-in px-6 pt-2 pb-5 duration-200 fade-in-0 slide-in-from-top-1", dense && "px-4 pb-4")}
      >
        {children}
      </div>
    </div>
  );
}
