import { z } from "zod";
import {
  Commands,
  CONFIRM_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  WireEvent,
  WireResponse,
  type CommandName,
  type DeviceEvent,
  type ErrorCode,
} from "./protocol";
import type { Transport } from "./transport";

export type ClientErrorCode = ErrorCode | "DISCONNECTED" | "PROTOCOL";

export class DeviceError extends Error {
  constructor(readonly code: ClientErrorCode) {
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

  call<K extends CommandName>(cmd: K, params: Params<K>): Promise<Result<K>> {
    const def = Commands[cmd];
    const paramsSchema: z.ZodType = def.params;
    const resultSchema: z.ZodType = def.result;
    const id = ++this.seq;
    const timeoutMs = def.confirm ? CONFIRM_TIMEOUT_MS + 2_000 : REQUEST_TIMEOUT_MS;

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
        .send({ id, cmd, params: paramsSchema.parse(params) })
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
