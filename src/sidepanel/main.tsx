import "@/styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { useDevice } from "@/store/device-store";
import { startHub } from "./hub";
import { router } from "./router";

startHub();

// Avval ruxsat berilgan qurilma bo'lsa — jim ulanish.
void useDevice.getState().connect("usb", { silent: true });

// grant.html ruxsat olgach — jim ulanish.
chrome.runtime.onMessage.addListener((m: { type?: string }) => {
  if (m?.type === "KALIT_PORT_GRANTED") void useDevice.getState().connect("usb", { silent: true });
});

// Kompyuter ekrani qulflansa — qurilma ham qulflanadi.
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "locked" && useDevice.getState().phase === "unlocked") {
    void useDevice.getState().lock().catch(() => undefined);
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
