import { NavLink, Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { PageTitle } from "./page-header";

const TABS = [
  {
    to: "/settings/general",
    label: "Umumiy",
    description: "Qurilma, brauzer va ishonchli kalit sozlamalari.",
  },
  {
    to: "/settings/hosts",
    label: "Hostlar",
    description: "Qurilma bilan ulangan kompyuterlar (4 tagacha). Bekor qilingan kompyuter qayta ulanishi kerak bo'ladi.",
  },
  {
    to: "/settings/security",
    label: "Xavfsizlik",
    description: "Master parolni almashtirish. Yozuvlaringiz saqlanadi; o'zgarish qurilmada tasdiqlanishi mumkin.",
  },
] as const;

/** Sozlamalar: sarlavha + route asosidagi tab'lar (sidebar'dagi ichki menyu bilan sinxron). */
export function SettingsLayout() {
  const { pathname } = useLocation();
  const active = TABS.find((t) => pathname.startsWith(t.to)) ?? TABS[0];
  return (
    <div>
      <PageTitle title="Sozlamalar" />
      <nav aria-label="Sozlamalar bo'limlari" className="-mt-2 mb-5 flex gap-1 border-b">
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
      <p className="mb-5 text-sm text-muted-foreground">{active.description}</p>
      <Outlet />
    </div>
  );
}
