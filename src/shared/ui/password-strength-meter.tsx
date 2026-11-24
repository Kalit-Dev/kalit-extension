import { passwordStrength } from "@/shared/lib/password-strength";
import { cn } from "@/shared/lib/utils";

const BAR_COLORS = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"];

/** Parol kuchi: 4 ta segment va matnli baho. */
export function PasswordStrengthMeter({ password, className }: { password: string; className?: string }) {
  const strength = passwordStrength(password);
  return (
    <div className={cn("flex items-center gap-3", className)} role="status" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn("h-1 rounded-full bg-muted transition-colors", strength.score >= i && BAR_COLORS[strength.score])}
          />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-muted-foreground">{strength.label}</span>
    </div>
  );
}
