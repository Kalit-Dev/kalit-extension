import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/lib/utils";

interface FormSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Sarlavha qatorining o'ng tomonida (masalan, rejim tanlovi). */
  action?: ReactNode;
  /** Kontent chetsiz (ichida o'z qatorlari bor ro'yxatlar uchun). */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** Forma bo'limi: ikonka, sarlavha, tavsif va kontent bitta kartada. */
export function FormSection({ icon: Icon, title, description, action, flush, className, children }: FormSectionProps) {
  return (
    <Card>
      <CardHeader className="items-center py-4">
        <CardIcon className="size-9 [&_svg]:size-4">
          <Icon aria-hidden />
        </CardIcon>
        <div className="min-w-0 flex-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn(flush ? "p-0" : "grid gap-5 py-5", className)}>{children}</CardContent>
    </Card>
  );
}
