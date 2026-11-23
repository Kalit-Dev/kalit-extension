import { describe, expect, it } from "vitest";
import { decode, encode } from "./cbor";
import { generateKeyPair, NoiseSession, pairingCode, type CipherState, type KeyPair } from "./noise";
import { SecureTransport } from "./secure-transport";
import type { RawTransport } from "./transport";

interface Loopback {
  raw: RawTransport;
  sent: Uint8Array[];
  device: KeyPair;
  /** Qurilma tomoni: shifrlangan xabar yuboradi. */
  deviceSend(msg: unknown): void;
  deviceSendRaw(frame: Uint8Array): void;
  received: unknown[];
  closed: boolean;
  dropFirstMsg1: boolean;
  msg2Payload: unknown;
  session: NoiseSession | null;
}

function loopback(opts: { msg2Payload?: unknown; dropFirstMsg1?: boolean; device?: KeyPair } = {}): Loopback {
  const lb: Loopback = {
    sent: [],
    device: opts.device ?? generateKeyPair(),
    received: [],
    closed: false,
    dropFirstMsg1: opts.dropFirstMsg1 ?? false,
    msg2Payload: opts.msg2Payload ?? { v: 1, fw: "test-0.1", name: "Kalit Test" },
    session: null,
    raw: undefined as unknown as RawTransport,
    deviceSend: () => undefined,
    deviceSendRaw: () => undefined,
  };
  let onFrame: (f: Uint8Array) => void = () => undefined;
  let onClose: () => void = () => undefined;
  let state: { send: CipherState; recv: CipherState } | null = null;
  const emit = (f: Uint8Array) => queueMicrotask(() => onFrame(f));

  lb.raw = {
    kind: "mock",
    open: async () => undefined,
    close: async () => {
      lb.closed = true;
      onClose();
    },
    onFrame: (l) => (onFrame = l),
    onClose: (l) => (onClose = l),
    send: async (frame) => {
      lb.sent.push(frame);
      if (!lb.session) {
        if (lb.dropFirstMsg1) {
          lb.dropFirstMsg1 = false;
          return;
        }
        lb.session = NoiseSession.responder(lb.device);
        lb.session.readMessage(frame);
        emit(lb.session.writeMessage(encode(lb.msg2Payload)));
        return;
      }
      if (!lb.session.complete) {
        lb.session.readMessage(frame);
        state = lb.session.split();
        return;
      }
      lb.received.push(decode(state!.recv.decrypt(frame)));
    },
  };
  lb.deviceSend = (msg) => emit(state!.send.encrypt(encode(msg)));
  lb.deviceSendRaw = emit;
  return lb;
}

const deps = (over: Partial<ConstructorParameters<typeof SecureTransport>[2]> = {}) => {
  const pinned: { key: Uint8Array | null } = { key: null };
  return {
    pinned,
    deps: {
      pinnedDeviceKey: async () => pinned.key,
      pinDeviceKey: async (k: Uint8Array) => {
        pinned.key = k;
      },
      hostName: "Test Host",
      handshakeTimeoutMs: 40,
      ...over,
    },
  };
};

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("SecureTransport", () => {
  it("encrypts requests: device decrypts them, the wire never shows plaintext", async () => {
    const lb = loopback();
    const t = new SecureTransport(lb.raw, generateKeyPair(), deps().deps);
    await t.open();
    await t.send({ id: 1, cmd: "GET_STATUS", params: {} });
    expect(lb.received).toEqual([{ i: 1, c: "GET_STATUS", p: {} }]);
    const wire = new TextDecoder("latin1").decode(lb.sent.at(-1)!);
    expect(wire).not.toContain("GET_STATUS");
  });

  it("maps responses and events back to client frames", async () => {
    const lb = loopback();
    const t = new SecureTransport(lb.raw, generateKeyPair(), deps().deps);
    const frames: unknown[] = [];
    t.onFrame((f) => frames.push(f));
    await t.open();
    lb.deviceSend({ i: 1, ok: true, r: { state: "LOCKED" } });
    lb.deviceSend({ i: 2, ok: false, e: "BUSY" });
    lb.deviceSend({ ev: "CONFIRM_PENDING", d: { action: "fill", timeoutMs: 10000 } });
    await tick();
    expect(frames).toEqual([
      { id: 1, ok: true, result: { state: "LOCKED" } },
      { id: 2, ok: false, error: "BUSY" },
      { event: "CONFIRM_PENDING", data: { action: "fill", timeoutMs: 10000 } },
    ]);
  });

  it("exposes device info and the SAS pairing code, and pins the device key on first use", async () => {
    const lb = loopback();
    const d = deps();
    const t = new SecureTransport(lb.raw, generateKeyPair(), d.deps);
    await t.open();
    expect(t.deviceInfo).toEqual({ fw: "test-0.1", name: "Kalit Test" });
    expect(t.pairingCode).toBe(pairingCode(lb.session!.handshakeHash));
    expect(d.pinned.key).toEqual(lb.device.pub);
  });

  it("rejects with DEVICE_KEY_CHANGED when the pinned device key differs", async () => {
    const lb = loopback();
    const d = deps();
    d.pinned.key = generateKeyPair().pub;
    const t = new SecureTransport(lb.raw, generateKeyPair(), d.deps);
    await expect(t.open()).rejects.toThrow("DEVICE_KEY_CHANGED");
    expect(lb.closed).toBe(true);
  });

  it("rejects with PROTOCOL when the device announces another protocol version", async () => {
    const lb = loopback({ msg2Payload: { v: 2, fw: "x", name: "y" } });
    const t = new SecureTransport(lb.raw, generateKeyPair(), deps().deps);
    await expect(t.open()).rejects.toThrow("PROTOCOL");
  });

  it("ignores frames that arrive before open()", async () => {
    const lb = loopback();
    const t = new SecureTransport(lb.raw, generateKeyPair(), deps().deps);
    const frames: unknown[] = [];
    t.onFrame((f) => frames.push(f));
    lb.deviceSendRaw(Uint8Array.of(1, 2, 3));
    await tick();
    await t.open();
    expect(frames).toEqual([]);
  });

  it("retries the handshake once when the first message gets no answer (DevKit reset)", async () => {
    const lb = loopback({ dropFirstMsg1: true });
    const t = new SecureTransport(lb.raw, generateKeyPair(), deps().deps);
    await t.open();
    expect(lb.sent.length).toBeGreaterThanOrEqual(3); // msg1, msg1 (retry), msg3
  });

  it("closes the channel on a tampered frame and delivers nothing afterwards", async () => {
    const lb = loopback();
    const t = new SecureTransport(lb.raw, generateKeyPair(), deps().deps);
    const frames: unknown[] = [];
    let closed = 0;
    t.onFrame((f) => frames.push(f));
    t.onClose(() => closed++);
    await t.open();
    lb.deviceSendRaw(Uint8Array.of(9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9)); // AEAD tag fail
    await tick();
    lb.deviceSend({ i: 1, ok: true, r: {} });
    await tick();
    expect(closed).toBe(1);
    expect(lb.closed).toBe(true);
    expect(frames).toEqual([]);
  });
});
