import { z } from "zod";
import {
  Commands,
  BACKUP_KDF_TIMEOUT_MS,
  CONFIRM_TIMEOUT_MS,
  KDF_TIMEOUT_MS,
  AUDIT_MAX_PAGES,
  LIST_MAX_PAGES,
  PAIR_VERIFY_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  WireEvent,
  WireResponse,
  type CommandName,
  type ConfirmInfo,
  type DeviceEvent,
  type ErrorCode,
  type AuditItem,
  type AuditReport,
  type EntryMeta,
} from "./protocol";
import type { Transport } from "./transport";

export type ClientErrorCode = ErrorCode | "DISCONNECTED" | "PROTOCOL" | "NO_PORT" | "PORT_BUSY";

export class DeviceError extends Error {
  /** Kutilmagan (INTERNAL) xatolarda haqiqiy sabab: "Nom: xabar". */
  constructor(
    readonly code: ClientErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "DeviceError";
  }
}

type Params<K extends CommandName> = z.input<(typeof Commands)[K]["params"]>;
type Result<K extends CommandName> = z.output<(typeof Commands)[K]["result"]>;

interface Inflight {
  resolve(raw: unknown): void;
  reject(error: DeviceError): void;
  timer: ReturnType<typeof setTimeout>;
}

/** v0.7: bu buyruqlarga `now` (unix soniya) avtomatik qo'shiladi: qurilma uni updatedAt qilib saqlaydi. */
const STAMPED = new Set<CommandName>(["ADD_ENTRY", "UPDATE_ENTRY", "RESTORE_ENTRY", "GET_TOTP"]);
export const unixNow = () => Math.floor(Date.now() / 1000);

/** Request/response korrelyatsiyasi, timeout va zod validatsiyasi. */
export class DeviceClient {
  private seq = 0;
  private readonly inflight = new Map<number, Inflight>();
  private readonly listeners = new Set<(event: DeviceEvent) => void>();

  constructor(readonly transport: Transport) {
    transport.onFrame((frame) => this.handleFrame(frame));
    transport.onClose(() => this.failAll(new DeviceError("DISCONNECTED")));
  }

  onEvent(listener: (event: DeviceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** v0.7: sahifalangan LIST ni oxirigacha o'qib, to'liq ro'yxatni qaytaradi. */
  async listAll(): Promise<EntryMeta[]> {
    const all: EntryMeta[] = [];
    let cursor = 0;
    for (let page = 0; page < LIST_MAX_PAGES; page++) {
      const res = await this.call("LIST", cursor === 0 ? {} : { cursor });
      all.push(...res.entries);
      if (res.next === undefined) return all;
      if (res.next <= cursor) throw new DeviceError("PROTOCOL"); // kursor oldinga siljimadi: cheksiz sikl himoyasi
      cursor = res.next;
    }
    throw new DeviceError("PROTOCOL");
  }

  /**
   * v0.10: sahifalangan AUDIT_PASSWORDS ni oxirigacha o'qiydi. Sonlar butun vault bo'yicha (har sahifada bir xil);
   * `flags` faqat bayroqlangan yozuvlar. Vault sahifalar orasida o'zgarsa natija taxminiy bo'lishi mumkin.
   */
  async auditAll(): Promise<AuditReport> {
    const items: AuditItem[] = [];
    let cursor = 0;
    for (let page = 0; page < AUDIT_MAX_PAGES; page++) {
      const res = await this.call("AUDIT_PASSWORDS", cursor === 0 ? {} : { cursor });
      items.push(...res.items);
      if (res.next === undefined) return { total: res.total, duplicates: res.duplicates, weak: res.weak, items };
      if (res.next <= cursor) throw new DeviceError("PROTOCOL");
      cursor = res.next;
    }
    throw new DeviceError("PROTOCOL");
  }

  /** v0.9: TOTP kodi (qurilmada tugma bilan tasdiqlanadi). `now` avtomatik qo'shiladi. */
  getTotp(id: string, origin?: string): Promise<Result<"GET_TOTP">> {
    return this.call("GET_TOTP", origin === undefined ? { id } : { id, origin });
  }

  /**
   * v0.11: PAIR_HOST + PAIR_VERIFY. PAIR_HOST ochiq turadi; `phase:"verify"` li CONFIRM_PENDING kelganda
   * `choose` natijasi PAIR_VERIFY {match} bilan yuboriladi. `choose` xato bersa = match=false.
   * Natija PAIR_HOST javobi (pin qilingan host uchun verify bosqichi bo'lmaydi). Kodsiz verify hodisasi -> PROTOCOL.
   */
  async pair(choose: (info: ConfirmInfo & { code: string }) => boolean | Promise<boolean>): Promise<void> {
    let started = false;
    let protocolError = false;
    const off = this.onEvent((e) => {
      if (started || e.event !== "CONFIRM_PENDING" || e.data.action !== "pair" || e.data.phase !== "verify") return;
      started = true;
      const info = e.data;
      const decide = async () => {
        if (info.code === undefined) {
          protocolError = true;
          return false;
        }
        try {
          return (await choose({ ...info, code: info.code })) === true;
        } catch {
          return false;
        }
      };
      // PAIR_VERIFY xatosi (masalan kech: INVALID_STATE) PAIR_HOST natijasida aks etadi.
      void decide().then((match) => this.call("PAIR_VERIFY", { match })).catch(() => undefined);
    });
    try {
      await this.call("PAIR_HOST", {});
    } catch (e) {
      if (protocolError) throw new DeviceError("PROTOCOL");
      throw e;
    } finally {
      off();
    }
    if (protocolError) throw new DeviceError("PROTOCOL");
  }

  call<K extends CommandName>(cmd: K, params: Params<K>): Promise<Result<K>> {
    const def = Commands[cmd];
    const paramsSchema: z.ZodType = def.params;
    const resultSchema: z.ZodType = def.result;
    const id = ++this.seq;
    const timeoutMs = cmd === "CHANGE_MASTER"
      ? CONFIRM_TIMEOUT_MS + 2 * KDF_TIMEOUT_MS
      : cmd === "PAIR_HOST"
      ? PAIR_VERIFY_TIMEOUT_MS + CONFIRM_TIMEOUT_MS + 2_000
      : cmd === "EXPORT_BEGIN" || cmd === "RESTORE_BEGIN"
      ? CONFIRM_TIMEOUT_MS + BACKUP_KDF_TIMEOUT_MS
      : def.confirm
      ? CONFIRM_TIMEOUT_MS + 2_000
      : cmd === "UNLOCK" || cmd === "ONBOARD" || cmd === "CHANGE_MASTER"
        ? KDF_TIMEOUT_MS
        : REQUEST_TIMEOUT_MS;

    return new Promise<Result<K>>((resolve, reject) => {
      const timer = setTimeout(() => this.settle(id, new DeviceError("TIMEOUT")), timeoutMs);
      this.inflight.set(id, {
        resolve: (raw) => {
          const parsed = resultSchema.safeParse(raw);
          if (parsed.success) resolve(parsed.data as Result<K>);
          else reject(new DeviceError("PROTOCOL"));
        },
        reject,
        timer,
      });
      this.transport
        .send({ id, cmd, params: paramsSchema.parse(STAMPED.has(cmd) ? { ...params, now: unixNow() } : params) })
        .catch(() => this.settle(id, new DeviceError("DISCONNECTED")));
    });
  }

  private handleFrame(frame: unknown) {
    if (frame && typeof frame === "object" && "event" in frame) {
      const event = WireEvent.safeParse(frame);
      if (event.success) this.listeners.forEach((l) => l(event.data));
      return;
    }
    const res = WireResponse.safeParse(frame);
    if (!res.success) return;
    const pending = this.inflight.get(res.data.id);
    if (!pending) return;
    this.inflight.delete(res.data.id);
    clearTimeout(pending.timer);
    if (res.data.ok) pending.resolve(res.data.result);
    else pending.reject(new DeviceError(res.data.error));
  }

  private settle(id: number, error: DeviceError) {
    const pending = this.inflight.get(id);
    if (!pending) return;
    this.inflight.delete(id);
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private failAll(error: DeviceError) {
    for (const id of [...this.inflight.keys()]) this.settle(id, error);
  }
}
