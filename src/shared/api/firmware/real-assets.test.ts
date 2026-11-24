import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { parseFlashManifest } from "./manifest";
import { parseSums, verifyFile } from "./verify";

/** `scripts/release.sh` chiqargan haqiqiy assetlar extension parser'lari bilan mos ekanini tekshiradi (bo'lmasa skip). */
const dir = path.resolve(process.env.KALIT_FIRMWARE_DIR ?? path.join(process.cwd(), "..", "kalit-firmware"), "release", "assets");
const have = existsSync(path.join(dir, "SHA256SUMS"));

describe.skipIf(!have)("kalit-firmware release/assets formati", () => {
  it("SHA256SUMS, flash.json va fayllar mos", () => {
    const sums = parseSums(readFileSync(path.join(dir, "SHA256SUMS"), "utf8"));
    const manifests = [...sums.keys()].filter((n) => n.endsWith("-flash.json"));
    expect(manifests.length).toBeGreaterThan(0);
    for (const m of manifests) {
      const raw = new Uint8Array(readFileSync(path.join(dir, m)));
      verifyFile(m, raw, sums);
      const manifest = parseFlashManifest(raw);
      for (const f of manifest.files) {
        const data = new Uint8Array(readFileSync(path.join(dir, f.name)));
        verifyFile(f.name, data, sums);
        expect(bytesToHex(sha256(data))).toBe(sums.get(f.name));
      }
    }
  });
});
