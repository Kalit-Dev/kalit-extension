import { siteOf } from "@/lib/domain";
import {
  CONFIRM_TIMEOUT_MS,
  type ConfirmInfo,
  type DeviceState,
  type EntryMeta,
  type ErrorCode,
} from "./protocol";
import type { Transport } from "./transport";

/**
 * Qurilmasiz development uchun simulyator. Firmware mantiqini takrorlaydi:
 * PIN urinishlari, wipe, host pairing, 10 s tasdiq, 500 ms guard time.
 * Ma'lumotlar faqat xotirada — panel yopilsa yo'qoladi.
 */

const MAX_ATTEMPTS = 10;
const GUARD_MS = 500;
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
  id: number;
  cmd: string;
  params?: Params;
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

export class MockTransport implements Transport {
  readonly kind = "mock" as const;

  private readonly frameListeners = new Set<(frame: unknown) => void>();
  private readonly closeListeners = new Set<() => void>();

  private state: DeviceState = "FACTORY";
  private master: string | null = null;
  private attempts = MAX_ATTEMPTS;
  private readonly trusted = new Set<string>();
  private sessionHost: string | null = null;
  private readonly vault = new Map<string, { meta: EntryMeta; password: string }>();

  private pending: ((r: ConfirmResult) => void) | null = null;
  private pendingSince = 0;

  async open(): Promise<void> {
    await wait(300);
  }

  async close(): Promise<void> {
    this.pending?.("reject");
    this.closeListeners.forEach((l) => l());
  }

  async send(frame: unknown): Promise<void> {
    void this.process(frame as Request);
  }

  onFrame(listener: (frame: unknown) => void): void {
    this.frameListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  /** Jismoniy tugmani simulyatsiya qiladi. */
  press(kind: "short" | "long"): void {
    if (!this.pending || Date.now() - this.pendingSince < GUARD_MS) return;
    this.pending(kind === "short" ? "accept" : "reject");
  }

  private emit(frame: unknown) {
    setTimeout(() => this.frameListeners.forEach((l) => l(frame)), 0);
  }

  private async process({ id, cmd, params = {} }: Request) {
    await wait(cmd === "UNLOCK" || cmd === "ONBOARD" ? 700 : 60); // KDF kechikishi
    try {
      this.emit({ id, ok: true, result: await this.handle(cmd, params) });
    } catch (e) {
      this.emit({ id, ok: false, error: e instanceof Fault ? e.code : "INTERNAL" });
    }
  }

  private async handle(cmd: string, p: Params): Promise<unknown> {
    switch (cmd) {
      case "GET_STATUS":
        this.sessionHost = String(p.hostId);
        return {
          state: this.state,
          firmware: "mock-0.1.0",
          hostTrusted: this.trusted.has(this.sessionHost),
          attemptsLeft: this.attempts,
        };

      case "PAIR_HOST": {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        await this.confirm({ action: "pair", code });
        this.trusted.add(String(p.hostId));
        this.sessionHost = String(p.hostId);
        return {};
      }

      case "ONBOARD":
        this.requireTrusted();
        if (this.state !== "FACTORY") throw new Fault("INVALID_STATE");
        this.master = String(p.masterPassword);
        this.state = "UNLOCKED";
        return {};

      case "UNLOCK":
        this.requireTrusted();
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
        if (siteOf(String(p.origin)) !== item.meta.site) throw new Fault("ORIGIN_MISMATCH");
        await this.confirm({ action: "fill", site: item.meta.site, username: item.meta.username });
        return { username: item.meta.username, password: item.password };
      }

      case "ADD_ENTRY": {
        this.requireUnlocked();
        const site = siteOf(String(p.origin));
        if (!site) throw new Fault("INVALID_STATE");
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
    this.emit({ event: "CONFIRM_PENDING", data: { ...info, timeoutMs: CONFIRM_TIMEOUT_MS } });

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.pending?.("timeout"), CONFIRM_TIMEOUT_MS);
      this.pending = (result) => {
        clearTimeout(timer);
        this.pending = null;
        this.emit({ event: "CONFIRM_DONE" });
        if (result === "accept") resolve();
        else reject(new Fault(result === "timeout" ? "TIMEOUT" : "USER_REJECTED"));
      };
    });
  }

  private requireTrusted() {
    if (!this.sessionHost || !this.trusted.has(this.sessionHost)) throw new Fault("NOT_TRUSTED");
  }

  private requireUnlocked() {
    this.requireTrusted();
    if (this.state !== "UNLOCKED") throw new Fault("LOCKED");
  }

  private wipe() {
    this.vault.clear();
    this.trusted.clear();
    this.master = null;
    this.attempts = MAX_ATTEMPTS;
    this.state = "FACTORY";
  }
}
