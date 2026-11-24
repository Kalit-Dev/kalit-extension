import { z } from "zod";
import { FirmwareError } from "./verify";
import { parseVersion } from "./version";

const hexOffset = z.string().regex(/^0x[0-9a-f]{1,8}$/i).transform((s) => Number.parseInt(s, 16));
const fileName = z.string().regex(/^[A-Za-z0-9._-]{1,64}\.bin$/);

/** `<env>-flash.json` (imzolangan SHA256SUMS ichida). Chip, flash parametrlari va offsetlar shu yerdan olinadi. */
export const FlashManifest = z.object({
  schema: z.literal(1),
  board: z.string().regex(/^[a-z0-9]{3,16}$/),
  chip: z.enum(["ESP32", "ESP32-C3"]),
  version: z.string().refine((v) => parseVersion(v) !== null, "versiya MAJOR.MINOR.PATCH bo'lsin"),
  flashMode: z.enum(["dio", "qio", "dout", "qout"]),
  flashFreq: z.enum(["80m", "40m", "26m", "20m"]),
  flashSize: z.enum(["2MB", "4MB", "8MB", "16MB"]),
  files: z
    .array(z.object({ name: fileName, offset: hexOffset }))
    .min(3)
    .max(8)
    .refine((fs) => new Set(fs.map((f) => f.name)).size === fs.length, "fayl nomi takrorlangan")
    .refine((fs) => new Set(fs.map((f) => f.offset)).size === fs.length, "offset takrorlangan"),
});
export type FlashManifest = z.infer<typeof FlashManifest>;

export function parseFlashManifest(data: Uint8Array): FlashManifest {
  try {
    return FlashManifest.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)));
  } catch (e) {
    throw new FirmwareError("BAD_MANIFEST", e instanceof Error ? e.message : "flash.json");
  }
}
