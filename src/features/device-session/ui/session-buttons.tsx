import { Lock, Plug } from "lucide-react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import { describeError } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/button";

const fail = (e: unknown) => toast.error(describeError(e));

/** Qurilmani qulflash. `labeled` — matn bilan (keng ekran). */
export function LockButton({ labeled = false, variant = "ghost" }: { labeled?: boolean; variant?: "ghost" | "outline" }) {
  const lock = useDevice((s) => s.lock);
  return (
    <Button
      variant={variant}
      size={labeled ? "sm" : "icon-sm"}
      title="Qurilmani qulflash"
      aria-label="Qulflash"
      onClick={() => lock().catch(fail)}
    >
      <Lock />
      {labeled && <span className="max-sm:hidden">Qulflash</span>}
    </Button>
  );
}

export function DisconnectButton({ className }: { className?: string }) {
  const disconnect = useDevice((s) => s.disconnect);
  return (
    <Button variant="outline" size="sm" className={className} title="Qurilmadan uzish" onClick={() => disconnect().catch(fail)}>
      <Plug /> <span className="max-md:hidden">Uzish</span>
    </Button>
  );
}
