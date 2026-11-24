import { encodeFrame, FrameReader, MAX_FRAME_BYTES } from "./cobs";
import type { RawTransport } from "./transport";

/**
 * Qo'llab-quvvatlanadigan USB Vendor ID'lar:
 * 0x303a — Espressif (ESP32-S3 native USB CDC), 0x10c4 — CP210x, 0x1a86 — CH340 (klassik DevKit USB-UART).
 */
const SUPPORTED_VIDS = [0x303a, 0x10c4, 0x1a86];
/** DevKit'da port ochilganda DTR/RTS auto-reset bo'lishi mumkin — boot tugashini kutamiz. */
const RESET_SETTLE_MS = 1200; // DevKit boot ~0.7 s (firmware -O3); erta yuborilgan msg1 yo'qoladi

export class SerialTransport implements RawTransport {
  readonly kind = "usb" as const;

  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly frameListeners = new Set<(frame: Uint8Array) => void>();
  private readonly closeListeners = new Set<() => void>();
  private closed = false;
  private loop: Promise<void> = Promise.resolve();

  private constructor(private readonly port: SerialPort) {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  /** Foydalanuvchi qurilmani tanlaydi (user gesture talab qilinadi). */
  static async request(): Promise<SerialTransport> {
    const port = await navigator.serial.requestPort({ filters: SUPPORTED_VIDS.map((usbVendorId) => ({ usbVendorId })) });
    return new SerialTransport(port);
  }

  /** Avval ruxsat berilgan qurilmaga jim ulanish. */
  static async fromGranted(): Promise<SerialTransport | null> {
    if (!SerialTransport.isSupported()) return null;
    const ports = await navigator.serial.getPorts();
    const port = ports.find((p) => SUPPORTED_VIDS.includes(p.getInfo().usbVendorId ?? -1));
    return port ? new SerialTransport(port) : null;
  }

  async open(): Promise<void> {
    await this.openPort();
    if (!this.port.readable || !this.port.writable) throw new Error("Port streams unavailable");
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.loop = this.readLoop();
    await new Promise((r) => setTimeout(r, RESET_SETTLE_MS));
  }

  /**
   * Uzib-qayta ulashda oldingi ulanishning port.close() si hali tugamagan bo'lishi mumkin
   * (InvalidStateError / NetworkError). Portni majburan yopib, bir necha marta qayta urinadi.
   */
  private async openPort(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await this.port.open({ baudRate: 115_200 });
        return;
      } catch (e) {
        lastError = e;
        if (!(e instanceof DOMException) || (e.name !== "InvalidStateError" && e.name !== "NetworkError")) throw e;
        if (e.name === "InvalidStateError") await this.port.close().catch(() => undefined);
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  /** Port to'liq yopilguncha (reader bekor qilinib, lock'lar bo'shatilib, port.close()) kutadi. */
  async close(): Promise<void> {
    await this.reader?.cancel().catch(() => undefined);
    await this.loop;
  }

  async send(frame: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error("Port not open");
    await this.writer.write(encodeFrame(frame));
  }

  onFrame(listener: (frame: Uint8Array) => void): void {
    this.frameListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  private async readLoop(): Promise<void> {
    // ESP log'lari shu portdan chiqadi — FrameReader ularni CRC/COBS bilan tashlab yuboradi.
    const frames = new FrameReader(MAX_FRAME_BYTES);
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value.includes(0) && value.every((b) => b === 10 || b === 13 || (b >= 32 && b < 127))) {
          console.debug("[kalit-device]", new TextDecoder().decode(value).trim()); // firmware log qatorlari
        }
        for (const frame of frames.push(value)) this.frameListeners.forEach((l) => l(frame));
      }
    } catch {
      /* qurilma uzildi */
    } finally {
      await this.teardown();
    }
  }

  private async teardown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.reader?.releaseLock();
    } catch {
      /* noop */
    }
    try {
      this.writer?.releaseLock();
    } catch {
      /* noop */
    }
    this.reader = null;
    this.writer = null;
    await this.port.close().catch(() => undefined);
    this.closeListeners.forEach((l) => l());
  }
}
