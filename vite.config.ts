import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Popup, manager, overlay (iframe) va background service worker.
// Content script alohida IIFE sifatida yig'iladi: vite.content.config.ts
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": r("./src") } },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: mode === "development" ? "inline" : false,
    rollupOptions: {
      input: {
        popup: r("./popup.html"),
        overlay: r("./overlay.html"),
        manager: r("./manager.html"),
        grant: r("./grant.html"),
        offscreen: r("./offscreen.html"),
        background: r("./src/app/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
}));
