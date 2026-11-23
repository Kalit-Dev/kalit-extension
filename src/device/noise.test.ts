import { describe, expect, it } from "vitest";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import vector from "./__vectors__/noise-xx.json";
import { CipherState, generateKeyPair, keyPairFromPrivate, NoiseSession, pairingCode } from "./noise";

const hex = (s: string) => hexToBytes(s);
const prologue = hex(vector.init_prologue);

function drive(i: NoiseSession, r: NoiseSession, p1 = new Uint8Array(), p2 = new Uint8Array(), p3 = new Uint8Array()) {
  const m1 = i.writeMessage(p1);
  r.readMessage(m1);
  const m2 = r.writeMessage(p2);
  i.readMessage(m2);
  const m3 = i.writeMessage(p3);
  r.readMessage(m3);
  return { m1, m2, m3 };
}

describe("Noise_XX_25519_ChaChaPoly_SHA256 official vector", () => {
  const init = NoiseSession.initiator(
    keyPairFromPrivate(hex(vector.init_static)),
    keyPairFromPrivate(hex(vector.init_ephemeral)),
    prologue,
  );
  const resp = NoiseSession.responder(
    keyPairFromPrivate(hex(vector.resp_static)),
    keyPairFromPrivate(hex(vector.resp_ephemeral)),
    prologue,
  );
  const [m0, m1, m2, m3, m4, m5] = vector.messages.map((m) => ({ payload: hex(m.payload), ct: hex(m.ciphertext) }));

  it("produces the exact handshake messages and reaches the same hash", () => {
    expect(bytesToHex(init.writeMessage(m0!.payload))).toBe(bytesToHex(m0!.ct));
    expect(resp.readMessage(m0!.ct)).toEqual(m0!.payload);
    expect(bytesToHex(resp.writeMessage(m1!.payload))).toBe(bytesToHex(m1!.ct));
    expect(init.readMessage(m1!.ct)).toEqual(m1!.payload);
    expect(bytesToHex(init.writeMessage(m2!.payload))).toBe(bytesToHex(m2!.ct));
    expect(resp.readMessage(m2!.ct)).toEqual(m2!.payload);
    expect(init.complete && resp.complete).toBe(true);
    expect(bytesToHex(init.handshakeHash)).toBe(vector.handshake_hash);
    expect(bytesToHex(resp.handshakeHash)).toBe(vector.handshake_hash);
  });

  it("produces the exact transport ciphertexts after split", () => {
    const i = init.split();
    const r = resp.split();
    expect(bytesToHex(r.send.encrypt(m3!.payload))).toBe(bytesToHex(m3!.ct)); // responder -> initiator
    expect(i.recv.decrypt(m3!.ct)).toEqual(m3!.payload);
    expect(bytesToHex(i.send.encrypt(m4!.payload))).toBe(bytesToHex(m4!.ct)); // initiator -> responder
    expect(r.recv.decrypt(m4!.ct)).toEqual(m4!.payload);
    expect(bytesToHex(r.send.encrypt(m5!.payload))).toBe(bytesToHex(m5!.ct));
  });

  it("pairingCode of the vector hash is 3262", () => {
    expect(pairingCode(hex(vector.handshake_hash))).toBe("3262");
  });
});

describe("NoiseSession round trip", () => {
  it("both sides agree on keys, payloads and handshake hash", () => {
    const si = generateKeyPair();
    const sr = generateKeyPair();
    const i = NoiseSession.initiator(si);
    const r = NoiseSession.responder(sr);
    const payload = new TextEncoder().encode("hello");
    drive(i, r, new Uint8Array(), payload, payload);
    expect(i.remoteStatic).toEqual(sr.pub);
    expect(r.remoteStatic).toEqual(si.pub);
    expect(i.handshakeHash).toEqual(r.handshakeHash);
    expect(pairingCode(i.handshakeHash)).toBe(pairingCode(r.handshakeHash));
    expect(pairingCode(i.handshakeHash)).toMatch(/^\d{4}$/);
  });

  it("different prologues cannot complete a handshake", () => {
    const i = NoiseSession.initiator(generateKeyPair(), undefined, new Uint8Array([1]));
    const r = NoiseSession.responder(generateKeyPair(), undefined, new Uint8Array([2]));
    r.readMessage(i.writeMessage(new Uint8Array()));
    const m2 = r.writeMessage(new Uint8Array());
    expect(() => i.readMessage(m2)).toThrow();
  });

  it("rejects a handshake message with one flipped byte", () => {
    const i = NoiseSession.initiator(generateKeyPair());
    const r = NoiseSession.responder(generateKeyPair());
    r.readMessage(i.writeMessage(new Uint8Array()));
    const m2 = r.writeMessage(new Uint8Array([1, 2, 3]));
    m2[m2.length - 1]! ^= 1;
    expect(() => i.readMessage(m2)).toThrow();
  });

  it("rejects out-of-order handshake calls", () => {
    const r = NoiseSession.responder(generateKeyPair());
    expect(() => r.writeMessage(new Uint8Array())).toThrow();
  });
});

describe("CipherState", () => {
  function pair(): { a: CipherState; b: CipherState } {
    const i = NoiseSession.initiator(generateKeyPair());
    const r = NoiseSession.responder(generateKeyPair());
    drive(i, r);
    return { a: i.split().send, b: r.split().recv };
  }

  it("round-trips and advances the nonce", () => {
    const { a, b } = pair();
    const c1 = a.encrypt(new Uint8Array([1]));
    const c2 = a.encrypt(new Uint8Array([1]));
    expect(c1).not.toEqual(c2);
    expect(b.decrypt(c1)).toEqual(new Uint8Array([1]));
    expect(b.decrypt(c2)).toEqual(new Uint8Array([1]));
  });

  it("throws on a flipped ciphertext byte", () => {
    const { a, b } = pair();
    const c = a.encrypt(new Uint8Array([5, 6, 7]));
    c[0]! ^= 1;
    expect(() => b.decrypt(c)).toThrow();
  });

  it("throws when a frame is replayed", () => {
    const { a, b } = pair();
    const c = a.encrypt(new Uint8Array([9]));
    b.decrypt(c);
    expect(() => b.decrypt(c)).toThrow();
  });
});
