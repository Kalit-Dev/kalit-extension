import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Feature-Sliced Design chegaralari:
 *  1. Qatlam faqat o'zidan pastdagi qatlamlarni import qiladi (app > pages > widgets > features > entities > shared).
 *  2. Bir qatlamdagi slice'lar bir-birini import qilmaydi.
 *  3. Boshqa slice'ga faqat uning ochiq API'si (index.ts) orqali murojaat qilinadi.
 */
const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"] as const;
type Layer = (typeof LAYERS)[number];
const SRC = path.resolve(__dirname);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["'](@\/[^"']+)["']/g;

describe("FSD arxitektura chegaralari", () => {
  const violations: string[] = [];

  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep);
    const layer = rel[0] as Layer;
    if (!LAYERS.includes(layer)) continue;
    const slice = layer === "shared" ? "" : rel[1];
    const text = readFileSync(file, "utf8");

    for (const m of text.matchAll(IMPORT_RE)) {
      const [target, tLayer, tSlice, ...tRest] = m[1]!.slice(2).split("/") as [string, ...string[]];
      void target;
      if (!LAYERS.includes(tLayer as Layer)) continue;
      const where = `${rel.join("/")} -> ${m[1]}`;
      const from = LAYERS.indexOf(layer);
      const to = LAYERS.indexOf(tLayer as Layer);

      if (to < from) violations.push(`yuqori qatlamni import qiladi: ${where}`);
      else if (to === from && layer !== "shared" && layer !== "app" && tSlice !== slice) {
        violations.push(`bir qatlamdagi boshqa slice: ${where}`);
      } else if (to > from && tLayer !== "shared" && tRest.length > 0) {
        violations.push(`ochiq API'ni (index.ts) chetlab o'tadi: ${where}`);
      } else if (to === from && layer === "app" && tSlice !== slice) {
        violations.push(`app entry'lari bir-birini import qilmasin: ${where}`);
      }
    }
  }

  it("qatlam qoidalari buzilmaydi", () => {
    expect(violations).toEqual([]);
  });
});
