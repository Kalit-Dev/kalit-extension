import type { Transport } from "./transport";

/** Espressif USB Vendor ID (ESP32-S3 native USB CDC). */
const ESPRESSIF_VID = 0x303a;
const MAX_FRAME_BYTES = 16 * 1024;

export class SerialTransport implements Transport {
  readonly kind = "usb" as const;

  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly encoder = new TextEncoder();
  private readonly frameListeners = new Set<(frame: unknown) => void>();
  private readonly closeListeners = new Set<() => void>();
  private closed = false;

  private constructor(private readonly port: SerialPort) {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  /** Foydalanuvchi qurilmani tanlaydi (user gesture talab qilinadi). */
  static async request(): Promise<SerialTransport> {
    const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: ESPRESSIF_VID }] });
    return new SerialTransport(port);
  }

  /** Avval ruxsat berilgan qurilmaga jim ulanish. */
  static async fromGranted(): Promise<SerialTransport | null> {
    if (!SerialTransport.isSupported()) return null;
    const ports = await navigator.serial.getPorts();
    const port = ports.find((p) => p.getInfo().usbVendorId === ESPRESSIF_VID);
    return port ? new SerialTransport(port) : null;
  }

  async open(): Promise<void> {
    await this.port.open({ baudRate: 115_200 });
    if (!this.port.readable || !this.port.writable) throw new Error("Port streams unavailable");
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    void this.readLoop();
  }

  async close(): Promise<void> {
    await this.reader?.cancel().catch(() => undefined);
  }

  async send(frame: unknown): Promise<void> {
    if (!this.writer) throw new Error("Port not open");
    await this.writer.write(this.encoder.encode(`${JSON.stringify(frame)}\n`));
  }

  onFrame(listener: (frame: unknown) => void): void {
    this.frameListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          // Firmware log'lari ham shu portdan kelishi mumkin — faqat JSON qatorlar olinadi.
          if (!line.startsWith("{")) continue;
          try {
            const frame: unknown = JSON.parse(line);
            this.frameListeners.forEach((l) => l(frame));
          } catch {
            /* buzilgan frame — e'tiborsiz */
          }
        }
        if (buffer.length > MAX_FRAME_BYTES) buffer = "";
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
