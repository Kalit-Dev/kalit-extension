import { FramedTransport } from "./framed-transport";
import type { ByteStream } from "./transport";

/**
 * Qo'llab-quvvatlanadigan USB Vendor ID'lar:
 * 0x303a — Espressif (ESP32-S3 native USB CDC), 0x10c4 — CP210x, 0x1a86 — CH340 (klassik DevKit USB-UART).
 */
const SUPPORTED_VIDS = [0x303a, 0x10c4, 0x1a86];
/** DevKit'da port ochilganda DTR/RTS auto-reset bo'lishi mumkin — boot tugashini kutamiz. */
const RESET_SETTLE_MS = 300;

/** Web Serial porti: faqat xom baytlar (kadrlash FramedTransport'da). */
class SerialStream implements ByteStream {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly dataListeners = new Set<(bytes: Uint8Array) => void>();
  private readonly closeListeners = new Set<() => void>();
  private closed = false;

  constructor(private readonly port: SerialPort) {}

  async open(): Promise<void> {
    await this.port.open({ baudRate: 115_200 });
    if (!this.port.readable || !this.port.writable) throw new Error("Port streams unavailable");
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    void this.readLoop();
    await new Promise((r) => setTimeout(r, RESET_SETTLE_MS));
  }

  async close(): Promise<void> {
    await this.reader?.cancel().catch(() => undefined);
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error("Port not open");
    await this.writer.write(bytes);
  }

  onData(listener: (bytes: Uint8Array) => void): void {
    this.dataListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  private async readLoop(): Promise<void> {
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.dataListeners.forEach((l) => l(value));
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

export class SerialTransport extends FramedTransport {
  private constructor(port: SerialPort) {
    super("usb", new SerialStream(port));
  }

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
}
