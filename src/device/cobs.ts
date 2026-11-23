/**
 * Kalit wire framing: 0x00 | COBS(data || CRC16) | 0x00
 *
 * - COBS body'da 0x00 uchramaydi, shuning uchun 0x00 kadr chegarasi bo'lib xizmat qiladi.
 * - Oldingi 0x00 qabul qiluvchini ESP log'idan keyin qayta sinxronlaydi.
 * - CRC16 log qatori yoki buzilgan baytlarni kadr deb qabul qilishdan saqlaydi
 *   (AEAD xatosi kanalni yopgani uchun axlat kadr AEAD'ga yetib bormasligi kerak).
 */

export const MAX_FRAME_BYTES = 8 * 1024;

export function cobsEncode(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + Math.floor(data.length / 254) + 1);
  let codeIdx = 0;
  let code = 1;
  let o = 1;
  for (const b of data) {
    if (b === 0) {
      out[codeIdx] = code;
      codeIdx = o++;
      code = 1;
    } else {
      out[o++] = b;
      if (++code === 0xff) {
        out[codeIdx] = code;
        codeIdx = o++;
        code = 1;
      }
    }
  }
  out[codeIdx] = code;
  return out.subarray(0, o);
}

export function cobsDecode(data: Uint8Array): Uint8Array | null {
  if (data.length === 0) return null;
  const out = new Uint8Array(data.length);
  let o = 0;
  let i = 0;
  while (i < data.length) {
    const code = data[i++]!;
    if (code === 0) return null;
    const end = i + code - 1;
    if (end > data.length) return null;
    for (; i < end; i++) {
      const b = data[i]!;
      if (b === 0) return null;
      out[o++] = b;
    }
    if (code < 0xff && i < data.length) out[o++] = 0;
  }
  return out.slice(0, o);
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (const b of data) {
    crc ^= b << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** Portga yuboriladigan to'liq kadr: 0x00 | COBS(data||crc) | 0x00. */
export function encodeFrame(data: Uint8Array): Uint8Array {
  const withCrc = new Uint8Array(data.length + 2);
  withCrc.set(data);
  const crc = crc16(data);
  withCrc[data.length] = crc >> 8;
  withCrc[data.length + 1] = crc & 0xff;
  const body = cobsEncode(withCrc);
  const out = new Uint8Array(body.length + 2);
  out.set(body, 1); // out[0] va oxirgi bayt = 0x00
  return out;
}

/** Oqimdan kadrlarni ajratadi; buzilgan, oversize va log qatorlarini jim tashlaydi. */
export class FrameReader {
  private buf: number[] = [];
  private overflow = false;
  private readonly maxEncoded: number;

  constructor(private readonly maxFrame = MAX_FRAME_BYTES) {
    const withCrc = maxFrame + 2;
    this.maxEncoded = withCrc + Math.ceil(withCrc / 254) + 1;
  }

  push(chunk: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    for (const b of chunk) {
      if (b !== 0) {
        if (this.overflow) continue;
        if (this.buf.length >= this.maxEncoded) {
          this.overflow = true;
          this.buf = [];
        } else this.buf.push(b);
        continue;
      }
      const encoded = this.buf;
      const dropped = this.overflow;
      this.buf = [];
      this.overflow = false;
      if (dropped || encoded.length === 0) continue;
      const frame = this.decode(Uint8Array.from(encoded));
      if (frame) frames.push(frame);
    }
    return frames;
  }

  private decode(encoded: Uint8Array): Uint8Array | null {
    const raw = cobsDecode(encoded);
    if (!raw || raw.length < 2 || raw.length - 2 > this.maxFrame) return null;
    const data = raw.subarray(0, raw.length - 2);
    const crc = (raw[raw.length - 2]! << 8) | raw[raw.length - 1]!;
    return crc === crc16(data) ? data.slice() : null;
  }
}
