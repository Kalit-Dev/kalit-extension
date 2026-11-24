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

/** FIRMWARE_OUTDATED: firmware v0.11 kod tanlovini (PAIR_VERIFY, 1.3.0+) qo'llamaydi — pair() yuborilmaydi. */
export type ClientErrorCode = ErrorCode | "DISCONNECTED" | "PROTOCOL" | "NO_PORT" | "PORT_BUSY" | "FIRMWARE_OUTDATED";

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
   * `choose` natijasi PAIR_VERIFY {match} bilan yuboriladi. match=true: qurilma tugmasiz darhol pin qiladi
   * (kadrlar: CONFIRM_DONE, PAIR_VERIFY {}, PAIR_HOST {}).
   *
   * Mos kelmadi (`choose` -> false / xato): PAIR_VERIFY {match:false} yuboriladi va DARHOL USER_REJECTED
   * (`choose` DeviceError tashlasa — o'sha xato) qaytariladi; PAIR_HOST'ning keyingi natijasi yutiladi.
   * Fail-closed: faqat verify hodisasi kelgan, tanlov `true` va PAIR_HOST muvaffaqiyatli bo'lsa resolve bo'ladi.
   * PAIR_HOST {} kelib, verify bo'lmagan (eski firmware / MITM) -> PROTOCOL. Kodsiz verify hodisasi -> PROTOCOL.
   * PAIR_HOST xatosi (USER_REJECTED, TIMEOUT...) tanlovdan oldin yoki keyin kelsa — o'zicha qaytariladi.
   * PAIR_HOST tugagach PAIR_VERIFY yuborilmaydi (kech javobning ma'nosi yo'q).
   * Faqat pin qilinmagan host uchun chaqiriladi (pin qilingan host verify bosqichisiz {} oladi -> PROTOCOL).
   *
   * DIQQAT: `info.code` qurilmadan keladi va ISHONCHSIZ. Chaqiruvchi foydalanuvchi tanlovini host'ning o'zi
   * hisoblagan pairing kodi (`SecureTransport.pairingCode`) bilan solishtirishi shart.
   */
  pair(choose: (info: ConfirmInfo & { code: string }) => boolean | Promise<boolean>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let done = false;
      let verifySeen = false;
      /** null = tanlov kutilmoqda. */
      let match: boolean | null = null;
      let host: { ok: true } | { ok: false; error: unknown } | null = null;

      const finish = (error?: unknown) => {
        if (done) return;
        done = true;
        off();
        if (error === undefined) resolve();
        else reject(error);
      };
      /** Ikkala natija ham ma'lum bo'lganda (yoki xato) qaror. */
      const decide = () => {
        if (done || !host) return;
        if (!host.ok) return finish(host.error);
        if (!verifySeen) return finish(new DeviceError("PROTOCOL"));
        if (match === true) finish();
      };

      const off = this.onEvent((e) => {
        if (verifySeen || done || e.event !== "CONFIRM_PENDING" || e.data.action !== "pair" || e.data.phase !== "verify") return;
        verifySeen = true;
        const info = e.data;
        void (async () => {
          let failure: unknown;
          if (info.code === undefined) {
            failure = new DeviceError("PROTOCOL");
          } else {
            try {
              if ((await choose({ ...info, code: info.code })) !== true) failure = new DeviceError("USER_REJECTED");
            } catch (err) {
              failure = err instanceof DeviceError ? err : new DeviceError("USER_REJECTED");
            }
          }
          if (done) return;
          match = failure === undefined;
          // PAIR_HOST allaqachon tugagan bo'lsa PAIR_VERIFY yuborilmaydi. Xatosi (masalan kech: INVALID_STATE) yutiladi.
          if (!host) void this.call("PAIR_VERIFY", { match }).catch(() => undefined);
          if (failure !== undefined) return finish(failure); // PAIR_HOST kutilmaydi
          decide();
        })();
      });

      this.call("PAIR_HOST", {}).then(
        () => {
          host = { ok: true };
          decide();
        },
        (error: unknown) => {
          host = { ok: false, error };
          decide();
        },
      );
    });
  }

  call<K extends CommandName>(cmd: K, params: Params<K>): Promise<Result<K>> {
    const def = Commands[cmd];
    const paramsSchema: z.ZodType = def.params;
    const resultSchema: z.ZodType = def.result;
    const id = ++this.seq;
    const timeoutMs = cmd === "CHANGE_MASTER"
      ? CONFIRM_TIMEOUT_MS + 2 * KDF_TIMEOUT_MS
      : cmd === "PAIR_HOST"
      ? PAIR_VERIFY_TIMEOUT_MS + 2_000 // v0.11: faqat kod tanlovi; match=true dan keyin tugma bosqichi yo'q
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
