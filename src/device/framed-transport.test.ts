import { describe, expect, it } from "vitest";
import { encodeFrame } from "./cobs";
import { FramedTransport } from "./framed-transport";
import type { ByteStream } from "./transport";

class FakeStream implements ByteStream {
  written: Uint8Array[] = [];
  opened = false;
  private data: ((b: Uint8Array) => void)[] = [];
  private closes: (() => void)[] = [];
  async open() {
    this.opened = true;
  }
  async close() {
    this.closes.forEach((l) => l());
  }
  async write(b: Uint8Array) {
    this.written.push(b);
  }
  onData(l: (b: Uint8Array) => void) {
    this.data.push(l);
  }
  onClose(l: () => void) {
    this.closes.push(l);
  }
  push(b: Uint8Array) {
    this.data.forEach((l) => l(b));
  }
}

const payload = Uint8Array.from([1, 0, 2, 0, 0, 3, 255]);

describe("FramedTransport", () => {
  it("send() wraps payload in a COBS/CRC frame", async () => {
    const s = new FakeStream();
    const t = new FramedTransport("ble", s);
    await t.open();
    await t.send(payload);
    expect(s.opened).toBe(true);
    expect(s.written).toEqual([encodeFrame(payload)]);
    expect(t.kind).toBe("ble");
  });

  it("reassembles a frame split across arbitrary chunks (BLE MTU style)", () => {
    const s = new FakeStream();
    const t = new FramedTransport("tauri", s);
    const got: Uint8Array[] = [];
    t.onFrame((f) => got.push(f));
    const wire = encodeFrame(payload);
    for (let i = 0; i < wire.length; i += 3) s.push(wire.subarray(i, i + 3));
    expect(got).toEqual([payload]);
  });

  it("drops log lines and bad frames, keeps good ones", () => {
    const s = new FakeStream();
    const t = new FramedTransport("usb", s);
    const got: Uint8Array[] = [];
    t.onFrame((f) => got.push(f));
    s.push(new TextEncoder().encode("KALIT READY\r\n"));
    s.push(encodeFrame(payload));
    expect(got).toEqual([payload]);
  });

  it("emits close once", async () => {
    const s = new FakeStream();
    const t = new FramedTransport("usb", s);
    let n = 0;
    t.onClose(() => n++);
    await s.close();
    await s.close();
    expect(n).toBe(1);
  });
});
