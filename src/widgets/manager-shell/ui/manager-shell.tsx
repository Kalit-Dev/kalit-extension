import { ChevronRight, KeyRound, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ConfirmOverlay, DeviceStatusBadge, useDevice, type Phase } from "@/entities/device";
import { DisconnectButton, LockButton } from "@/features/device-session";
import { ThemeSwitcher } from "@/features/theme-switcher";
import { cn } from "@/shared/lib/utils";
import { Logo } from "@/shared/ui/logo";
import { Toaster } from "@/shared/ui/sonner";

const FLOW: Record<Exclude<Phase, "unlocked">, string[]> = {
  disconnected: ["/connect"],
  connecting: ["/connect"],
  pairing: ["/pair"],
  factory: ["/setup", "/setup/done"],
  locked: ["/unlock"],
};
const UNLOCKED = ["/vault", "/vault/new", "/hosts", "/import", "/security"]; // /hosts va /security -> /settings/* ga yo'naltiriladi
const isUnlockedPath = (p: string) =>
  UNLOCKED.includes(p) || p === "/settings" || p.startsWith("/settings/") || /^\/vault\/[^/]+\/edit$/.test(p);

const NAV = [
  { to: "/vault", label: "Parollar", icon: KeyRound },
];

const SETTINGS_NAV = [
  { to: "/settings/general", label: "Umumiy" },
  { to: "/settings/hosts", label: "Hostlar" },
  { to: "/settings/import", label: "Import" },
  { to: "/settings/security", label: "Xavfsizlik" },
  { to: "/settings/backup", label: "Zaxira" },
];

/** Boshqaruv sahifasi qobig'i: qurilma holatiga qarab oqim (flow) yoki asosiy sidebar + kontent. */
export function ManagerShell() {
  const phase = useDevice((s) => s.phase);
  const count = useDevice((s) => s.entries.length);
  const firmware = useDevice((s) => s.status?.firmware);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inSettings = pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(inSettings);
  useEffect(() => {
    if (inSettings) setSettingsOpen(true);
  }, [inSettings]);

  useEffect(() => {
    if (pathname === "/firmware") return; // yangilash paytida qurilma uziladi: bu sahifa faza yo'naltirishidan tashqarida
    if (phase === "unlocked") {
      if (!isUnlockedPath(pathname)) navigate("/vault", { replace: true });
    } else if (!FLOW[phase].includes(pathname)) {
      navigate(FLOW[phase][0]!, { replace: true });
    }
  }, [phase, pathname, navigate]);

  const statusBadge = <DeviceStatusBadge />;

  if (phase !== "unlocked") {
    return (
      <div className="relative flex min-h-full flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-6">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Kalit</span>
          <span className="ml-auto flex items-center gap-2">
            {statusBadge}
            <ThemeSwitcher variant="outline" />
          </span>
        </header>
        <main className="grid flex-1 place-items-center p-6">
          <div key={pathname} className="w-full max-w-md animate-in rounded-2xl border bg-card shadow-sm duration-300 fade-in-0 slide-in-from-bottom-1">
            <Outlet />
          </div>
        </main>
        <ConfirmOverlay centered />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30 max-md:w-16">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-5 max-md:justify-center max-md:px-0">
          <Logo />
          <span className="text-sm font-semibold tracking-tight max-md:hidden">Kalit</span>
        </div>
        <nav className="grid gap-0.5 p-3" aria-label="Asosiy menyu">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:justify-center",
                  isActive && "bg-accent font-medium text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              <span className="max-md:hidden">{label}</span>
              {to === "/vault" && (
                <span className="ml-auto text-xs tabular-nums text-muted-foreground max-md:hidden">{count}</span>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            aria-expanded={settingsOpen}
            aria-controls="settings-nav"
            title="Sozlamalar"
            onClick={() => {
              if (!settingsOpen && !inSettings) navigate("/settings/general");
              setSettingsOpen((o) => !o);
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-md:justify-center",
              inSettings && "text-foreground",
            )}
          >
            <Settings className="size-4" />
            <span className="max-md:hidden">Sozlamalar</span>
            <ChevronRight
              className={cn("ml-auto size-3.5 transition-transform max-md:hidden", settingsOpen && "rotate-90")}
              aria-hidden
            />
          </button>
          {settingsOpen && (
            <div id="settings-nav" className="grid animate-in gap-0.5 duration-150 fade-in-0 slide-in-from-top-1 max-md:hidden">
              {SETTINGS_NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md py-1.5 pr-2.5 pl-9 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      isActive && "bg-accent font-medium text-foreground",
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
        <footer className="mt-auto grid gap-3 border-t p-3 text-xs text-muted-foreground">
          <DisconnectButton className="w-full" />
          <div className="grid gap-0.5 px-2 max-md:hidden">
            <span className="flex justify-between">
              <span>Qurilma</span>
              <span className="font-mono">{firmware ? `v${firmware}` : "—"}</span>
            </span>
            <span className="flex justify-between">
              <span>Extension</span>
              <span className="font-mono">v{chrome.runtime.getManifest().version}</span>
            </span>
          </div>
        </footer>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b px-6">
          {statusBadge}
          <ThemeSwitcher variant="outline" />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <LockButton variant="outline" />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div key={pathname} className="mx-auto w-full max-w-3xl animate-in px-6 py-8 duration-300 fade-in-0 slide-in-from-bottom-1">
            <Outlet />
          </div>
        </main>
      </div>
      <ConfirmOverlay centered />
      <Toaster />
    </div>
  );
}
