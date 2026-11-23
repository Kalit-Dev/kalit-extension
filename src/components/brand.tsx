import { KeyRound } from "lucide-react";
import { useState } from "react";
import { faviconUrl } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-6 place-items-center rounded-md bg-primary text-primary-foreground", className)}>
      <KeyRound className="size-3.5" strokeWidth={2.5} />
    </span>
  );
}

export function SiteAvatar({ site, className }: { site: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-xs font-semibold uppercase text-muted-foreground",
        className,
      )}
    >
      {failed ? (
        site.charAt(0)
      ) : (
        <img src={faviconUrl(site)} alt="" className="size-4" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
