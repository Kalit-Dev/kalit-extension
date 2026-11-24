export type TransportKind = "usb" | "mock";

/** Baytli kadrlarni tashiydi (COBS/CRC allaqachon yechilgan). USB, BLE, mock shu interfeysni amalga oshiradi. */
export interface RawTransport {
  readonly kind: TransportKind;
  open(): Promise<void>;
  close(): Promise<void>;
  send(frame: Uint8Array): Promise<void>;
  onFrame(listener: (frame: Uint8Array) => void): void;
  onClose(listener: () => void): void;
}

/** DeviceClient ishlatadigan obyekt darajasidagi transport (SecureTransport shuni beradi). */
export interface Transport {
  readonly kind: TransportKind;
  open(): Promise<void>;
  close(): Promise<void>;
  send(frame: unknown): Promise<void>;
  onFrame(listener: (frame: unknown) => void): void;
  onClose(listener: () => void): void;
}
