import { KeyRound, Lock, Monitor, Plug, Settings, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ConfirmOverlay } from "@/sidepanel/components/confirm-overlay";
import { useDevice, type Phase } from "@/store/device-store";

const FLOW: Record<Exclude<Phase, "unlocked">, string[]> = {
  disconnected: ["/connect"],
  connecting: ["/connect"],
  pairing: ["/pair"],
  factory: ["/setup", "/setup/done"],
  locked: ["/unlock"],
};
const UNLOCKED = ["/vault", "/vault/new", "/hosts", "/security", "/settings"];
const isUnlockedPath = (p: string) => UNLOCKED.includes(p) || /^\/vault\/[^/]+\/edit$/.test(p);

const STATUS: Record<Phase, { label: string; dot: string }> = {
  disconnected: { label: "Ulanmagan", dot: "bg-muted-foreground/40" },
  connecting: { label: "Ulanmoqda", dot: "bg-warning animate-pulse" },
  pairing: { label: "Ulash kerak", dot: "bg-warning" },
  factory: { label: "Sozlanmagan", dot: "bg-warning" },
  locked: { label: "Qulflangan", dot: "bg-warning" },
  unlocked: { label: "Ochiq", dot: "bg-success" },
};

const NAV = [
  { to: "/vault", label: "Parollar", icon: KeyRound },
  { to: "/hosts", label: "Hostlar", icon: Monitor },
  { to: "/security", label: "Xavfsizlik", icon: ShieldCheck },
  { to: "/settings", label: "Sozlamalar", icon: Settings },
];

export function ManagerShell() {
  const phase = useDevice((s) => s.phase);
  const kind = useDevice((s) => s.kind);
  const count = useDevice((s) => s.entries.length);
  const lock = useDevice((s) => s.lock);
  const disconnect = useDevice((s) => s.disconnect);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (phase === "unlocked") {
      if (!isUnlockedPath(pathname)) navigate("/vault", { replace: true });
    } else if (!FLOW[phase].includes(pathname)) {
      navigate(FLOW[phase][0]!, { replace: true });
    }
  }, [phase, pathname, navigate]);

  const status = STATUS[phase];
  const fail = (e: unknown) => toast.error(describeError(e));

  const statusBadge = (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", status.dot)} />
      {status.label}
      {kind && <span className="text-muted-foreground/60">· {kind === "usb" ? "USB" : "Demo"}</span>}
    </Badge>
  );

  if (phase !== "unlocked") {
    return (
      <div className="relative flex min-h-full flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-6">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Kalit</span>
          <span className="ml-auto">{statusBadge}</span>
        </header>
        <main className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-sm">
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
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3 max-md:w-16 max-md:items-center">
        <div className="mb-4 flex items-center gap-2 px-2 pt-1">
          <Logo />
          <span className="text-sm font-semibold tracking-tight max-md:hidden">Kalit</span>
        </div>
        <nav className="grid gap-0.5" aria-label="Asosiy menyu">
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
        </nav>
        <div className="mt-auto grid gap-2">
          <div className="px-1 max-md:hidden">{statusBadge}</div>
          <Button variant="ghost" size="sm" className="justify-start max-md:justify-center" title="Qulflash" onClick={() => lock().catch(fail)}>
            <Lock /> <span className="max-md:hidden">Qulflash</span>
          </Button>
          <Button variant="ghost" size="sm" className="justify-start max-md:justify-center" title="Uzish" onClick={() => disconnect().catch(fail)}>
            <Plug /> <span className="max-md:hidden">Uzish</span>
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl animate-in fade-in-0 slide-in-from-bottom-1 p-6 duration-300">
          <Outlet />
        </div>
      </main>
      <ConfirmOverlay centered />
      <Toaster />
    </div>
  );
}
