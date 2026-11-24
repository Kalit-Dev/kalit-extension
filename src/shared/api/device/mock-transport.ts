import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
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
const IMPORT_SESSION_MS = 120_000;
const FIRMWARE = "mock-0.4.0";
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

const hostFingerprint = (keyHex: string) => bytesToHex(sha256(hexToBytes(keyHex))).slice(0, 16);
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
  private readonly slots: ({ key: string; name: string; seq: number } | null)[] = Array(MAX_HOSTS).fill(null);
  private seq = 0;
  private readonly vault = new Map<string, { meta: EntryMeta; password: string }>();

  // Ulanish holati
  private noise: NoiseSession | null = null;
  private cipher: { send: CipherState; recv: CipherState } | null = null;
  private hostKey: string | null = null;
  private sas = "";

  /** v0.5 import sessiyasi: `remaining` ta tugmasiz ADD_ENTRY, `deadline` (Date.now) dan keyin tugaydi. */
  private importSession: { remaining: number; added: number; deadline: number } | null = null;

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
    this.importSession = null;
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
    this.importSession = null;
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
  private closeAfterResponse = false;

  private hostSlot(): number {
    return this.hostKey === null ? -1 : this.slots.findIndex((h) => h?.key === this.hostKey);
  }

  private async process({ i, c, p = {} }: Request) {
    await this.delay(c === "UNLOCK" || c === "ONBOARD" || c === "CHANGE_MASTER" ? 700 : 60); // KDF kechikishi
    try {
      const r = await this.handle(c, p);
      if (this.closeAfterResponse) {
        // Joriy host bekor qilindi: javobdan keyin CLOSED hodisasi va kanal yopiladi.
        this.closeAfterResponse = false;
        this.importSession = null;
        const cipher = this.cipher;
        this.noise = null;
        this.cipher = null;
        if (cipher) {
          this.emitRaw(cipher.send.encrypt(encode({ i, ok: true, r })));
          this.emitRaw(cipher.send.encrypt(encode({ ev: "CLOSED" })), () => this.closeListeners.forEach((l) => l()));
        }
        return;
      }
      this.emitSecure({ i, ok: true, r });
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
    const isTrusted = this.hostSlot() >= 0;
    if (!isTrusted && cmd !== "GET_STATUS" && cmd !== "PAIR_HOST") throw new Fault("NOT_TRUSTED");

    switch (cmd) {
      case "GET_STATUS":
        return { state: this.state, firmware: FIRMWARE, hostTrusted: isTrusted, attemptsLeft: this.attempts };

      case "PAIR_HOST": {
        if (isTrusted) return {};
        await this.confirm({ action: "pair", code: this.sas });
        let slot = this.slots.indexOf(null);
        if (slot < 0) slot = this.slots.reduce((m, h, i) => (h!.seq < this.slots[m]!.seq ? i : m), 0); // eng eskisi chiqariladi
        this.slots[slot] = { key: this.hostKey!, name: this.hostName, seq: this.seq++ };
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
        this.importSession = null;
        return {};

      case "LIST":
        this.requireUnlocked();
        return { entries: [...this.vault.values()].map((v) => v.meta) };

      case "GET_CREDENTIAL": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        // Qurilma domenni o'zi tekshiradi — extension'ga ishonmaydi.
        if (item.meta.kind === "secret") throw new Fault("ORIGIN_MISMATCH");
        const host = originHost(String(p.origin));
        if (!host || !hostMatchesSite(host, item.meta.site)) throw new Fault("ORIGIN_MISMATCH");
        await this.confirm({ action: "fill", site: item.meta.site, username: item.meta.username });
        return { username: item.meta.username, password: item.password };
      }

      case "ADD_ENTRY": {
        this.requireUnlocked();
        if (p.kind === "secret") return this.addSecret(p);
        const host = originHost(String(p.origin));
        const site = String(p.site);
        if (!host || !siteValid(site, host)) throw new Fault("ORIGIN_MISMATCH");
        const metaBytes = [site, String(p.username), p.title ? String(p.title) : ""].reduce(
          (n, s) => n + new TextEncoder().encode(s).length,
          0,
        );
        if (this.vault.size >= MAX_ENTRIES || metaBytes > META_BUDGET) throw new Fault("INVALID_STATE");
        const inSession = this.activeSession() !== null;
        if (!inSession) await this.confirm({ action: "save", site, username: String(p.username) });
        const meta: EntryMeta = {
          id: crypto.randomUUID(),
          kind: "web",
          site,
          username: String(p.username),
          title: p.title ? String(p.title) : undefined,
          updatedAt: Date.now(),
        };
        const password = p.password ? String(p.password) : generatePassword(Number(p.generateLength) || 20);
        this.vault.set(meta.id, { meta, password });
        if (inSession) this.consumeSession();
        return { entry: meta };
      }

      case "DELETE_ENTRY": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        await this.confirm({ action: "delete", site: this.label(item.meta), username: item.meta.username });
        this.vault.delete(item.meta.id);
        return {};
      }

      case "CHANGE_MASTER": {
        this.requireUnlocked();
        const oldPw = String(p.oldPassword ?? "");
        const newPw = String(p.newPassword ?? "");
        if (newPw.length < 12 || newPw.length > 128 || oldPw.length < 1 || oldPw.length > 128) throw new Fault("INTERNAL");
        // UNLOCK bilan bir xil: hisoblagich tekshiruvdan OLDIN kamayadi.
        this.attempts--;
        if (oldPw !== this.master) {
          if (this.attempts <= 0) {
            this.wipe();
            throw new Fault("WIPED");
          }
          throw new Fault("BAD_PASSWORD");
        }
        this.attempts = MAX_ATTEMPTS;
        await this.confirm({ action: "master" });
        this.master = newPw; // vault yangi kalit bilan qayta shifrlanadi (mock'da parollar ochiq)
        return {};
      }

      case "UPDATE_ENTRY": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        if (p.title === undefined && p.username === undefined && p.password === undefined) throw new Fault("INTERNAL");
        const username = p.username !== undefined ? String(p.username) : item.meta.username;
        const title = p.title !== undefined ? String(p.title) : item.meta.title ?? "";
        if (item.meta.kind === "secret" && title === "") throw new Fault("INVALID_STATE");
        const enc = new TextEncoder();
        if (enc.encode(item.meta.site).length + enc.encode(username).length + enc.encode(title).length > META_BUDGET) {
          throw new Fault("INVALID_STATE");
        }
        await this.confirm({ action: "update", site: this.label(item.meta), username });
        item.meta = { ...item.meta, username, title: title || undefined, updatedAt: Date.now() };
        if (p.password !== undefined) item.password = String(p.password);
        return { entry: item.meta };
      }

      case "REVEAL_SECRET": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        if (item.meta.kind !== "secret") throw new Fault("INVALID_STATE");
        await this.confirm({ action: "reveal", site: this.label(item.meta), username: item.meta.username });
        return { username: item.meta.username, password: item.password };
      }

      case "IMPORT_BEGIN": {
        this.requireUnlocked();
        const count = Number(p.count);
        if (!Number.isInteger(count) || count < 1 || count > MAX_ENTRIES) throw new Fault("INTERNAL");
        if (this.activeSession() || count > MAX_ENTRIES - this.vault.size) throw new Fault("INVALID_STATE");
        await this.confirm({ action: "import", site: `${count} ta yozuv` });
        this.importSession = { remaining: count, added: 0, deadline: Date.now() + IMPORT_SESSION_MS };
        return {};
      }

      case "IMPORT_END": {
        const added = this.activeSession()?.added ?? 0;
        this.importSession = null;
        return { added };
      }

      case "LIST_HOSTS": {
        const cur = this.hostSlot();
        const hosts: { slot: number; fp: string; current: boolean }[] = [];
        this.slots.forEach((h, slot) => {
          if (h) hosts.push({ slot, fp: hostFingerprint(h.key), current: slot === cur });
        });
        return { hosts };
      }

      case "REVOKE_HOST": {
        const slot = Number(p.slot);
        const host = Number.isInteger(slot) ? this.slots[slot] : null;
        if (!host) throw new Fault("NOT_FOUND");
        await this.confirm({ action: "revoke", site: `Slot ${slot}`, username: hostFingerprint(host.key).slice(0, 8) });
        this.closeAfterResponse = slot === this.hostSlot();
        this.slots[slot] = null;
        return {};
      }

      default:
        throw new Fault("INTERNAL");
    }
  }

  /** Tasdiq ekranida ko'rsatiladigan nom: secret uchun title. */
  private label(meta: EntryMeta): string {
    return meta.kind === "secret" ? meta.title ?? "" : meta.site;
  }

  private async addSecret(p: Params): Promise<unknown> {
    const title = typeof p.title === "string" ? p.title : "";
    const username = p.username === undefined ? "" : String(p.username);
    const enc = new TextEncoder();
    if (title.length < 1 || enc.encode(title).length > 64 || username.length > 256) throw new Fault("INVALID_STATE");
    if (!p.password && !p.generateLength) throw new Fault("INVALID_STATE");
    if (this.vault.size >= MAX_ENTRIES || enc.encode(title).length + enc.encode(username).length > META_BUDGET) {
      throw new Fault("INVALID_STATE");
    }
    const inSession = this.activeSession() !== null;
    if (!inSession) await this.confirm({ action: "save", site: title, username });
    const meta: EntryMeta = { id: crypto.randomUUID(), kind: "secret", site: "", username, title, updatedAt: Date.now() };
    const password = p.password ? String(p.password) : generatePassword(Number(p.generateLength));
    this.vault.set(meta.id, { meta, password });
    if (inSession) this.consumeSession();
    return { entry: meta };
  }

  /** Faol import sessiyasi (120 s muddati o'tgan bo'lsa tugatadi). */
  private activeSession() {
    if (this.importSession && Date.now() >= this.importSession.deadline) this.importSession = null;
    return this.importSession;
  }

  private consumeSession() {
    const s = this.importSession;
    if (!s) return;
    s.added++;
    if (--s.remaining <= 0) this.importSession = null;
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
    this.importSession = null;
    this.vault.clear();
    this.slots.fill(null);
    this.master = null;
    this.attempts = MAX_ATTEMPTS;
    this.state = "FACTORY";
    this.deviceKey = generateKeyPair();
  }
}
