import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmWait } from "@/entities/device";
import { Logo } from "@/shared/ui/logo";
import { Button } from "@/shared/ui/button";
import { CONFIRM_TIMEOUT_MS } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import type { HubResult, PendingSaveResponse } from "@/shared/api/messages";
import { closeOverlay, hub } from "@/shared/api/overlay-bridge";

type View =
  | { kind: "loading" }
  | { kind: "ask"; site: string; username: string; update: boolean }
  | { kind: "waiting"; site: string; username: string; update: boolean; expiresAt: number }
  | { kind: "saved"; update: boolean }
  | { kind: "error"; message: string };

export function SavePrompt() {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    hub<PendingSaveResponse>({ type: "kalit:pending-save" })
      .then((r) => (r.prompt && r.site && r.username ? setView({ kind: "ask", site: r.site, username: r.username, update: !!r.update }) : closeOverlay()))
      .catch(() => closeOverlay());
  }, []);

  const decide = async (decision: "save" | "dismiss" | "never") => {
    if (decision === "save" && view.kind === "ask") {
      setView({ ...view, kind: "waiting", expiresAt: Date.now() + CONFIRM_TIMEOUT_MS });
    }
    try {
      await hub<HubResult>({ type: "kalit:save-decision", decision });
      if (decision !== "save") return closeOverlay();
      setView({ kind: "saved", update: view.kind === "waiting" && view.update });
      setTimeout(closeOverlay, 1200);
    } catch (e) {
      if (decision !== "save") return closeOverlay();
      setView({ kind: "error", message: describeError(e) });
      setTimeout(closeOverlay, 2500);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
      {view.kind === "loading" && <div className="h-14" />}

      {view.kind === "ask" && (
        <div className="grid gap-3 p-3">
          <div className="flex items-start gap-2.5">
            <Logo className="mt-0.5" />
            <div className="grid min-w-0 flex-1">
              <span className="text-sm font-medium">{view.update ? "Yangilansinmi?" : "Kalit'ga saqlansinmi?"}</span>
              <span className="truncate text-xs text-muted-foreground">
                {view.update ? "Parol o'zgargan bo'lishi mumkin · " : ""}
                {view.site} · {view.username}
              </span>
            </div>
            <button
              type="button"
              aria-label="Yopish"
              onClick={() => decide("dismiss")}
              className="-m-1 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => decide("never")}
              title="Bu sayt uchun hech qachon taklif qilinmasin"
              className="mr-auto whitespace-nowrap rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Hech qachon
            </button>
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => decide("dismiss")}>
              Hozir emas
            </Button>
            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => decide("save")}>
              {view.update ? "Yangilash" : "Saqlash"}
            </Button>
          </div>
        </div>
      )}

      {view.kind === "waiting" && <ConfirmWait subtitle={`${view.site} · ${view.username}`} expiresAt={view.expiresAt} />}

      {view.kind === "saved" && (
        <div className="flex items-center gap-2.5 p-3 text-sm">
          <span className="grid size-6 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-3.5" />
          </span>
          {view.update ? "Qurilmada yangilandi" : "Qurilmaga saqlandi"}
        </div>
      )}

      {view.kind === "error" && <div className="p-3 text-sm text-destructive">{view.message}</div>}
    </div>
  );
}
