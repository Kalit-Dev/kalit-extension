import { md5 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { boardForChip, type VerifiedRelease } from "./release";
import { FirmwareError } from "./verify";

export type FlashStage = "connecting" | "writing" | "resetting" | "done";
export interface FlashProgress {
  stage: FlashStage;
  /** 0..1 (faqat `writing`). */
  fraction: number;
  chip?: string;
}

const FLASH_BAUD = 460_800;
const ROM_BAUD = 115_200;

/**
 * Tekshirilgan release'ni portga yozadi (esptool-js, ROM bootloader orqali). Port boshqa hujjatda ochiq bo'lmasligi shart.
 * Faqat `vault` bo'limlari (nvs, kvault) yozilmaydi, ya'ni mavjud yozuvlar saqlanadi.
 * esptool-js og'ir, shuning uchun faqat kerak bo'lganda yuklanadi.
 */
export async function flashRelease(
  port: SerialPort,
  release: VerifiedRelease,
  onProgress: (p: FlashProgress) => void,
): Promise<{ chip: string; version: string }> {
  const { ESPLoader, Transport } = await import("esptool-js");
  const transport = new Transport(port);
  const log = (...a: unknown[]) => console.debug("[kalit-flash]", ...a);
  try {
    onProgress({ stage: "connecting", fraction: 0 });
    const loader = new ESPLoader({
      transport,
      baudrate: FLASH_BAUD,
      romBaudrate: ROM_BAUD,
      terminal: { clean: () => undefined, write: (s) => log(s), writeLine: (s) => log(s) },
    });
    try {
      await loader.main();
    } catch (e) {
      throw new FirmwareError("FLASH_FAILED", `bootloader'ga ulanib bo'lmadi: ${e instanceof Error ? e.message : String(e)}`);
    }
    const chip = loader.chip.CHIP_NAME;
    // Boshqa chip uchun imzolangan image'ni yozish qurilmani buzadi: chip release'dagi bilan aynan mos kelishi shart.
    const board = boardForChip(release, chip);
    onProgress({ stage: "connecting", fraction: 0, chip });

    const total = board.images.reduce((n, i) => n + i.data.length, 0);
    const sizes = board.images.map((i) => i.data.length);
    try {
      await loader.writeFlash({
        fileArray: board.images.map((i) => ({ data: i.data, address: i.address })),
        flashMode: board.manifest.flashMode,
        flashFreq: board.manifest.flashFreq,
        flashSize: board.manifest.flashSize,
        eraseAll: false, // nvs/kvault (vault) saqlanadi
        compress: true,
        reportProgress: (idx, written, size) => {
          const before = sizes.slice(0, idx).reduce((a, b) => a + b, 0);
          onProgress({ stage: "writing", fraction: Math.min(1, (before + (written / size) * (sizes[idx] ?? 0)) / total), chip });
        },
        calculateMD5Hash: (image) => bytesToHex(md5(image)), // esptool-js yozilgandan keyin qurilmadagi MD5 bilan solishtiradi
      });
    } catch (e) {
      throw new FirmwareError("FLASH_FAILED", e instanceof Error ? e.message : String(e));
    }

    onProgress({ stage: "resetting", fraction: 1, chip });
    await loader.after("hard_reset");
    onProgress({ stage: "done", fraction: 1, chip });
    return { chip, version: board.manifest.version };
  } finally {
    await transport.disconnect().catch(() => undefined);
  }
}
