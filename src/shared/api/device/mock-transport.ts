import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { computeTotp } from "@/shared/lib/totp";
import { decode, encode } from "./cbor";
import { generateKeyPair, NoiseSession, pairingCode, type CipherState, type KeyPair } from "./noise";
import { CONFIRM_TIMEOUT_MS, LIST_PAGE_SIZE, PAIR_VERIFY_TIMEOUT_MS, MAX_ENTRIES, TOTP_PERIOD, TOTP_SEED_MAX, TOTP_SEED_MIN, type ConfirmInfo, type DeviceState, type EntryMeta, type ErrorCode } from "./protocol";
import { generate, genValid, type GenSpec } from "./device-generator";
import { isWeakPassword } from "./device-strength";
import { hostMatchesSite, originHost, siteValid } from "./site-rules";
import type { RawTransport } from "./transport";

/**
 * Qurilmasiz development uchun simulyator. Firmware mantiqini takrorlaydi:
 * Noise_XX responder, host pin (≤4), PIN urinishlari, wipe (= zavod holati), 10 s tasdiq, 500 ms guard.
 * Ma'lumotlar faqat xotirada — panel yopilsa yo'qoladi.
 */

const MAX_ATTEMPTS = 10;
const MAX_HOSTS = 4;
/** site+username+title (bayt) yig'indisi: LIST javobi 8 KiB kadrga sig'sin (firmware kMetaBudget bilan bir xil). */
const META_BUDGET = 160;
const GUARD_MS = 500;
const IMPORT_SESSION_MS = 120_000;
const BACKUP_SESSION_MS = 120_000;
const BACKUP_ITER = 200_000;
const FIRMWARE = "mock-1.1.0";
/** v0.10: AUDIT_PASSWORDS bir javobda eng ko'pi bilan shuncha bayroqli yozuv (firmware kAuditPage). */
const AUDIT_PAGE = 64;

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

/** ADD_ENTRY generator parametrlari (v0.10): `words` charset/generateLength bilan aralashmaydi; standart 20 belgi. */
function genSpec(p: Params): GenSpec {
  return {
    words: p.words === undefined ? undefined : Number(p.words),
    charset: p.charset === undefined ? undefined : Number(p.charset),
    length: p.generateLength !== undefined ? Number(p.generateLength) : p.words === undefined ? 20 : undefined,
  };
}
/** Parol berilmagan bo'lsa generator parametrlari yaroqli bo'lishi shart (tasdiqdan oldin, firmware check_add kabi). */
function checkGenerator(p: Params): void {
  if (!p.password && !genValid(genSpec(p))) throw new Fault("INVALID_STATE");
}

const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * v0.6 FAKE seal (faqat simulyator!): haqiqiy qurilma PBKDF2 + ChaCha20-Poly1305 ishlatadi.
 * Bu yerda kalit = sha256(passphrase|salt|iter), keystream = sha256 hisoblagich rejimi, tag = sha256(kalit|AAD|ct)[0..16].
 * AAD = count+index: bloklarni almashtirish/ko'chirish/chegaradan chiqarish tag'ni buzadi.
 */
function sealKey(passphrase: string, salt: Uint8Array, iter: number): Uint8Array {
  return sha256(concatBytes(utf8ToBytes(passphrase), salt, u32(iter)));
}
function keystream(key: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i * 32 < length; i++) out.set(sha256(concatBytes(key, u32(i))).subarray(0, Math.min(32, length - i * 32)), i * 32);
  return out;
}
const sealTag = (key: Uint8Array, count: number, index: number, ct: Uint8Array) =>
  sha256(concatBytes(key, u32(count), u32(index), ct)).subarray(0, 16);

function seal(key: Uint8Array, count: number, index: number, plain: Uint8Array): Uint8Array {
  const ks = keystream(key, plain.length);
  const ct = plain.map((b, i) => b ^ ks[i]!);
  return concatBytes(ct, sealTag(key, count, index, ct));
}
/** null: autentifikatsiya muvaffaqiyatsiz (noto'g'ri parol YOKI buzilgan/almashtirilgan blob). */
function unseal(key: Uint8Array, count: number, index: number, blob: Uint8Array): Uint8Array | null {
  if (blob.length < 16) return null;
  const ct = blob.subarray(0, blob.length - 16);
  if (!bytesEqual(blob.subarray(blob.length - 16), sealTag(key, count, index, ct))) return null;
  const ks = keystream(key, ct.length);
  return ct.map((b, i) => b ^ ks[i]!);
}

interface Plain {
  kind: "web" | "secret";
  site: string;
  username: string;
  title?: string;
  password: string;
  note?: string;
  /** v0.9: TOTP urug'i (hex). Zaxira blob'i ichida (shifrlangan) yuradi. */
  totp?: string;
}
/** web: kind+site+username; secret (site bo'sh): kind+username+title. */
const dupKey = (kind: string, site: string, username: string, title = "") =>
  kind === "secret" ? `secret\u0000${username}\u0000${title}` : `${kind}\u0000${site}\u0000${username}`;

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
  private readonly vault = new Map<string, { meta: EntryMeta; password: string; note?: string; totp?: Uint8Array }>();
  /** v0.9: GET_TOTP uchun eng so'nggi `now` — orqaga ketgan vaqt rad etiladi (qurilmada RTC yo'q, host'ga ishonilmaydi). */
  private lastTotpNow = 0;

  // Ulanish holati
  private noise: NoiseSession | null = null;
  private cipher: { send: CipherState; recv: CipherState } | null = null;
  private hostKey: string | null = null;
  private sas = "";

  /** v0.5 import sessiyasi: `remaining` ta tugmasiz ADD_ENTRY, `deadline` (Date.now) dan keyin tugaydi. */
  private importSession: { remaining: number; added: number; deadline: number } | null = null;

  /** v0.6 eksport sessiyasi: tasdiqdan keyin 120 s, snapshot'dan blob'lar beriladi. */
  private exportSession: { key: Uint8Array; items: Plain[]; deadline: number } | null = null;
  /** v0.6 tiklash sessiyasi. */
  private restoreSession: {
    key: Uint8Array;
    count: number;
    seen: Set<number>;
    added: number;
    skipped: number;
    deadline: number;
  } | null = null;
  private exportCounter = 0;

  private pending: ((r: ConfirmResult) => void) | null = null;
  private pendingSince = 0;
  /** v0.11: PAIR_HOST kod tanlovini (PAIR_VERIFY) kutmoqda. Tugma bu bosqichda ishlamaydi. */
  private verifying: ((r: boolean | "timeout") => void) | null = null;
  /** PAIR_VERIFY javobi PAIR_HOST natijasi aniq bo'lgach yuboriladi (firmware kabi). */
  private verifyReply: (() => void) | null = null;

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
    this.endBackupSessions();
    this.importSession = null;
    this.endVerify();
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
    this.endBackupSessions();
    this.importSession = null;
    this.noise = null;
    this.cipher = null;
    this.endVerify();
    this.pending?.("reject");
    this.closeListeners.forEach((l) => l());
  }

  /** Ulanish yopildi: kutilayotgan verify bekor (PAIR_HOST USER_REJECTED, hech narsa pin qilinmaydi). */
  private endVerify() {
    this.verifying?.(false);
    this.verifyReply?.();
    this.verifyReply = null;
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
    await this.delay(c === "UNLOCK" || c === "ONBOARD" || c === "CHANGE_MASTER" || c === "EXPORT_BEGIN" || c === "RESTORE_BEGIN" ? 700 : 60); // KDF kechikishi
    try {
      const r = await this.handle(c, p);
      if (this.closeAfterResponse) {
        // Joriy host bekor qilindi: javobdan keyin CLOSED hodisasi va kanal yopiladi.
        this.closeAfterResponse = false;
        this.importSession = null;
        this.endBackupSessions();
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
    // v0.11: kod tanlovi kutilayotganda faqat GET_STATUS va PAIR_VERIFY.
    if (this.verifying && cmd !== "GET_STATUS" && cmd !== "PAIR_VERIFY") throw new Fault("BUSY");
    if (!isTrusted && cmd !== "GET_STATUS" && cmd !== "PAIR_HOST" && cmd !== "PAIR_VERIFY") throw new Fault("NOT_TRUSTED");

    // Eksport sessiyasi snapshot'ni muzlatadi: yozuvlarni o'zgartiruvchi buyruqlar BUSY qaytaradi.
    if (["ADD_ENTRY", "UPDATE_ENTRY", "DELETE_ENTRY", "CHANGE_MASTER"].includes(cmd) && this.activeExport()) throw new Fault("BUSY");

    switch (cmd) {
      case "GET_STATUS":
        return { state: this.state, firmware: FIRMWARE, hostTrusted: isTrusted, attemptsLeft: this.attempts };

      case "PAIR_HOST": {
        if (isTrusted) return {};
        if (this.pending) throw new Fault("BUSY");
        const match = await this.verifyCode();
        try {
          if (!match) {
            this.emitSecure({ ev: "CONFIRM_DONE" });
            throw new Fault("USER_REJECTED");
          }
          await this.confirm({ action: "pair", code: this.sas });
        } finally {
          // PAIR_VERIFY javobi PAIR_HOST javobidan oldin ketadi.
          const reply = this.verifyReply;
          this.verifyReply = null;
          if (reply) {
            reply();
            await wait(0);
          }
        }
        let slot = this.slots.indexOf(null);
        if (slot < 0) slot = this.slots.reduce((m, h, i) => (h!.seq < this.slots[m]!.seq ? i : m), 0); // eng eskisi chiqariladi
        this.slots[slot] = { key: this.hostKey!, name: this.hostName, seq: this.seq++ };
        return {};
      }

      case "PAIR_VERIFY": {
        // Bir martalik: PAIR_HOST kutmayotgan bo'lsa (yoki allaqachon tanlangan/taymer tugagan) INVALID_STATE.
        if (!this.verifying) throw new Fault("INVALID_STATE");
        const replied = new Promise<void>((r) => (this.verifyReply = r));
        this.verifying(p.match === true);
        await replied;
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
        this.endBackupSessions();
        return {};

      case "LIST":
        this.requireUnlocked();
        return this.listPage(p.cursor);

      case "AUDIT_PASSWORDS":
        this.requireUnlocked();
        return this.auditPage(p.cursor);

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
        checkGenerator(p);
        const note = this.noteParam(p);
        const totp = this.totpParam(p);
        const inSession = this.activeSession() !== null;
        if (!inSession) await this.confirm({ action: "save", site, username: String(p.username) });
        const meta: EntryMeta = {
          id: crypto.randomUUID(),
          kind: "web",
          site,
          username: String(p.username),
          title: p.title ? String(p.title) : undefined,
          updatedAt: this.stamp(p),
          ...(note ? { hasNote: true } : {}),
          ...(totp?.length ? { hasTotp: true } : {}),
        };
        const password = p.password ? String(p.password) : generate(genSpec(p));
        this.vault.set(meta.id, { meta, password, ...(note ? { note } : {}), ...(totp?.length ? { totp } : {}) });
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
        if (p.title === undefined && p.username === undefined && p.password === undefined && p.note === undefined && p.totp === undefined) throw new Fault("INTERNAL");
        const note = p.note !== undefined ? this.noteParam(p) : undefined;
        const totp = this.totpParam(p, true);
        const username = p.username !== undefined ? String(p.username) : item.meta.username;
        const title = p.title !== undefined ? String(p.title) : item.meta.title ?? "";
        if (item.meta.kind === "secret" && title === "") throw new Fault("INVALID_STATE");
        const enc = new TextEncoder();
        if (enc.encode(item.meta.site).length + enc.encode(username).length + enc.encode(title).length > META_BUDGET) {
          throw new Fault("INVALID_STATE");
        }
        await this.confirm({ action: "update", site: this.label(item.meta), username });
        item.meta = { ...item.meta, username, title: title || undefined, updatedAt: p.now !== undefined ? this.stamp(p) : item.meta.updatedAt };
        if (p.password !== undefined) item.password = String(p.password);
        if (note !== undefined) {
          item.note = note || undefined;
          item.meta = { ...item.meta, hasNote: note ? true : undefined };
        }
        if (totp !== undefined) {
          item.totp = totp.length ? totp : undefined; // bo'sh = o'chirish
          item.meta = { ...item.meta, hasTotp: totp.length ? true : undefined };
        }
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

      case "GET_NOTE": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        if (!item.note) throw new Fault("INVALID_STATE"); // tasdiqsiz
        await this.confirm({ action: "reveal", site: this.label(item.meta), username: item.meta.username });
        return { note: item.note };
      }

      case "GET_TOTP": {
        this.requireUnlocked();
        const item = this.vault.get(String(p.id));
        if (!item) throw new Fault("NOT_FOUND");
        if (p.origin !== undefined && item.meta.kind === "web") {
          const host = originHost(String(p.origin));
          if (!host || !hostMatchesSite(host, item.meta.site)) throw new Fault("ORIGIN_MISMATCH");
        }
        if (!item.totp) throw new Fault("INVALID_STATE"); // tasdiqsiz
        // Qurilmada RTC yo'q: `now` orqaga ketsa yoki yo'q bo'lsa rad etiladi.
        if (!Number.isInteger(p.now) || p.now <= 0 || p.now < this.lastTotpNow) throw new Fault("INVALID_STATE");
        const requested = Date.now();
        const now: number = p.now;
        await this.confirm({ action: "totp", site: this.label(item.meta), username: item.meta.username });
        // Tasdiq kutilgan vaqt ham hisobga olinadi (qurilma monotonik soat bilan shuncha qo'shadi).
        const t = now + Math.floor((Date.now() - requested) / 1000);
        this.lastTotpNow = Math.max(this.lastTotpNow, t);
        return { code: computeTotp(item.totp, t), validFor: TOTP_PERIOD - (t % TOTP_PERIOD), period: TOTP_PERIOD };
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

      case "EXPORT_BEGIN": {
        this.requireUnlocked();
        const passphrase = String(p.passphrase ?? "");
        const n = utf8ToBytes(passphrase).length;
        if (n < 10 || n > 128 || this.vault.size === 0 || this.anySession()) throw new Fault("INVALID_STATE");
        await this.confirm({ action: "export", site: `${this.vault.size} ta yozuv` });
        // Tasdiq paytida holat o'zgargan bo'lishi mumkin (LOCK/uzilish): qayta tekshiramiz.
        this.requireUnlocked();
        const items: Plain[] = [...this.vault.values()].map(({ meta, password, note, totp }) => ({
          kind: meta.kind,
          site: meta.site,
          username: meta.username,
          ...(meta.title ? { title: meta.title } : {}),
          password,
          ...(note ? { note } : {}),
          ...(totp ? { totp: bytesToHex(totp) } : {}),
        }));
        const salt = sha256(concatBytes(utf8ToBytes("mock-salt"), u32(this.exportCounter++), utf8ToBytes(passphrase))).subarray(0, 16);
        this.exportSession = { key: sealKey(passphrase, salt, BACKUP_ITER), items, deadline: Date.now() + BACKUP_SESSION_MS };
        return { count: items.length, salt, iter: BACKUP_ITER };
      }

      case "EXPORT_GET": {
        this.requireUnlocked();
        const s = this.activeExport();
        const index = Number(p.index);
        if (!s || !Number.isInteger(index) || index < 0 || index >= s.items.length) throw new Fault("INVALID_STATE");
        return { blob: seal(s.key, s.items.length, index, utf8ToBytes(JSON.stringify(s.items[index]))) };
      }

      case "EXPORT_END":
        this.exportSession = null;
        return {};

      case "RESTORE_BEGIN": {
        this.requireUnlocked();
        const passphrase = String(p.passphrase ?? "");
        const n = utf8ToBytes(passphrase).length;
        const count = Number(p.count);
        const iter = Number(p.iter);
        const salt = p.salt;
        if (
          n < 10 || n > 128 ||
          !(salt instanceof Uint8Array) || salt.length !== 16 ||
          !Number.isInteger(iter) || iter < 100_000 || iter > 1_000_000 ||
          !Number.isInteger(count) || count < 1 || count > MAX_ENTRIES ||
          this.anySession()
        ) {
          throw new Fault("INVALID_STATE");
        }
        await this.confirm({ action: "restore", site: `${count} ta yozuv` });
        this.requireUnlocked();
        this.restoreSession = {
          key: sealKey(passphrase, salt, iter),
          count,
          seen: new Set(),
          added: 0,
          skipped: 0,
          deadline: Date.now() + BACKUP_SESSION_MS,
        };
        return {};
      }

      case "RESTORE_ENTRY": {
        this.requireUnlocked();
        const s = this.activeRestore();
        const index = Number(p.index);
        if (!s || !Number.isInteger(index) || index < 0 || index >= s.count || s.seen.has(index) || !(p.blob instanceof Uint8Array)) {
          throw new Fault("INVALID_STATE");
        }
        const plain = unseal(s.key, s.count, index, p.blob);
        if (!plain) {
          this.restoreSession = null; // noto'g'ri parol yoki buzilgan fayl: sessiya tugaydi
          throw new Fault("BAD_PASSWORD");
        }
        const item = this.parsePlain(plain);
        if (!item) throw new Fault("INVALID_STATE");
        s.seen.add(index);
        const k = dupKey(item.kind, item.site, item.username, item.title);
        let result: "added" | "duplicate" = "duplicate";
        if ([...this.vault.values()].some((v) => dupKey(v.meta.kind, v.meta.site, v.meta.username, v.meta.title) === k)) {
          s.skipped++;
        } else {
          if (this.vault.size >= MAX_ENTRIES) {
            s.seen.delete(index); // sessiya qoladi
            throw new Fault("INVALID_STATE");
          }
          result = "added";
          const meta: EntryMeta = {
            id: crypto.randomUUID(),
            kind: item.kind,
            site: item.site,
            username: item.username,
            title: item.title,
            updatedAt: this.stamp(p),
            ...(item.note ? { hasNote: true } : {}),
            ...(item.totp ? { hasTotp: true } : {}),
          };
          this.vault.set(meta.id, {
            meta,
            password: item.password,
            ...(item.note ? { note: item.note } : {}),
            ...(item.totp ? { totp: hexToBytes(item.totp) } : {}),
          });
          s.added++;
        }
        // Oxirgi yozuvdan keyin qurilma sessiyani o'zi yopadi (RESTORE_END keyin {0,0} qaytaradi).
        if (s.seen.size >= s.count) this.restoreSession = null;
        return { result };
      }

      case "RESTORE_END": {
        const s = this.activeRestore();
        this.restoreSession = null;
        return { added: s?.added ?? 0, skipped: s?.skipped ?? 0 };
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

  /** v0.7: LIST sahifasi. Kursor = slot (tartib) indeksi; `next` faqat yana yozuv qolganda. */
  private listPage(rawCursor: unknown) {
    const cursor = rawCursor === undefined ? 0 : Number(rawCursor);
    if (!Number.isInteger(cursor) || cursor < 0) throw new Fault("INTERNAL");
    const all = [...this.vault.values()].map((v) => v.meta);
    const entries = all.slice(cursor, cursor + LIST_PAGE_SIZE);
    const end = cursor + entries.length;
    return end < all.length ? { entries, next: end } : { entries };
  }

  /**
   * v0.10: parol auditi. Takror = parollar bir xil; zaif = device-strength entropiyasi < 60 bit. Faqat id va bayroqlar chiqadi.
   * Kursor firmware kabi tartib indeksi: bayroqli yozuvlar `cursor`dan boshlab AUDIT_PAGE tadan.
   */
  private auditPage(rawCursor: unknown) {
    const cursor = rawCursor === undefined ? 0 : Number(rawCursor);
    if (!Number.isInteger(cursor) || cursor < 0) throw new Fault("INTERNAL");
    const all = [...this.vault.values()];
    const counts = new Map<string, number>();
    for (const v of all) counts.set(v.password, (counts.get(v.password) ?? 0) + 1);
    const flagged = all
      .map((v, index) => ({ index, id: v.meta.id, duplicate: counts.get(v.password)! > 1, weak: isWeakPassword(v.password) }))
      .filter((f) => f.duplicate || f.weak);
    const page = flagged.filter((f) => f.index >= cursor);
    const items = page.slice(0, AUDIT_PAGE).map(({ id, duplicate, weak }) => ({ id, duplicate, weak }));
    const rest = page[AUDIT_PAGE];
    return {
      total: all.length,
      duplicates: flagged.filter((f) => f.duplicate).length,
      weak: flagged.filter((f) => f.weak).length,
      items,
      ...(rest ? { next: rest.index } : {}),
    };
  }

  /** Test hook (v0.7, firmware 1.1.0): qurilma harakatsizlikdan keyin o'zi qulflanadi va `LOCKED` hodisasini yuboradi. */
  triggerAutoLock(): void {
    if (this.state !== "UNLOCKED") return;
    this.state = "LOCKED";
    this.importSession = null;
    this.endBackupSessions();
    this.emitSecure({ ev: "LOCKED" });
  }

  /** v0.8: ixtiyoriy `note` (UTF-8 <= 1024 bayt); yo'q = "". Haddan oshsa INVALID_STATE (tasdiqdan oldin). */
  private noteParam(p: Params): string {
    if (p.note === undefined) return "";
    if (typeof p.note !== "string" || new TextEncoder().encode(p.note).length > 1024) throw new Fault("INVALID_STATE");
    return p.note;
  }

  /** v0.9: ixtiyoriy `totp` urug'i (10..64 bayt; UPDATE'da bo'sh = o'chirish). Noto'g'ri bo'lsa INVALID_STATE (tasdiqdan oldin). */
  private totpParam(p: Params, allowEmpty = false): Uint8Array | undefined {
    if (p.totp === undefined) return undefined;
    if (!(p.totp instanceof Uint8Array)) throw new Fault("INVALID_STATE");
    const empty = allowEmpty && p.totp.length === 0;
    if (!empty && (p.totp.length < TOTP_SEED_MIN || p.totp.length > TOTP_SEED_MAX)) throw new Fault("INVALID_STATE");
    return p.totp;
  }

  /** `now` (unix soniya) — klient qo'shadi; yo'q bo'lsa 0 ("noma'lum"). */
  private stamp(p: Params): number {
    return Number.isInteger(p.now) && p.now >= 0 ? p.now : 0;
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
    if (!p.password && p.generateLength === undefined && p.charset === undefined && p.words === undefined) throw new Fault("INVALID_STATE");
    checkGenerator(p);
    if (this.vault.size >= MAX_ENTRIES || enc.encode(title).length + enc.encode(username).length > META_BUDGET) {
      throw new Fault("INVALID_STATE");
    }
    const note = this.noteParam(p);
    const totp = this.totpParam(p);
    const inSession = this.activeSession() !== null;
    if (!inSession) await this.confirm({ action: "save", site: title, username });
    const meta: EntryMeta = {
      id: crypto.randomUUID(),
      kind: "secret",
      site: "",
      username,
      title,
      updatedAt: this.stamp(p),
      ...(note ? { hasNote: true } : {}),
      ...(totp?.length ? { hasTotp: true } : {}),
    };
    const password = p.password ? String(p.password) : generate(genSpec(p));
    this.vault.set(meta.id, { meta, password, ...(note ? { note } : {}), ...(totp?.length ? { totp } : {}) });
    if (inSession) this.consumeSession();
    return { entry: meta };
  }

  private anySession() {
    return this.activeSession() !== null || this.activeExport() !== null || this.activeRestore() !== null;
  }

  private endBackupSessions() {
    this.exportSession = null;
    this.restoreSession = null;
  }

  private activeExport() {
    if (this.exportSession && Date.now() >= this.exportSession.deadline) this.exportSession = null;
    return this.exportSession;
  }

  private activeRestore() {
    if (this.restoreSession && Date.now() >= this.restoreSession.deadline) this.restoreSession = null;
    return this.restoreSession;
  }

  private parsePlain(bytes: Uint8Array): Plain | null {
    try {
      const o = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Plain>;
      const enc = new TextEncoder();
      const title = o.title ?? "";
      if (
        (o.kind !== "web" && o.kind !== "secret") ||
        typeof o.site !== "string" || typeof o.username !== "string" || typeof o.password !== "string" ||
        typeof title !== "string" || o.password.length < 1 ||
        (o.kind === "web" ? o.site.length < 3 || o.username.length < 1 : o.site !== "" || title.length < 1) ||
        enc.encode(o.site).length + enc.encode(o.username).length + enc.encode(title).length > META_BUDGET
      ) {
        return null;
      }
      if (o.note !== undefined && (typeof o.note !== "string" || enc.encode(o.note).length > 1024)) return null;
      if (o.totp !== undefined) {
        if (typeof o.totp !== "string" || !/^([0-9a-f]{2}){10,64}$/.test(o.totp)) return null;
      }
      return {
        kind: o.kind,
        site: o.site,
        username: o.username,
        password: o.password,
        ...(title ? { title } : {}),
        ...(o.note ? { note: o.note } : {}),
        ...(o.totp ? { totp: o.totp } : {}),
      };
    } catch {
      return null;
    }
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

  /** v0.11: SAS solishtirish bosqichi (tugma o'chiq). true = mos, false = rad; taymer -> TIMEOUT. */
  private verifyCode(): Promise<boolean> {
    this.emitSecure({ ev: "CONFIRM_PENDING", d: { action: "pair", code: this.sas, phase: "verify", timeoutMs: PAIR_VERIFY_TIMEOUT_MS } });
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => this.verifying?.("timeout"), PAIR_VERIFY_TIMEOUT_MS);
      this.verifying = (r) => {
        clearTimeout(timer);
        this.verifying = null;
        if (r !== "timeout") return resolve(r);
        this.emitSecure({ ev: "CONFIRM_DONE" });
        reject(new Fault("TIMEOUT"));
      };
    });
  }

  private requireUnlocked() {
    if (this.state !== "UNLOCKED") throw new Fault("LOCKED");
  }

  /** Zavod holati: vault, pin qilingan hostlar va qurilma kaliti yo'qoladi. */
  private wipe() {
    this.importSession = null;
    this.endBackupSessions();
    this.vault.clear();
    this.slots.fill(null);
    this.master = null;
    this.attempts = MAX_ATTEMPTS;
    this.state = "FACTORY";
    this.deviceKey = generateKeyPair();
  }
}
