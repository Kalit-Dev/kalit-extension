import "@/app/styles/globals.css";
import { initTheme } from "@/shared/lib/theme";
import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { closeOverlay, post } from "@/shared/api/overlay-bridge";
import { InlineMenu } from "@/widgets/overlay-inline-menu";
import { SavePrompt } from "@/widgets/overlay-save-prompt";

const view = new URLSearchParams(location.search).get("view");

function Root() {
  const ref = useRef<HTMLDivElement>(null);

  // Kontent o'lchami o'zgarsa — iframe balandligini moslash.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => post({ type: "resize", height: Math.ceil(el.offsetHeight) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeOverlay();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={ref} className="p-2">
      {view === "save" ? <SavePrompt /> : <InlineMenu otp={view === "otp"} />}
    </div>
  );
}

initTheme();
// Iframe shaffof bo'lishi uchun: sahifa color-scheme'i bilan farq qilsa brauzer iframe'ga qattiq fon beradi.
document.documentElement.style.colorScheme = "normal";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
