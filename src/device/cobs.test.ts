import { describe, expect, it } from "vitest";
import { cobsDecode, cobsEncode, crc16, encodeFrame, FrameReader } from "./cobs";

const bytes = (...n: number[]) => Uint8Array.from(n);
const frame = encodeFrame;
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const random = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);

describe("cobs", () => {
  it("never emits 0x00 in the encoded body", () => {
    for (const n of [0, 1, 254, 255, 300]) {
      expect(cobsEncode(random(n)).includes(0)).toBe(false);
    }
  });

  it.each([
    ["empty", bytes()],
    ["single zero", bytes(0)],
    ["mixed", bytes(1, 2, 0, 3)],
    ["254 bytes", random(254).map((b) => b || 1)],
    ["255 bytes", random(255)],
    ["300 bytes", random(300)],
  ])("round-trips %s", (_name, data) => {
    expect(cobsDecode(cobsEncode(data))).toEqual(data);
  });

  it("decode returns null on an embedded zero", () => {
    expect(cobsDecode(bytes(3, 1, 0, 2))).toBeNull();
  });

  it("decode returns null when a block overruns the input", () => {
    expect(cobsDecode(bytes(5, 1, 2))).toBeNull();
  });
});

describe("FrameReader", () => {
  it("returns a frame delivered in one chunk", () => {
    const r = new FrameReader();
    expect(r.push(frame(bytes(1, 2, 3)))).toEqual([bytes(1, 2, 3)]);
  });

  it("returns a frame split across two pushes", () => {
    const r = new FrameReader();
    const f = frame(bytes(9, 0, 8, 7));
    expect(r.push(f.slice(0, 2))).toEqual([]);
    expect(r.push(f.slice(2))).toEqual([bytes(9, 0, 8, 7)]);
  });

  it("drops an ASCII log line and still delivers the next frame", () => {
    const r = new FrameReader();
    const log = new TextEncoder().encode("I (123) boot: ready\n");
    const out = r.push(concat(log, frame(bytes(4, 5))));
    expect(out).toEqual([bytes(4, 5)]);
  });

  it("drops an oversize frame", () => {
    const r = new FrameReader(8192);
    const big = frame(random(8193));
    expect(r.push(big)).toEqual([]);
    expect(r.push(frame(bytes(1)))).toEqual([bytes(1)]);
  });

  it("crc16 matches the CCITT-FALSE check value", () => {
    expect(crc16(new TextEncoder().encode("123456789"))).toBe(0x29b1);
  });

  it("drops a log line that ends in a newline even when it is valid COBS", () => {
    const r = new FrameReader();
    const log = new TextEncoder().encode("E (9) nvs: err\n\x00");
    expect(r.push(concat(log, frame(bytes(7))))).toEqual([bytes(7)]);
  });

  it("drops a frame whose CRC is wrong", () => {
    const r = new FrameReader();
    const bad = concat(bytes(0), cobsEncode(bytes(1, 2, 3, 0, 0)), bytes(0));
    expect(r.push(bad)).toEqual([]);
  });

  it("drops a corrupt frame without throwing", () => {
    const r = new FrameReader();
    expect(r.push(bytes(5, 1, 2, 0))).toEqual([]);
  });

  it("returns several frames from one chunk", () => {
    const r = new FrameReader();
    expect(r.push(concat(frame(bytes(1)), frame(bytes(2))))).toEqual([bytes(1), bytes(2)]);
  });
});
