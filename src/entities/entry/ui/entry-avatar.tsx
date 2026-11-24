import { Lock } from "lucide-react";
import type { EntryMeta } from "@/shared/api/device/protocol";
import { cn } from "@/shared/lib/utils";
import { isSecret } from "../model/entry";
import { SiteAvatar } from "./site-avatar";

/** Veb yozuv uchun sayt favicon'i, maxfiy yozuv uchun qulf belgisi. */
export function EntryAvatar({ entry, className }: { entry: EntryMeta; className?: string }) {
  if (isSecret(entry)) {
    return (
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground",
          className,
        )}
      >
        <Lock className="size-4" />
      </span>
    );
  }
  return <SiteAvatar site={entry.site} className={className} />;
}
