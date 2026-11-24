import "@/app/styles/globals.css";
import { initTheme } from "@/shared/lib/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { startSync } from "@/entities/device";
import { router } from "./router";

// Qurilma ulanishi engine'da (offscreen hujjat): panel faqat holatni ko'rsatadi.
initTheme();
startSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
