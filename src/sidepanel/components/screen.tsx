import type { LucideIcon } from "lucide-react";
import type * as React from "react";

interface ScreenProps {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}

/** Bir maqsadli ekranlar uchun markazlashgan layout (connect, unlock, setup...). */
export function Screen({ icon: Icon, title, description, children }: ScreenProps) {
  return (
    <div className="flex min-h-full flex-col justify-center gap-6 px-6 py-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="grid gap-3">
        <span className="grid size-11 place-items-center rounded-xl border bg-muted/50">
          <Icon className="size-5" />
        </span>
        <div className="grid gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function PageHeader({ title, back }: { title: string; back?: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-1 px-2">
      {back}
      <h1 className="text-sm font-semibold">{title}</h1>
    </div>
  );
}
