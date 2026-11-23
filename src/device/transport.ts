export type TransportKind = "usb" | "ble" | "tauri" | "mock";

/**
 * Xom bayt oqimi (framing yo'q): Web Serial porti, BLE GATT characteristic'lari, Tauri (Rust) backend kanali.
 * Yangi transport faqat shuni amalga oshiradi; COBS/CRC kadrlash `FramedTransport` da (bir joyda).
 */
export interface ByteStream {
  open(): Promise<void>;
  close(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  /** Kelgan baytlar (ixtiyoriy bo'laklarda: BLE MTU, serial chunk). */
  onData(listener: (bytes: Uint8Array) => void): void;
  /** Oqim yopilganda (uzilish, close) bir marta chaqiriladi. */
  onClose(listener: () => void): void;
}

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
