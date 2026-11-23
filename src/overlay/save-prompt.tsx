import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { CONFIRM_TIMEOUT_MS } from "@/device/protocol";
import { describeError } from "@/lib/errors";
import type { HubResult, PendingSaveResponse } from "@/lib/messages";
import { closeOverlay, hub } from "./bridge";
import { ConfirmWait } from "./confirm-wait";

type View =
  | { kind: "loading" }
  | { kind: "ask"; site: string; username: string }
  | { kind: "waiting"; site: string; username: string; expiresAt: number }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function SavePrompt() {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    hub<PendingSaveResponse>({ type: "kalit:pending-save" })
      .then((r) => (r.prompt && r.site && r.username ? setView({ kind: "ask", site: r.site, username: r.username }) : closeOverlay()))
      .catch(() => closeOverlay());
  }, []);

  const decide = async (decision: "save" | "dismiss" | "never") => {
    if (decision === "save" && view.kind === "ask") {
      setView({ ...view, kind: "waiting", expiresAt: Date.now() + CONFIRM_TIMEOUT_MS });
    }
    try {
      await hub<HubResult>({ type: "kalit:save-decision", decision });
      if (decision !== "save") return closeOverlay();
      setView({ kind: "saved" });
      setTimeout(closeOverlay, 1200);
    } catch (e) {
      if (decision !== "save") return closeOverlay();
      setView({ kind: "error", message: describeError(e) });
      setTimeout(closeOverlay, 2500);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-200">
      {view.kind === "loading" && <div className="h-14" />}

      {view.kind === "ask" && (
        <div className="grid gap-3 p-3">
          <div className="flex items-start gap-2.5">
            <Logo className="mt-0.5" />
            <div className="grid min-w-0 flex-1">
              <span className="text-sm font-medium">Kalit'ga saqlansinmi?</span>
              <span className="truncate text-xs text-muted-foreground">
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
              className="mr-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Bu sayt uchun hech qachon
            </button>
            <Button size="sm" variant="ghost" onClick={() => decide("dismiss")}>
              Hozir emas
            </Button>
            <Button size="sm" onClick={() => decide("save")}>
              Saqlash
            </Button>
          </div>
        </div>
      )}

      {view.kind === "waiting" && <ConfirmWait subtitle={`${view.site} · ${view.username}`} expiresAt={view.expiresAt} />}

      {view.kind === "saved" && (
        <div className="flex items-center gap-2.5 p-3 text-sm animate-in fade-in-0">
          <span className="grid size-6 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-3.5" />
          </span>
          Qurilmaga saqlandi
        </div>
      )}

      {view.kind === "error" && <div className="p-3 text-sm text-destructive">{view.message}</div>}
    </div>
  );
}
