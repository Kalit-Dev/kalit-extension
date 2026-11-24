import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { boardForChip, decideUpdate, loadVerifiedRelease } from "./release";
import { FirmwareError } from "./verify";
import { compareVersions } from "./version";

const enc = (s: string) => new TextEncoder().encode(s);
const priv = ed25519.utils.randomSecretKey();
const pubHex = bytesToHex(ed25519.getPublicKey(priv));

function flashJson(board: string, chip: string, version = "1.2.0") {
  return JSON.stringify({
    schema: 1,
    board,
    chip,
    version,
    flashMode: "dio",
    flashFreq: "40m",
    flashSize: "4MB",
    files: [
      { name: `${board}-bootloader.bin`, offset: "0x1000" },
      { name: `${board}-partitions.bin`, offset: "0x8000" },
      { name: `${board}-firmware.bin`, offset: "0x10000" },
    ],
  });
}

/** Imzolangan release: fayl nomi -> bayt. `tamper` imzolangandan KEYIN fayllarni o'zgartirishga imkon beradi. */
function makeRelease(mutate?: (files: Map<string, Uint8Array>) => void) {
  const files = new Map<string, Uint8Array>();
  for (const [board, chip] of [["esp32dev", "ESP32"], ["esp32c3", "ESP32-C3"]] as const) {
    files.set(`${board}-flash.json`, enc(flashJson(board, chip)));
    for (const part of ["bootloader", "partitions", "firmware"]) files.set(`${board}-${part}.bin`, enc(`${board}:${part}`));
  }
  const sums = [...files].map(([n, d]) => `${bytesToHex(sha256(d))}  ${n}\n`).join("");
  files.set("SHA256SUMS", enc(sums));
  files.set("SHA256SUMS.sig", ed25519.sign(enc(sums), priv));
  mutate?.(files);
  return files;
}

const fetchFrom = (files: Map<string, Uint8Array>) =>
  (async (url: string | URL | Request) => {
    const name = String(url).split("/").pop()!;
    const data = files.get(name);
    return data ? new Response(data as BodyInit, { status: 200 }) : new Response("nope", { status: 404 });
  }) as typeof fetch;

const load = (files: Map<string, Uint8Array>, key = pubHex) =>
  loadVerifiedRelease({ baseUrl: "https://example.test/", publicKeyHex: key, fetchImpl: fetchFrom(files) });

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof FirmwareError ? e.code : `other:${String(e)}`;
  }
  return "ok";
};

describe("loadVerifiedRelease", () => {
  it("imzolangan to'g'ri release'ni qabul qiladi", async () => {
    const r = await load(makeRelease());
    expect(r.version).toBe("1.2.0");
    expect(r.boards.map((b) => b.manifest.board).sort()).toEqual(["esp32c3", "esp32dev"]);
    expect(r.boards[0]!.images.map((i) => i.address)).toEqual([0x1000, 0x8000, 0x10000]);
    expect(boardForChip(r, "ESP32-C3").manifest.board).toBe("esp32c3");
  });

  it("kalit sozlanmagan bo'lsa rad etadi (hech narsa yuklamasdan)", async () => {
    let calls = 0;
    const f = (async () => (calls++, new Response("x"))) as typeof fetch;
    expect(await code(loadVerifiedRelease({ publicKeyHex: "0".repeat(64), fetchImpl: f }))).toBe("KEY_NOT_CONFIGURED");
    expect(calls).toBe(0);
  });

  it("boshqa kalit bilan imzolangan release'ni rad etadi", async () => {
    const other = bytesToHex(ed25519.getPublicKey(ed25519.utils.randomSecretKey()));
    expect(await code(load(makeRelease(), other))).toBe("BAD_SIGNATURE");
  });

  it("SHA256SUMS o'zgartirilsa imzo buziladi", async () => {
    const files = makeRelease((f) => {
      const t = new TextDecoder().decode(f.get("SHA256SUMS")!);
      f.set("SHA256SUMS", enc(t.replace(/^./, (c) => (c === "a" ? "b" : "a"))));
    });
    expect(await code(load(files))).toBe("BAD_SIGNATURE");
  });

  it("imzo yo'q yoki qisqa bo'lsa rad etadi", async () => {
    expect(await code(load(makeRelease((f) => f.set("SHA256SUMS.sig", new Uint8Array(10)))))).toBe("BAD_SIGNATURE");
    expect(await code(load(makeRelease((f) => f.delete("SHA256SUMS.sig"))))).toBe("NETWORK");
  });

  it("firmware.bin almashtirilsa hash xatosi", async () => {
    const files = makeRelease((f) => f.set("esp32dev-firmware.bin", enc("evil")));
    expect(await code(load(files))).toBe("BAD_HASH");
  });

  it("flash.json almashtirilsa (offset/chip) hash xatosi", async () => {
    const files = makeRelease((f) => f.set("esp32dev-flash.json", enc(flashJson("esp32dev", "ESP32", "9.9.9"))));
    expect(await code(load(files))).toBe("BAD_HASH");
  });

  it("imzolangan, lekin yaroqsiz flash.json (ruxsat etilmagan chip)", async () => {
    const files = new Map<string, Uint8Array>();
    files.set("x-flash.json", enc(flashJson("x", "ESP8266").replace("x-flash", "x")));
    const sums = `${bytesToHex(sha256(files.get("x-flash.json")!))}  x-flash.json\n`;
    files.set("SHA256SUMS", enc(sums));
    files.set("SHA256SUMS.sig", ed25519.sign(enc(sums), priv));
    expect(await code(load(files))).toBe("BAD_MANIFEST");
  });

  it("manifest'dagi fayl SHA256SUMS da bo'lmasa rad etadi", async () => {
    const files = makeRelease((f) => {
      const sums = new TextDecoder().decode(f.get("SHA256SUMS")!).split("\n").filter((l) => !l.endsWith("esp32c3-partitions.bin")).join("\n");
      f.set("SHA256SUMS", enc(sums));
      f.set("SHA256SUMS.sig", ed25519.sign(enc(sums), priv));
    });
    expect(await code(load(files))).toBe("BAD_HASH");
  });

  it("tarmoq xatosi NETWORK", async () => {
    const f = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await code(loadVerifiedRelease({ publicKeyHex: pubHex, fetchImpl: f }))).toBe("NETWORK");
  });

  it("noma'lum chip uchun NO_BOARD", async () => {
    const r = await load(makeRelease());
    expect(() => boardForChip(r, "ESP32-S3")).toThrow(FirmwareError);
  });
});

describe("versiya qoidalari", () => {
  it("compareVersions", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
    expect(compareVersions("0.5.0", "1.0.0")).toBe(-1);
    expect(compareVersions("v1.0.0", "x")).toBeNull();
  });

  it("decideUpdate: yangi, bir xil, eski (downgrade rad)", () => {
    expect(decideUpdate("1.0.0", "1.1.0").kind).toBe("update");
    expect(decideUpdate("1.1.0", "1.1.0").kind).toBe("same");
    expect(decideUpdate("1.2.0", "1.1.0").kind).toBe("older");
    expect(decideUpdate(null, "1.1.0").kind).toBe("update"); // qurilma ulanmagan: versiya noma'lum
  });
});
