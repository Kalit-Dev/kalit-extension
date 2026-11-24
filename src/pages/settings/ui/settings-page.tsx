import { NavLink, Outlet } from "react-router";
import { cn } from "@/shared/lib/utils";
import { PageTitle } from "@/shared/ui/page-title";

const TABS = [
  { to: "/settings/general", label: "Umumiy" },
  { to: "/settings/hosts", label: "Hostlar" },
  { to: "/settings/security", label: "Xavfsizlik" },
  { to: "/settings/backup", label: "Zaxira" },
] as const;

/** Sozlamalar: sarlavha + route asosidagi tab'lar (sidebar'dagi ichki menyu bilan sinxron). */
export function SettingsLayout() {
  return (
    <div>
      <PageTitle title="Sozlamalar" description="Qurilma, ulangan kompyuterlar va xavfsizlik sozlamalari." />
      <nav aria-label="Sozlamalar bo'limlari" className="mb-6 flex gap-1 border-b">
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            replace
            className={({ isActive }) =>
              cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive ? "border-primary text-foreground" : "border-transparent",
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
