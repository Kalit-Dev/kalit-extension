import { ChevronRight, KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { useDevice } from "@/entities/device";
import { categoryCounts, CATEGORY_META, resolveCategory, visibleCategories, type EntryCategory } from "@/entities/entry";
import { cn } from "@/shared/lib/utils";

const ROW =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-md:justify-center";

const toCategory = (c: EntryCategory) => (c === "all" ? "/vault" : `/vault?type=${c}`);

/**
 * "Parollar" bo'limi. Yozuvlar bir necha turda bo'lsa — "Sozlamalar" kabi ochiladigan guruh (standart ochiq)
 * va ichida toifalar (Hammasi / Veb / Maxfiy / 2FA / Eslatma) sonlari bilan; aks holda oddiy havola.
 */
export function VaultNav() {
  const entries = useDevice((s) => s.entries);
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const counts = useMemo(() => categoryCounts(entries), [entries]);
  const categories = visibleCategories(counts);
  const inVault = pathname.startsWith("/vault");
  const active = resolveCategory(params.get("type"), counts);

  if (categories.length === 0) {
    return (
      <NavLink
        to="/vault"
        title="Parollar"
        className={({ isActive }) => cn(ROW, isActive && "bg-accent font-medium text-foreground")}
      >
        <KeyRound className="size-4" />
        <span className="max-md:hidden">Parollar</span>
        <span className="ml-auto text-xs tabular-nums max-md:hidden">{counts.all}</span>
      </NavLink>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="vault-nav"
        title="Parollar"
        onClick={() => {
          if (!open && !inVault) navigate("/vault");
          setOpen((o) => !o);
        }}
        className={cn(ROW, "w-full text-left", inVault && "text-foreground")}
      >
        <KeyRound className="size-4" />
        <span className="max-md:hidden">Parollar</span>
        <span className="ml-auto flex items-center gap-2 max-md:hidden">
          {!open && <span className="text-xs tabular-nums text-muted-foreground">{counts.all}</span>}
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
        </span>
      </button>
      {open && (
        <div id="vault-nav" className="grid animate-in gap-0.5 duration-150 fade-in-0 slide-in-from-top-1 max-md:hidden">
          {categories.map((c) => {
            const { label, icon: Icon } = CATEGORY_META[c];
            const isActive = pathname === "/vault" && active === c;
            return (
              <Link
                key={c}
                to={toCategory(c)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md py-1.5 pr-2.5 pl-9 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive && "bg-accent font-medium text-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {label}
                <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">{counts[c]}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
