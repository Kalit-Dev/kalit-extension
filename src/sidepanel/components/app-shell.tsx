import { Lock, Settings } from "lucide-react";
import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useDevice, type Phase } from "@/store/device-store";
import { ConfirmOverlay } from "./confirm-overlay";

/** Har bir qurilma holatida qaysi sahifalar ochiq bo'lishi mumkin (birinchisi — default). */
const ROUTES: Record<Phase, string[]> = {
  disconnected: ["/connect"],
  connecting: ["/connect"],
  pairing: ["/pair"],
  factory: ["/setup", "/setup/done"],
  locked: ["/unlock"],
  unlocked: ["/vault", "/vault/new", "/settings"],
};

const STATUS: Record<Phase, { label: string; dot: string }> = {
  disconnected: { label: "Ulanmagan", dot: "bg-muted-foreground/40" },
  connecting: { label: "Ulanmoqda", dot: "bg-warning animate-pulse" },
  pairing: { label: "Ulash kerak", dot: "bg-warning" },
  factory: { label: "Sozlanmagan", dot: "bg-warning" },
  locked: { label: "Qulflangan", dot: "bg-warning" },
  unlocked: { label: "Ochiq", dot: "bg-success" },
};

export function AppShell() {
  const phase = useDevice((s) => s.phase);
  const kind = useDevice((s) => s.kind);
  const lock = useDevice((s) => s.lock);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Holat o'zgarsa — mos sahifaga yo'naltirish (route guard).
  useEffect(() => {
    const allowed = ROUTES[phase];
    if (!allowed.includes(pathname)) navigate(allowed[0]!, { replace: true });
  }, [phase, pathname, navigate]);

  const status = STATUS[phase];

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Logo />
        <span className="text-sm font-semibold tracking-tight">Kalit</span>

        <Badge variant="outline" className="ml-auto font-normal text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", status.dot)} />
          {status.label}
          {kind && <span className="text-muted-foreground/60">· {kind === "usb" ? "USB" : "Demo"}</span>}
        </Badge>

        {phase === "unlocked" && (
          <div className="flex">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link to="/settings" aria-label="Sozlamalar">
                <Settings />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Qulflash"
              onClick={() => lock().catch((e: unknown) => toast.error(describeError(e)))}
            >
              <Lock />
            </Button>
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <ConfirmOverlay />
      <Toaster />
    </div>
  );
}
