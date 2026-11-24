/**
 * Noise_XX_25519_ChaChaPoly_SHA256 (https://noiseprotocol.org/noise.html).
 * Faqat XX patterni: -> e | <- e, ee, s, es | -> s, se.
 * Firmware (C++) bilan bir xil rasmiy test vektoriga bog'langan.
 */
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

const PROTOCOL_NAME = "Noise_XX_25519_ChaChaPoly_SHA256";
export const DEFAULT_PROLOGUE = new TextEncoder().encode("kalit/0.2");
const DH_LEN = 32;
const TAG_LEN = 16;
const MAX_NONCE = (1n << 64n) - 1n; // 2^64-1 zahiralangan

export interface KeyPair {
  priv: Uint8Array;
  pub: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  return keyPairFromPrivate(x25519.utils.randomSecretKey());
}

export function keyPairFromPrivate(priv: Uint8Array): KeyPair {
  return { priv, pub: x25519.getPublicKey(priv) };
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const dh = (priv: Uint8Array, pub: Uint8Array) => x25519.getSharedSecret(priv, pub);

function hkdf(ck: Uint8Array, ikm: Uint8Array): [Uint8Array, Uint8Array] {
  const temp = hmac(sha256, ck, ikm);
  const o1 = hmac(sha256, temp, Uint8Array.of(1));
  const o2 = hmac(sha256, temp, concat(o1, Uint8Array.of(2)));
  return [o1, o2];
}

function nonceBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(12); // 4 nol bayt + 8 bayt little-endian
  new DataView(out.buffer).setBigUint64(4, n, true);
  return out;
}

export class CipherState {
  private n = 0n;
  constructor(private readonly k: Uint8Array | null) {}

  get hasKey(): boolean {
    return this.k !== null;
  }

  encrypt(pt: Uint8Array, ad: Uint8Array = new Uint8Array()): Uint8Array {
    if (!this.k) return pt;
    if (this.n >= MAX_NONCE) throw new Error("NONCE_EXHAUSTED");
    const ct = chacha20poly1305(this.k, nonceBytes(this.n), ad).encrypt(pt);
    this.n++;
    return ct;
  }

  decrypt(ct: Uint8Array, ad: Uint8Array = new Uint8Array()): Uint8Array {
    if (!this.k) return ct;
    if (this.n >= MAX_NONCE) throw new Error("NONCE_EXHAUSTED");
    const pt = chacha20poly1305(this.k, nonceBytes(this.n), ad).decrypt(ct); // xatoda throw
    this.n++;
    return pt;
  }
}

type Role = "initiator" | "responder";

export class NoiseSession {
  private ck: Uint8Array;
  private h: Uint8Array;
  private cipher = new CipherState(null);
  private step = 0;
  private re: Uint8Array | null = null;
  private rs: Uint8Array | null = null;

  private constructor(
    private readonly role: Role,
    private readonly s: KeyPair,
    private e: KeyPair | undefined,
    prologue: Uint8Array,
  ) {
    const name = new TextEncoder().encode(PROTOCOL_NAME);
    this.h = name.length <= 32 ? concat(name, new Uint8Array(32 - name.length)) : sha256(name);
    this.ck = this.h;
    this.mixHash(prologue);
  }

  static initiator(s: KeyPair, e?: KeyPair, prologue: Uint8Array = DEFAULT_PROLOGUE): NoiseSession {
    return new NoiseSession("initiator", s, e, prologue);
  }

  static responder(s: KeyPair, e?: KeyPair, prologue: Uint8Array = DEFAULT_PROLOGUE): NoiseSession {
    return new NoiseSession("responder", s, e, prologue);
  }

  get complete(): boolean {
    return this.step === 3;
  }

  get remoteStatic(): Uint8Array | null {
    return this.rs;
  }

  get handshakeHash(): Uint8Array {
    return this.h;
  }

  writeMessage(payload: Uint8Array): Uint8Array {
    this.expect(this.role === "initiator" ? [0, 2] : [1]);
    const out: Uint8Array[] = [];
    if (this.step === 0) {
      this.e ??= generateKeyPair();
      out.push(this.e.pub);
      this.mixHash(this.e.pub);
    } else if (this.step === 1) {
      this.e ??= generateKeyPair();
      out.push(this.e.pub);
      this.mixHash(this.e.pub);
      this.mixKey(dh(this.e.priv, this.re!)); // ee
      out.push(this.encryptAndHash(this.s.pub)); // s
      this.mixKey(dh(this.s.priv, this.re!)); // es (responder)
    } else {
      out.push(this.encryptAndHash(this.s.pub)); // s
      this.mixKey(dh(this.s.priv, this.re!)); // se (initiator)
    }
    out.push(this.encryptAndHash(payload));
    this.step++;
    return concat(...out);
  }

  readMessage(msg: Uint8Array): Uint8Array {
    this.expect(this.role === "initiator" ? [1] : [0, 2]);
    let off = 0;
    const take = (n: number) => {
      if (msg.length - off < n) throw new Error("NOISE_SHORT_MESSAGE");
      const part = msg.subarray(off, off + n);
      off += n;
      return part;
    };
    if (this.step === 0) {
      this.re = take(DH_LEN).slice();
      this.mixHash(this.re);
    } else if (this.step === 1) {
      this.re = take(DH_LEN).slice();
      this.mixHash(this.re);
      this.mixKey(dh(this.e!.priv, this.re)); // ee
      this.rs = this.decryptAndHash(take(DH_LEN + TAG_LEN)).slice(); // s
      this.mixKey(dh(this.e!.priv, this.rs)); // es (initiator)
    } else {
      this.rs = this.decryptAndHash(take(DH_LEN + TAG_LEN)).slice(); // s
      this.mixKey(dh(this.e!.priv, this.rs)); // se (responder)
    }
    const payload = this.decryptAndHash(msg.subarray(off));
    this.step++;
    return payload.slice();
  }

  split(): { send: CipherState; recv: CipherState } {
    if (!this.complete) throw new Error("NOISE_NOT_COMPLETE");
    const [k1, k2] = hkdf(this.ck, new Uint8Array());
    const c1 = new CipherState(k1);
    const c2 = new CipherState(k2);
    return this.role === "initiator" ? { send: c1, recv: c2 } : { send: c2, recv: c1 };
  }

  private expect(steps: number[]) {
    if (!steps.includes(this.step)) throw new Error("NOISE_OUT_OF_ORDER");
  }

  private mixHash(data: Uint8Array) {
    this.h = sha256(concat(this.h, data));
  }

  private mixKey(ikm: Uint8Array) {
    const [ck, k] = hkdf(this.ck, ikm);
    this.ck = ck;
    this.cipher = new CipherState(k);
  }

  private encryptAndHash(pt: Uint8Array): Uint8Array {
    const ct = this.cipher.encrypt(pt, this.h);
    this.mixHash(ct);
    return ct;
  }

  private decryptAndHash(ct: Uint8Array): Uint8Array {
    const pt = this.cipher.decrypt(ct, this.h);
    this.mixHash(ct);
    return pt;
  }
}

/** Short Authentication String (v0.11): 2 xonali kod — BE uint32(SHA-256(h || "kalit/pair")[0..3]) % 100. */
export function pairingCode(h: Uint8Array): string {
  const d = sha256(concat(h, new TextEncoder().encode("kalit/pair")));
  const n = new DataView(d.buffer, d.byteOffset, 4).getUint32(0, false) % 100;
  return n.toString().padStart(2, "0");
}
