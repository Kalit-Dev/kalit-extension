import { RELEASE_PUBLIC_KEY_HEX, isSigningKeyConfigured } from "./signing-key";
import { parseFlashManifest, type FlashManifest } from "./manifest";
import { FirmwareError, parseSums, verifyFile, verifySignature } from "./verify";
import { compareVersions } from "./version";

/** Versiyasiz fayl nomlari: GitHub `latest` release'ning assetlari (kalit-firmware/docs/RELEASE-SIGNING.md). */
export const RELEASE_BASE_URL = "https://github.com/Kalit-Dev/kalit-firmware/releases/latest/download/";

const MAX_ASSET_BYTES = 2 * 1024 * 1024; // firmware 4 MB flash'dagi 1.25 MB app bo'limiga sig'adi; shu yerda ehtiyot chegarasi

export interface ReleaseBoard {
  manifest: FlashManifest;
  /** Offset bo'yicha tartiblangan, hammasi SHA256SUMS bilan tasdiqlangan. */
  images: { name: string; address: number; data: Uint8Array }[];
}

/** Imzosi va hash'lari tekshirilgan release. Ichidagi hamma narsaga ishonish mumkin. */
export interface VerifiedRelease {
  version: string;
  boards: ReleaseBoard[];
}

export interface LoadOptions {
  baseUrl?: string;
  publicKeyHex?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function download(name: string, o: Required<Pick<LoadOptions, "baseUrl" | "fetchImpl">> & { signal?: AbortSignal }) {
  let res: Response;
  try {
    res = await o.fetchImpl(o.baseUrl + name, { cache: "no-store", credentials: "omit", signal: o.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new FirmwareError("NETWORK", name);
  }
  if (!res.ok) throw new FirmwareError("NETWORK", `${name}: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_ASSET_BYTES) throw new FirmwareError("BAD_MANIFEST", `${name}: juda katta`);
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.length > MAX_ASSET_BYTES) throw new FirmwareError("BAD_MANIFEST", `${name}: juda katta`);
  return data;
}

/**
 * Oxirgi release'ni yuklaydi va **qurilmaga tegishdan oldin** to'liq tekshiradi:
 * SHA256SUMS imzosi -> flash.json hash'i -> har bir .bin hash'i. Birortasi xato bo'lsa, istisno.
 */
export async function loadVerifiedRelease(opts: LoadOptions = {}): Promise<VerifiedRelease> {
  const publicKeyHex = opts.publicKeyHex ?? RELEASE_PUBLIC_KEY_HEX;
  if (!isSigningKeyConfigured(publicKeyHex)) throw new FirmwareError("KEY_NOT_CONFIGURED");
  const o = { baseUrl: opts.baseUrl ?? RELEASE_BASE_URL, fetchImpl: opts.fetchImpl ?? fetch.bind(globalThis), signal: opts.signal };

  const [sumsBytes, sig] = await Promise.all([download("SHA256SUMS", o), download("SHA256SUMS.sig", o)]);
  verifySignature(sumsBytes, sig, publicKeyHex);
  const sums = parseSums(new TextDecoder().decode(sumsBytes));

  const manifestNames = [...sums.keys()].filter((n) => n.endsWith("-flash.json"));
  if (manifestNames.length === 0) throw new FirmwareError("BAD_MANIFEST", "flash.json yo'q");

  const boards: ReleaseBoard[] = [];
  for (const mName of manifestNames) {
    const raw = await download(mName, o);
    verifyFile(mName, raw, sums);
    const manifest = parseFlashManifest(raw);
    if (`${manifest.board}-flash.json` !== mName) throw new FirmwareError("BAD_MANIFEST", `${mName}: board mos emas`);
    const images = [];
    for (const f of manifest.files) {
      const data = await download(f.name, o);
      verifyFile(f.name, data, sums);
      images.push({ name: f.name, address: f.offset, data });
    }
    boards.push({ manifest, images: images.sort((a, b) => a.address - b.address) });
  }

  const version = boards[0]!.manifest.version;
  if (boards.some((b) => b.manifest.version !== version)) throw new FirmwareError("BAD_MANIFEST", "versiyalar mos emas");
  return { version, boards };
}

/** Chip nomi (esptool-js `CHIP_NAME`) bo'yicha board; topilmasa NO_BOARD. */
export function boardForChip(release: VerifiedRelease, chip: string): ReleaseBoard {
  const board = release.boards.find((b) => b.manifest.chip === chip);
  if (!board) throw new FirmwareError("NO_BOARD", chip);
  return board;
}

export type UpdateDecision =
  /** Ulangan qurilmaning versiyasi noma'lum yoki eskiroq: yangilash mumkin. */
  | { kind: "update" }
  | { kind: "same" }
  /** Release qurilmadagidan eski: rad etiladi (rollback hujumidan himoya). */
  | { kind: "older" };

export function decideUpdate(current: string | null | undefined, release: string): UpdateDecision {
  if (!current) return { kind: "update" };
  const c = compareVersions(release, current);
  if (c === null || c > 0) return { kind: "update" };
  return { kind: c === 0 ? "same" : "older" };
}
