import { bytesToHex } from "@noble/hashes/utils.js";
import { decode, encode } from "./cbor";
import { generateKeyPair, NoiseSession, pairingCode, type CipherState, type KeyPair } from "./noise";
import { CONFIRM_TIMEOUT_MS, type ConfirmInfo, type DeviceState, type EntryMeta, type ErrorCode } from "./protocol";
import { hostMatchesSite, originHost, siteValid } from "./site-rules";
import type { RawTransport } from "./transport";

/**
 * Qurilmasiz development uchun simulyator. Firmware mantiqini takrorlaydi:
 * Noise_XX responder, host pin (≤4), PIN urinishlari, wipe (= zavod holati), 10 s tasdiq, 500 ms guard.
 * Ma'lumotlar faqat xotirada — panel yopilsa yo'qoladi.
 */

const MAX_ATTEMPTS = 10;
const MAX_HOSTS = 4;
const MAX_ENTRIES = 32;
/** site+username+title (bayt) yig'indisi: LIST javobi 8 KiB kadrga sig'sin (firmware kMetaBudget bilan bir xil). */
const META_BUDGET = 160;
const GUARD_MS = 500;
const FIRMWARE = "mock-0.1.0";
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";

class Fault extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

type ConfirmResult = "accept" | "reject" | "timeout";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = Record<string, any>;
interface Request {
  i: number;
  c: string;
  p?: Params;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function generatePassword(length: number): string {
  const max = 256 - (256 % CHARSET.length); // modulo bias'siz
  const out: string[] = [];
  const buf = new Uint8Array(32);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) if (b < max && out.length < length) out.push(CHARSET[b % CHARSET.length]!);
  }
  return out.join("");
}

export interface MockOptions {
  /** Testlar uchun: KDF/ulanish kechikishlari va 500 ms guard o'chiriladi. */
  fast?: boolean;
}

export class MockTransport implements RawTransport {
  readonly kind = "mock" as const;

  private readonly frameListeners = new Set<(frame: Uint8Array) => void>();
  private readonly closeListeners = new Set<() => void>();
  private readonly fast: boolean;

  // Qurilma holati (ulanishlar orasida saqlanadi)
  private deviceKey: KeyPair = generateKeyPair();
  private state: DeviceState = "FACTORY";
  private master: string | null = null;
  private attempts = MAX_ATTEMPTS;
  private readonly trusted = new Map<string, string>(); // host static key (hex) → nom
  private readonly vault = new Map<string, { meta: EntryMeta; password: string }>();

  // Ulanish holati
  private noise: NoiseSession | null = null;
  private cipher: { send: CipherState; recv: CipherState } | null = null;
  private hostKey: string | null = null;
  private sas = "";

  private pending: ((r: ConfirmResult) => void) | null = null;
  private pendingSince = 0;

  constructor({ fast = false }: MockOptions = {}) {
    this.fast = fast;
  }

  async open(): Promise<void> {
    this.noise = null;
    this.cipher = null;
    this.hostKey = null;
    await this.delay(300);
  }

  async close(): Promise<void> {
    this.pending?.("reject");
    this.closeListeners.forEach((l) => l());
  }

  async send(frame: Uint8Array): Promise<void> {
    void this.receive(frame).catch(() => this.fail());
  }

  onFrame(listener: (frame: Uint8Array) => void): void {
    this.frameListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  /** Jismoniy tugmani simulyatsiya qiladi. */
  press(kind: "short" | "long"): void {
    if (!this.pending || Date.now() - this.pendingSince < (this.fast ? 0 : GUARD_MS)) return;
    this.pending(kind === "short" ? "accept" : "reject");
  }

  private delay(ms: number) {
    return this.fast ? Promise.resolve() : wait(ms);
  }

  private fail() {
    this.noise = null;
    this.cipher = null;
    this.pending?.("reject");
    this.closeListeners.forEach((l) => l());
  }

  private emitRaw(frame: Uint8Array, after?: () => void) {
    setTimeout(() => {
      this.frameListeners.forEach((l) => l(frame));
      after?.();
    }, 0);
  }

  private emitSecure(msg: unknown, after?: () => void) {
    if (this.cipher) this.emitRaw(this.cipher.send.encrypt(encode(msg)), after);
  }

  private async receive(frame: Uint8Array) {
    if (!this.noise) {
      const noise = NoiseSession.responder(this.deviceKey);
      noise.readMessage(frame);
      this.emitRaw(noise.writeMessage(encode({ v: 1, fw: FIRMWARE, name: "Kalit Mock" })));
      this.noise = noise;
      return;
    }
    if (!this.noise.complete) {
      const info = decode(this.noise.readMessage(frame)) as { v?: number; name?: string };
      if (info.v !== 1) throw new Error("PROTOCOL");
      this.hostKey = bytesToHex(this.noise.remoteStatic!);
      this.sas = pairingCode(this.noise.handshakeHash);
      this.cipher = this.noise.split();
      this.hostName = String(info.name ?? "");
      return;
    }
    const req = decode(this.cipher!.recv.decrypt(frame)) as Request;
    await this.process(req);
  }

  private hostName = "";

  private async process({ i, c, p = {} }: Request) {
    await this.delay(c === "UNLOCK" || c === "ONBOARD" ? 700 : 60); // KDF kechikishi
    try {
      this.emitSecure({ i, ok: true, r: await this.handle(c, p) });
    } catch (e) {
      const code = e instanceof Fault ? e.code : "INTERNAL";
      if (code === "WIPED") {
        // Eski kalit bilan sessiya davom etmaydi: javob yetkazilgach kanal yopiladi.
        const cipher = this.cipher;
        this.noise = null;
        this.cipher = null;
        if (cipher) this.emitRaw(cipher.send.encrypt(encode({ i, ok: false, e: code })), () => this.closeListeners.forEach((l) => l()));
      } else {
        this.emitSecure({ i, ok: false, e: code });
      }
    }
  }

  private async handle(cmd: string, p: Params): Promise<unknown> {
    const isTrusted = this.hostKey !== null && this.trusted.has(this.hostKey);
    if (!isTrusted && cmd !== "GET_STATUS" && cmd !== "PAIR_HOST") throw new Fault("NOT_TRUSTED");

    switch (cmd) {
      case "GET_STATUS":
        return { state: this.state, firmware: FIRMWARE, hostTrusted: isTrusted, attemptsLeft: this.attempts };

      case "PAIR_HOST": {
        if (isTrusted) return {};
        await this.confirm({ action: "pair", code: this.sas });
        if (this.trusted.size >= MAX_HOSTS) this.trusted.delete(this.trusted.keys().next().value!); // eng eskisi chiqariladi
        this.trusted.set(this.hostKey!, this.hostName);
        return {};
      }

      case "ONBOARD":
        if (this.state !== "FACTORY") throw new Fault("INVALID_STATE");
        this.master = String(p.masterPassword);
        this.state = "UNLOCKED";
        return {};

      case "UNLOCK":
        if (this.state === "FACTORY") throw new Fault("INVALID_STATE");
        if (this.state === "UNLOCKED") return {};
        // Hisoblagich tekshiruvdan OLDIN kamaytiriladi (power-cut hujumiga qarshi).
        this.attempts--;
        if (p.masterPassword !== this.master) {
          if (this.attempts <= 0) {
            this.wipe();
            throw new Fault("WIPED");
          }
          throw new Fault("BAD_PASSWORD");
        }
        this.attempts = MAX_ATTEMPTS;
        this.state = "UNLOCKED";
        return {};

      case "LOCK":
        if (this.state === "UNLOCKED") this.state = "LOCKED";
        return {};

      case "LIST":
        this.requireUnlocked();
        return { entries: [...this.vault.values()].map((v) => v.meta) };

      case "GET_CREDENTIAL": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        // Qurilma domenni o'zi tekshiradi — extension'ga ishonmaydi.
        const host = originHost(String(p.origin));
        if (!host || !hostMatchesSite(host, item.meta.site)) throw new Fault("ORIGIN_MISMATCH");
        await this.confirm({ action: "fill", site: item.meta.site, username: item.meta.username });
        return { username: item.meta.username, password: item.password };
      }

      case "ADD_ENTRY": {
        this.requireUnlocked();
        const host = originHost(String(p.origin));
        const site = String(p.site);
        if (!host || !siteValid(site, host)) throw new Fault("ORIGIN_MISMATCH");
        const metaBytes = [site, String(p.username), p.title ? String(p.title) : ""].reduce(
          (n, s) => n + new TextEncoder().encode(s).length,
          0,
        );
        if (this.vault.size >= MAX_ENTRIES || metaBytes > META_BUDGET) throw new Fault("INVALID_STATE");
        await this.confirm({ action: "save", site, username: String(p.username) });
        const meta: EntryMeta = {
          id: crypto.randomUUID(),
          site,
          username: String(p.username),
          title: p.title ? String(p.title) : undefined,
          updatedAt: Date.now(),
        };
        const password = p.password ? String(p.password) : generatePassword(Number(p.generateLength) || 20);
        this.vault.set(meta.id, { meta, password });
        return { entry: meta };
      }

      case "DELETE_ENTRY": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        await this.confirm({ action: "delete", site: item.meta.site, username: item.meta.username });
        this.vault.delete(item.meta.id);
        return {};
      }

      default:
        throw new Fault("INTERNAL");
    }
  }

  private confirm(info: Omit<ConfirmInfo, "timeoutMs">): Promise<void> {
    if (this.pending) return Promise.reject(new Fault("BUSY"));
    this.pendingSince = Date.now();
    this.emitSecure({ ev: "CONFIRM_PENDING", d: { ...info, timeoutMs: CONFIRM_TIMEOUT_MS } });

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.pending?.("timeout"), CONFIRM_TIMEOUT_MS);
      this.pending = (result) => {
        clearTimeout(timer);
        this.pending = null;
        this.emitSecure({ ev: "CONFIRM_DONE" });
        if (result === "accept") resolve();
        else reject(new Fault(result === "timeout" ? "TIMEOUT" : "USER_REJECTED"));
      };
    });
  }

  private requireUnlocked() {
    if (this.state !== "UNLOCKED") throw new Fault("LOCKED");
  }

  /** Zavod holati: vault, pin qilingan hostlar va qurilma kaliti yo'qoladi. */
  private wipe() {
    this.vault.clear();
    this.trusted.clear();
    this.master = null;
    this.attempts = MAX_ATTEMPTS;
    this.state = "FACTORY";
    this.deviceKey = generateKeyPair();
  }
}
