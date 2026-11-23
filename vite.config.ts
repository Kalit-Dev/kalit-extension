import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Side panel, overlay (iframe) va background service worker.
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
        sidepanel: r("./sidepanel.html"),
        overlay: r("./overlay.html"),
        grant: r("./grant.html"),
        background: r("./src/background/index.ts"),
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
