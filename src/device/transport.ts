export type TransportKind = "usb" | "mock";

/** Har qanday ulanish turi (USB, BLE, mock) shu interfeysni amalga oshiradi. */
export interface Transport {
  readonly kind: TransportKind;
  open(): Promise<void>;
  close(): Promise<void>;
  send(frame: unknown): Promise<void>;
  onFrame(listener: (frame: unknown) => void): void;
  onClose(listener: () => void): void;
}
