import { encodeFrame, FrameReader, MAX_FRAME_BYTES } from "./cobs";
import type { ByteStream, RawTransport, TransportKind } from "./transport";

/**
 * Har qanday `ByteStream` ustida `0x00 | COBS(data‖CRC16) | 0x00` kadrlash (docs/protocol-v0.2.md §2).
 * USB (Web Serial), BLE va Tauri transportlari shu klassni qayta ishlatadi: protokol kodi transportni bilmaydi.
 */
export class FramedTransport implements RawTransport {
  private readonly frameListeners = new Set<(frame: Uint8Array) => void>();
  private readonly closeListeners = new Set<() => void>();
  private readonly reader = new FrameReader(MAX_FRAME_BYTES);
  private closed = false;

  constructor(
    readonly kind: TransportKind,
    private readonly stream: ByteStream,
  ) {
    // ESP log qatorlari ham shu oqimdan keladi: FrameReader ularni CRC/COBS bilan tashlab yuboradi.
    stream.onData((bytes) => {
      for (const frame of this.reader.push(bytes)) this.frameListeners.forEach((l) => l(frame));
    });
    stream.onClose(() => {
      if (this.closed) return;
      this.closed = true;
      this.closeListeners.forEach((l) => l());
    });
  }

  open(): Promise<void> {
    return this.stream.open();
  }

  close(): Promise<void> {
    return this.stream.close();
  }

  send(frame: Uint8Array): Promise<void> {
    return this.stream.write(encodeFrame(frame));
  }

  onFrame(listener: (frame: Uint8Array) => void): void {
    this.frameListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }
}
