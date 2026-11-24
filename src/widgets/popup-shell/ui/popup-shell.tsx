import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { ConfirmOverlay, DeviceStatusBadge, useDevice, type Phase } from "@/entities/device";
import { LockButton } from "@/features/device-session";
import { ThemeSwitcher } from "@/features/theme-switcher";
import { openManager } from "@/shared/lib/open-manager";
import { Button } from "@/shared/ui/button";
import { Logo } from "@/shared/ui/logo";
import { Toaster } from "@/shared/ui/sonner";

/** Har bir qurilma holatida qaysi sahifalar ochiq bo'lishi mumkin (birinchisi — default). */
const ROUTES: Record<Phase, string[]> = {
  disconnected: ["/connect"],
  connecting: ["/connect"],
  pairing: ["/connect"],
  factory: ["/connect"],
  locked: ["/unlock"],
  unlocked: ["/vault"],
};

export function PopupShell() {
  const phase = useDevice((s) => s.phase);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Holat o'zgarsa — mos sahifaga yo'naltirish (route guard).
  useEffect(() => {
    const allowed = ROUTES[phase];
    if (!allowed.includes(pathname)) navigate(allowed[0]!, { replace: true });
  }, [phase, pathname, navigate]);

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Logo />
        <span className="text-sm font-semibold tracking-tight">Kalit</span>

        <DeviceStatusBadge className="ml-auto h-6 px-1.5 text-[11px]" />
        <ThemeSwitcher variant="outline" />

        {phase === "unlocked" && (
          <>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Boshqaruvni ochish"
              title="Boshqaruvni ochish"
              onClick={() => void openManager()}
            >
              <ExternalLink />
            </Button>
            <LockButton variant="outline" />
          </>
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
