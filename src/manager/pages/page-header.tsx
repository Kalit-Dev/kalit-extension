import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface PageTitleProps {
  title: string;
  description?: string;
  /** Orqaga havola (breadcrumb): ichki sahifalarda yuqorida ko'rsatiladi. */
  back?: { to: string; label: string };
  actions?: ReactNode;
}

/** Standart sahifa sarlavhasi: breadcrumb, h1, tavsif va o'ngda asosiy amallar. */
export function PageTitle({ title, description, back, actions }: PageTitleProps) {
  return (
    <header className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="-ml-1 mb-2 inline-flex items-center gap-0.5 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
