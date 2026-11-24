import { ExternalLink, Usb } from "lucide-react";
import { useDevice } from "@/entities/device";
import { openManager } from "@/shared/lib/open-manager";
import { Button } from "@/shared/ui/button";

const COPY = {
  pairing: ["Kompyuterni ulash kerak", "Ulashni boshqaruv sahifasida yakunlang."],
  factory: ["Qurilmani sozlang", "Master parolni boshqaruv sahifasida o'rnating."],
  default: ["Qurilmani ulang", "Ulanish boshqaruv sahifasida bajariladi."],
} as const;

/** Popup'da ulanish/sozlash yo'q: bitta tugma boshqaruv sahifasini ochadi. */
export function PopupConnectPage() {
  const phase = useDevice((s) => s.phase);
  const [title, description] = phase === "pairing" ? COPY.pairing : phase === "factory" ? COPY.factory : COPY.default;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 pb-8 text-center">
      <span className="grid size-16 place-items-center rounded-2xl border bg-card shadow-sm">
        <Usb className="size-7" />
      </span>
      <div className="grid gap-1.5">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          void openManager().then(() => window.close());
        }}
      >
        <ExternalLink />
        Qurilmani ulash
      </Button>
    </div>
  );
}
