import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { kvGet, kvRemove, kvSet } from "@/lib/kv";
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

export const getPinnedDeviceKey = () => read(KEYS.deviceKey);

export async function pinDeviceKey(key: Uint8Array): Promise<void> {
  await kvSet(KEYS.deviceKey, bytesToHex(key));
}

/** Foydalanuvchi "qurilmani unutish" desa — keyingi ulanishda yangi kalit pin qilinadi. */
export async function forgetDevice(): Promise<void> {
  await kvRemove(KEYS.deviceKey);
}
