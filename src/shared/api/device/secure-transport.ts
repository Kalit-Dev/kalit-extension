import { decode, encode } from "./cbor";
import { NoiseSession, pairingCode, type CipherState, type KeyPair } from "./noise";
import type { RawTransport, Transport } from "./transport";

export const PROTOCOL_VERSION = 1;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 1500;
/** DevKit port ochilganda reset bo'ladi (boot ~2.2 s): msg1 yo'qolishi mumkin, shuning uchun bir necha urinish. */
const HANDSHAKE_ATTEMPTS = 4;

export interface SecureTransportDeps {
  pinnedDeviceKey(): Promise<Uint8Array | null>;
  pinDeviceKey(key: Uint8Array): Promise<void>;
  hostName: string;
  /** msg2 shu vaqt ichida kelmasa handshake bir marta qayta boshlanadi (DevKit auto-reset). */
  handshakeTimeoutMs?: number;
}

type Listener<T> = (value: T) => void;
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Noise XX kanalini o'rab, DeviceClient'ga obyekt kadrlarini beradi. Handshake: initiator. */
export class SecureTransport implements Transport {
  pairingCode: string | null = null;
  deviceInfo: { fw: string; name: string } | null = null;

  private readonly frameListeners = new Set<Listener<unknown>>();
  private readonly closeListeners = new Set<() => void>();
  private phase: "idle" | "handshake" | "open" | "closed" = "idle";
  private handshakeFrame: ((f: Uint8Array) => void) | null = null;
  private cipher: { send: CipherState; recv: CipherState } | null = null;

  constructor(
    private readonly inner: RawTransport,
    private readonly identity: KeyPair,
    private readonly deps: SecureTransportDeps,
  ) {
    inner.onFrame((f) => this.handleFrame(f));
    inner.onClose(() => this.finish());
  }

  get kind() {
    return this.inner.kind;
  }

  onFrame(listener: Listener<unknown>): void {
    this.frameListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  async open(): Promise<void> {
    await this.inner.open();
    this.phase = "handshake";
    try {
      await this.handshake();
    } catch (e) {
      this.phase = "closed";
      await this.inner.close().catch(() => undefined);
      throw e;
    }
    this.phase = "open";
  }

  async close(): Promise<void> {
    this.phase = "closed";
    await this.inner.close();
  }

  async send(frame: unknown): Promise<void> {
    if (this.phase !== "open" || !this.cipher) throw new Error("NOT_OPEN");
    const req = frame as { id: number; cmd: string; params: unknown };
    await this.inner.send(this.cipher.send.encrypt(encode({ i: req.id, c: req.cmd, p: req.params })));
  }

  private async handshake(): Promise<void> {
    const timeoutMs = this.deps.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    for (let attempt = 0; attempt < HANDSHAKE_ATTEMPTS; attempt++) {
      const noise = NoiseSession.initiator(this.identity);
      const msg2 = this.nextHandshakeFrame(timeoutMs);
      await this.inner.send(noise.writeMessage(new Uint8Array()));
      const reply = await msg2;
      if (reply === null) continue; // timeout, bir marta qayta urinadi

      let info: unknown;
      try {
        info = decode(noise.readMessage(reply));
      } catch {
        throw new Error("PROTOCOL");
      }
      if (!isRecord(info) || info.v !== PROTOCOL_VERSION || typeof info.fw !== "string" || typeof info.name !== "string") {
        throw new Error("PROTOCOL");
      }
      const remote = noise.remoteStatic!;
      const pinned = await this.deps.pinnedDeviceKey();
      if (pinned && !sameBytes(pinned, remote)) throw new Error("DEVICE_KEY_CHANGED");

      await this.inner.send(noise.writeMessage(encode({ v: PROTOCOL_VERSION, name: this.deps.hostName })));
      if (!pinned) await this.deps.pinDeviceKey(remote);
      this.cipher = noise.split();
      this.pairingCode = pairingCode(noise.handshakeHash);
      this.deviceInfo = { fw: info.fw, name: info.name };
      return;
    }
    throw new Error("TIMEOUT");
  }

  private nextHandshakeFrame(timeoutMs: number): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.handshakeFrame = null;
        resolve(null);
      }, timeoutMs);
      this.handshakeFrame = (f) => {
        clearTimeout(timer);
        this.handshakeFrame = null;
        resolve(f);
      };
    });
  }

  private handleFrame(frame: Uint8Array): void {
    if (this.phase === "handshake") {
      this.handshakeFrame?.(frame);
      return;
    }
    if (this.phase !== "open" || !this.cipher) return; // open()'dan oldin yoki yopilgandan keyin — tashlanadi
    let msg: unknown;
    try {
      msg = decode(this.cipher.recv.decrypt(frame));
    } catch {
      // AEAD yoki CBOR xatosi — kanal buzilgan, yopiladi.
      this.phase = "closed";
      void this.inner.close().catch(() => undefined);
      this.finish();
      return;
    }
    if (isRecord(msg) && msg.ev === "CLOSED") {
      // Qurilma kanalni yopdi (nonce desinxron): host ham yopadi, UI qayta ulanadi.
      this.phase = "closed";
      void this.inner.close().catch(() => undefined);
      this.finish();
      return;
    }
    const mapped = this.toClientFrame(msg);
    if (mapped) this.frameListeners.forEach((l) => l(mapped));
  }

  private toClientFrame(msg: unknown): unknown {
    if (!isRecord(msg)) return null;
    if (typeof msg.ev === "string") return msg.d === undefined ? { event: msg.ev } : { event: msg.ev, data: msg.d };
    if (typeof msg.i === "number" && typeof msg.ok === "boolean") {
      return msg.ok ? { id: msg.i, ok: true, result: msg.r } : { id: msg.i, ok: false, error: msg.e };
    }
    return null;
  }

  private finish(): void {
    if (this.phase === "closed" && this.closeListeners.size === 0) return;
    this.phase = "closed";
    const listeners = [...this.closeListeners];
    this.closeListeners.clear();
    listeners.forEach((l) => l());
  }
}
