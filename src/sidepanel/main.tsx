import "@/styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { startSync } from "@/store/device-store";
import { router } from "./router";

// Qurilma ulanishi engine'da (offscreen hujjat): panel faqat holatni ko'rsatadi.
startSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
