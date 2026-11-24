import { useState } from "react";
import { faviconUrl } from "@/shared/lib/domain";
import { cn } from "@/shared/lib/utils";

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
