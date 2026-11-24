import { describe, expect, it } from "vitest";
import { DeviceClient, DeviceError } from "./client";
import { genValid, generate } from "./device-generator";
import { isWeakPassword, passwordEntropyBits } from "./device-strength";
import { MockTransport } from "./mock-transport";
import { generateKeyPair } from "./noise";
import { AddEntryParams, CHARSET } from "./protocol";
import { SecureTransport } from "./secure-transport";
import { WORDLIST } from "./wordlist";

async function ready() {
  const mock = new MockTransport({ fast: true });
  const pinned: { key: Uint8Array | null } = { key: null };
  const transport = new SecureTransport(mock, generateKeyPair(), {
    pinnedDeviceKey: async () => pinned.key,
    pinDeviceKey: async (k) => void (pinned.key = k),
    hostName: "Test Host",
    handshakeTimeoutMs: 500,
  });
  const client = new DeviceClient(transport);
  client.onEvent((e) => {
    if (e.event === "CONFIRM_PENDING") queueMicrotask(() => mock.press("short"));
  });
  await transport.open();
  await client.call("PAIR_HOST", {});
  await client.call("ONBOARD", { masterPassword: "correct horse battery" });
  return { mock, client, transport };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof DeviceError ? e.code : String(e);
  }
};

const secret = (client: DeviceClient, title: string, password: string) =>
  client.call("ADD_ENTRY", { kind: "secret", title, password }).then((r) => r.entry.id);

describe("generator rules (protocol schema)", () => {
  const web = { origin: "https://example.com", site: "example.com", username: "ali" };
  const ok = (p: object) => AddEntryParams.safeParse(p).success;

  it("keeps the legacy rules: default charset needs length 12..64", () => {
    expect(ok({ ...web, generateLength: 12 })).toBe(true);
    expect(ok({ ...web, generateLength: 11 })).toBe(false);
    expect(ok({ ...web, generateLength: 65 })).toBe(false);
    expect(ok({ ...web, charset: CHARSET.all, generateLength: 8 })).toBe(false);
  });

  it("allows short lengths only with a reduced charset (PIN)", () => {
    expect(ok({ ...web, charset: CHARSET.digit, generateLength: 4 })).toBe(true);
    expect(ok({ ...web, charset: CHARSET.digit, generateLength: 3 })).toBe(false);
    expect(ok({ kind: "secret", title: "PIN", charset: CHARSET.digit, generateLength: 6 })).toBe(true);
  });

  it("validates charset bits and word counts; words excludes charset/generateLength", () => {
    expect(ok({ ...web, charset: 0 })).toBe(false);
    expect(ok({ ...web, charset: 16 })).toBe(false);
    expect(ok({ ...web, words: 3 })).toBe(false);
    expect(ok({ ...web, words: 11 })).toBe(false);
    expect(ok({ ...web, words: 6 })).toBe(true);
    expect(ok({ ...web, words: 6, charset: CHARSET.digit })).toBe(false);
    expect(ok({ ...web, words: 6, generateLength: 20 })).toBe(false);
  });

  it("a secret needs a password or any generator option", () => {
    expect(ok({ kind: "secret", title: "x" })).toBe(false);
    expect(ok({ kind: "secret", title: "x", words: 5 })).toBe(true);
    expect(ok({ kind: "secret", title: "x", charset: CHARSET.lower | CHARSET.digit })).toBe(true);
  });
});

describe("mock generator", () => {
  it("PIN: digits only, exact length, every digit reachable", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const pin = generate({ charset: CHARSET.digit, length: 6 });
      expect(pin).toMatch(/^\d{6}$/);
      for (const c of pin) seen.add(c);
    }
    expect(seen.size).toBe(10);
  });

  it("no-symbol charset has no symbols and keeps every selected class", () => {
    for (let i = 0; i < 200; i++) {
      const p = generate({ charset: CHARSET.lower | CHARSET.upper | CHARSET.digit, length: 12 });
      expect(p).toMatch(/^[A-Za-z2-9]{12}$/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
    }
  });

  it("default charset guarantees all four classes", () => {
    for (let i = 0; i < 200; i++) {
      const p = generate({ length: 12 });
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[!@#$%^&*\-_=+]/);
    }
  });

  it("passphrase: N dash-joined words from the EFF list", () => {
    expect(WORDLIST).toHaveLength(7776);
    expect(new Set(WORDLIST).size).toBe(7776);
    const words = new Set(WORDLIST);
    for (const n of [4, 6, 10]) {
      const parts = generate({ words: n }).split("-");
      expect(parts).toHaveLength(n);
      for (const w of parts) expect(words.has(w)).toBe(true);
    }
  });

  it("genValid mirrors the firmware rules", () => {
    expect(genValid({})).toBe(true);
    expect(genValid({ length: 11 })).toBe(false);
    expect(genValid({ charset: CHARSET.digit, length: 4 })).toBe(true);
    expect(genValid({ charset: CHARSET.digit, length: 3 })).toBe(false);
    expect(genValid({ charset: 0, length: 10 })).toBe(false);
    expect(genValid({ words: 3 })).toBe(false);
    expect(genValid({ words: 5, length: 20 })).toBe(false);
  });

  it("device-side generation works over the wire for web and secret entries", async () => {
    const { client } = await ready();
    const pin = await client.call("ADD_ENTRY", { kind: "secret", title: "PIN", charset: CHARSET.digit, generateLength: 6 });
    expect((await client.call("REVEAL_SECRET", { id: pin.entry.id })).password).toMatch(/^\d{6}$/);
    const phrase = await client.call("ADD_ENTRY", { kind: "secret", title: "Phrase", words: 5 });
    expect((await client.call("REVEAL_SECRET", { id: phrase.entry.id })).password.split("-")).toHaveLength(5);
    const web = await client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", words: 4 });
    expect(web.entry.site).toBe("example.com");
  });
});

describe("mock strength (parity with firmware strength.cpp)", () => {
  it("flags typical weak passwords", () => {
    for (const pw of ["12345678", "aaaaaaaaaaaa", "abcdefgh", "password123", "Qwerty!2024", "abababababab", "Parol123", "kalit", "x", "7391"]) {
      expect(isWeakPassword(pw), pw).toBe(true);
    }
  });
  it("accepts strong ones, and generated passwords are never weak", () => {
    for (const pw of ["k8#Vq2!mZp9@Lx4w", "mXq7TzB2rW9nYc4H", "correct-horse-battery-staple-x"]) expect(isWeakPassword(pw), pw).toBe(false);
    for (let i = 0; i < 100; i++) expect(isWeakPassword(generate({ length: 16 }))).toBe(false);
    for (let i = 0; i < 100; i++) expect(isWeakPassword(generate({ words: 5 }))).toBe(false);
  });
  it("a generated PIN is weak by design; empty = 0 bits", () => {
    expect(isWeakPassword(generate({ charset: CHARSET.digit, length: 6 }))).toBe(true);
    expect(passwordEntropyBits("")).toBe(0);
  });
});

describe("AUDIT_PASSWORDS", () => {
  it("returns counts and ids of flagged entries only — never passwords", async () => {
    const { client } = await ready();
    const a = await secret(client, "A", "k8#Vq2!mZp9@Lx4w");
    const b = await secret(client, "B", "k8#Vq2!mZp9@Lx4w");
    const c = await secret(client, "C", "12345678");
    const d = await secret(client, "D", "mXq7TzB2rW9nYc4H");
    const res = await client.call("AUDIT_PASSWORDS", {});
    expect(res).toMatchObject({ total: 4, duplicates: 2, weak: 1 });
    expect(res.next).toBeUndefined();
    const by = Object.fromEntries(res.items.map((i) => [i.id, i]));
    expect(by[a]).toEqual({ id: a, duplicate: true, weak: false });
    expect(by[b]).toEqual({ id: b, duplicate: true, weak: false });
    expect(by[c]).toEqual({ id: c, duplicate: false, weak: true });
    expect(by[d]).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain("k8#Vq2");
    expect(JSON.stringify(res)).not.toContain("12345678");
  });

  it("needs no confirmation and requires an unlocked vault", async () => {
    const { client, mock } = await ready();
    await secret(client, "A", "12345678");
    const pending: unknown[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && pending.push(e));
    await client.call("AUDIT_PASSWORDS", {});
    expect(pending).toHaveLength(0);
    await client.call("LOCK", {});
    expect(await code(client.call("AUDIT_PASSWORDS", {}))).toBe("LOCKED");
    void mock;
  });

  it("auditAll follows pages (70 flagged entries > one page of 64)", async () => {
    const { client } = await ready();
    await client.call("IMPORT_BEGIN", { count: 70 });
    for (let i = 0; i < 70; i++) await client.call("ADD_ENTRY", { kind: "secret", title: `T${i}`, password: "12345678" });
    const first = await client.call("AUDIT_PASSWORDS", {});
    expect(first.items).toHaveLength(64);
    expect(first.next).toBeDefined();
    const all = await client.auditAll();
    expect(all).toMatchObject({ total: 70, duplicates: 70, weak: 70 });
    expect(all.items).toHaveLength(70);
    expect(new Set(all.items.map((i) => i.id)).size).toBe(70);
  });

  it("an empty vault audits clean", async () => {
    const { client } = await ready();
    expect(await client.auditAll()).toEqual({ total: 0, duplicates: 0, weak: 0, items: [] });
  });
});
