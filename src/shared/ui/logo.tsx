import { KeyRound } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-6 place-items-center rounded-md bg-primary text-primary-foreground", className)}>
      <KeyRound className="size-3.5" strokeWidth={2.5} />
    </span>
  );
}
