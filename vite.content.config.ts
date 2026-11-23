import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Content script ES module bo'la olmaydi, shuning uchun bitta IIFE fayl.
export default defineConfig(({ mode }) => ({
  publicDir: false,
  resolve: { alias: { "@": r("./src") } },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: mode === "development" ? "inline" : false,
    lib: {
      entry: r("./src/content/index.ts"),
      formats: ["iife"],
      name: "KalitContent",
      fileName: () => "content.js",
    },
  },
}));
