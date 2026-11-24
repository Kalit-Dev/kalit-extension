// Generates public/icons/icon-{16,32,48,128}.png without any dependencies.
// Brand mark: lucide "KeyRound"-style glyph, light on a dark rounded square (matches shared/ui/logo.tsx).
// Run once: node scripts/make-icons.mjs  (output PNGs are committed).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));
const BG = [23, 23, 23]; // --primary (oklch 0.205 0 0)
const FG = [250, 250, 250]; // --primary-foreground (oklch 0.985 0 0)
const SS = 4; // supersampling per axis

// Glyph in a 24x24 grid. Distance functions (<= 0 inside).
const W = 2.5; // stroke width, like logo.tsx strokeWidth=2.5
const seg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy) - W / 2;
};
const glyph = (x, y) =>
  Math.min(
    Math.abs(Math.hypot(x - 16.5, y - 7.5) - 5.2) - W / 2, // ring
    Math.hypot(x - 16.5, y - 7.5) - 1.1, // centre dot
    seg(x, y, 11.6, 12.4, 3.2, 20.8), // shaft
    seg(x, y, 8.6, 15.4, 11.3, 18.1), // tooth 1
    seg(x, y, 5.6, 18.4, 7.6, 20.4), // tooth 2
  );

const roundRect = (x, y, size, r) => {
  const cx = Math.abs(x - size / 2) - (size / 2 - r), cy = Math.abs(y - size / 2) - (size / 2 - r);
  return Math.hypot(Math.max(cx, 0), Math.max(cy, 0)) + Math.min(Math.max(cx, cy), 0) - r;
};

function render(size) {
  const k = (size * 0.64) / 24, off = (size - 24 * k) / 2; // glyph occupies 64% of the tile
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let cov = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS, y = py + (sy + 0.5) / SS;
          if (roundRect(x, y, size, size * 0.22) > 0) continue;
          cov++;
          if (glyph((x - off) / k, (y - off) / k) * k <= 0) fg++;
        }
      const n = SS * SS, i = (py * size + px) * 4;
      const f = cov ? fg / cov : 0;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(BG[c] * (1 - f) + FG[c] * f);
      rgba[i + 3] = Math.round((255 * cov) / n);
    }
  return rgba;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const s of [16, 32, 48, 128]) {
  writeFileSync(`${OUT}icon-${s}.png`, png(s, render(s)));
  console.log(`icon-${s}.png`);
}
