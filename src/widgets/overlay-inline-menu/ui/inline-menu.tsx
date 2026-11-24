import { ChevronRight, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmWait } from "@/entities/device";
import { Logo } from "@/shared/ui/logo";
import { CONFIRM_TIMEOUT_MS } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import type { HubResult, MatchesResponse, MatchItem } from "@/shared/api/messages";
import { closeOverlay, hub } from "@/shared/api/overlay-bridge";

type View =
  | { kind: "loading" }
  | { kind: "ready"; data: MatchesResponse }
  | { kind: "waiting"; entry: MatchItem; expiresAt: number }
  | { kind: "error"; message: string };

/** `otp`: sahifada 2FA kodi maydoni — faqat TOTP'li yozuvlar, tanlansa kod to'ldiriladi. */
export function InlineMenu({ otp = false }: { otp?: boolean }) {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    hub<MatchesResponse>({ type: "kalit:matches" })
      .then((data) => setView({ kind: "ready", data }))
      .catch((e: unknown) => setView({ kind: "error", message: describeError(e) }));
  }, []);

  const pick = async (entry: MatchItem) => {
    setView({ kind: "waiting", entry, expiresAt: Date.now() + CONFIRM_TIMEOUT_MS });
    try {
      await hub<HubResult>({ type: otp ? "kalit:totp" : "kalit:fill", id: entry.id });
      closeOverlay();
    } catch (e) {
      setView({ kind: "error", message: describeError(e) });
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
      {view.kind === "waiting" ? (
        <ConfirmWait subtitle={view.entry.username} expiresAt={view.expiresAt} />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Logo className="size-5 rounded" />
            <span className="text-xs font-medium">Kalit</span>
            {view.kind === "ready" && view.data.site && (
              <span className="truncate text-xs text-muted-foreground">· {view.data.site}</span>
            )}
          </div>

          {view.kind === "loading" && <div className="h-12" />}

          {view.kind === "error" && <Notice text={view.message} />}

          {view.kind === "ready" && view.data.state !== "unlocked" && (
            <Notice icon text="Kalit qulflangan — paneldan master parol bilan oching" />
          )}

          {view.kind === "ready" && view.data.state === "unlocked" && (
            <ul className="grid p-1">
              {(otp ? view.data.entries.filter((e) => e.hasTotp) : view.data.entries).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => pick(e)}
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
                      {e.username.charAt(0)}
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm">{e.username}</span>
                      {e.title && <span className="truncate text-xs text-muted-foreground">{e.title}</span>}
                    </span>
                    {otp && <span className="shrink-0 text-xs text-muted-foreground">Kodni to'ldirish</span>}
                    {otp ? <ShieldCheck className="size-4 text-muted-foreground" /> : null}
                    <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Notice({ text, icon }: { text: string; icon?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
      {icon && <Lock className="size-3.5 shrink-0" />}
      {text}
    </div>
  );
}
