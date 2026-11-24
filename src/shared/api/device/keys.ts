import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { kvGet, kvRemove, kvSet } from "@/shared/lib/kv";
import { generateKeyPair, keyPairFromPrivate, type KeyPair } from "./noise";

// Host maxfiy kaliti chrome.storage.local'da (diskda) turadi — har parol harakati baribir
// qurilma tugmasi bilan tasdiqlanadi. Keyingi qadam: non-extractable WebCrypto kalit.
const KEYS = { hostPriv: "hostPriv", deviceKey: "deviceKey" } as const;
type Key = (typeof KEYS)[keyof typeof KEYS];

async function read(key: Key): Promise<Uint8Array | null> {
  const value = await kvGet(key);
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) return null;
  return hexToBytes(value);
}

export async function getHostKeyPair(): Promise<KeyPair> {
  const priv = await read(KEYS.hostPriv);
  if (priv) return keyPairFromPrivate(priv);
  const pair = generateKeyPair();
  await kvSet(KEYS.hostPriv, bytesToHex(pair.priv));
  return pair;
}

/**
 * Pin qilingan qurilma kaliti. Qiymat bor-u, lekin buzilgan bo'lsa (hex emas / uzunligi noto'g'ri) "pin yo'q"
 * deb QABUL QILINMAYDI: aks holda buzilish jimgina yangi (boshqa) qurilmani pin qilib yuborardi.
 * Bu holda DEVICE_KEY_CHANGED tashlanadi va foydalanuvchi "qurilmani unutish"ni ongli tanlaydi.
 */
export async function getPinnedDeviceKey(): Promise<Uint8Array | null> {
  const stored = await kvGet(KEYS.deviceKey);
  if (stored === undefined || stored === null) return null;
  const key = await read(KEYS.deviceKey);
  if (!key) throw new Error("DEVICE_KEY_CHANGED");
  return key;
}

export async function pinDeviceKey(key: Uint8Array): Promise<void> {
  await kvSet(KEYS.deviceKey, bytesToHex(key));
}

/** Foydalanuvchi "qurilmani unutish" desa — keyingi ulanishda yangi kalit pin qilinadi. */
export async function forgetDevice(): Promise<void> {
  await kvRemove(KEYS.deviceKey);
}
