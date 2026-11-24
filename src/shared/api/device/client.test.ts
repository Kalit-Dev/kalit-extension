import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceClient, DeviceError } from "./client";
import type { Transport } from "./transport";

function fakeTransport() {
  let onFrame: (f: unknown) => void = () => undefined;
  const t: Transport & { reply(f: unknown): void } = {
    kind: "mock",
    open: async () => undefined,
    close: async () => undefined,
    send: async () => undefined,
    onFrame: (l) => (onFrame = l),
    onClose: () => undefined,
    reply: (f) => onFrame(f),
  };
  return t;
}

describe("DeviceClient timeouts", () => {
  afterEach(() => vi.useRealTimers());

  it("gives UNLOCK more than 8 s: PBKDF2 on the device is slow", async () => {
    vi.useFakeTimers();
    const t = fakeTransport();
    const client = new DeviceClient(t);
    const p = client.call("UNLOCK", { masterPassword: "correct horse battery" });
    await vi.advanceTimersByTimeAsync(9_000);
    t.reply({ id: 1, ok: true, result: {} });
    await expect(p).resolves.toEqual({});
  });

  it("gives CHANGE_MASTER the confirm window plus KDF time", async () => {
    vi.useFakeTimers();
    const t = fakeTransport();
    const client = new DeviceClient(t);
    const p = client.call("CHANGE_MASTER", { oldPassword: "old", newPassword: "a long new passphrase" });
    await vi.advanceTimersByTimeAsync(40_000);
    t.reply({ id: 1, ok: true, result: {} });
    await expect(p).resolves.toEqual({});
  });

  it("gives IMPORT_BEGIN the confirm window; IMPORT_END the plain one", async () => {
    vi.useFakeTimers();
    const t = fakeTransport();
    const client = new DeviceClient(t);
    const begin = client.call("IMPORT_BEGIN", { count: 3 });
    await vi.advanceTimersByTimeAsync(11_000);
    t.reply({ id: 1, ok: true, result: {} });
    await expect(begin).resolves.toEqual({});
    const end = client.call("IMPORT_END", {});
    const assertion = expect(end).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
  });

  it("validates IMPORT_BEGIN count and IMPORT_END result", async () => {
    const t = fakeTransport();
    const client = new DeviceClient(t);
    await expect(client.call("IMPORT_BEGIN", { count: 0 })).rejects.toThrow();
    await expect(client.call("IMPORT_BEGIN", { count: 257 })).rejects.toThrow();
    const end = client.call("IMPORT_END", {});
    t.reply({ id: 3, ok: true, result: { added: 2 } }); // 1-2: client-side rad etilgan chaqiruvlar ham id sarflaydi
    await expect(end).resolves.toEqual({ added: 2 });
  });

  it("validates LIST_HOSTS results", async () => {
    const t = fakeTransport();
    const client = new DeviceClient(t);
    const bad = client.call("LIST_HOSTS", {});
    t.reply({ id: 1, ok: true, result: { hosts: [{ slot: 9, fp: "zz", current: true }] } });
    await expect(bad).rejects.toMatchObject({ code: "PROTOCOL" });
    const good = client.call("LIST_HOSTS", {});
    t.reply({ id: 2, ok: true, result: { hosts: [{ slot: 1, fp: "0123456789abcdef", current: false }] } });
    await expect(good).resolves.toEqual({ hosts: [{ slot: 1, fp: "0123456789abcdef", current: false }] });
  });

  it("still times out ordinary commands after 8 s", async () => {
    vi.useFakeTimers();
    const client = new DeviceClient(fakeTransport());
    const p = client.call("LOCK", {});
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
  });
});

describe("protocol v0.4 parsing", () => {
  it("EntryMeta defaults kind to web for older firmware and keeps secret", async () => {
    const { EntryMeta } = await import("./protocol");
    expect(EntryMeta.parse({ id: "a", site: "x.com", username: "u", updatedAt: 1 }).kind).toBe("web");
    expect(EntryMeta.parse({ id: "a", kind: "secret", site: "", username: "", title: "t", updatedAt: 1 }).kind).toBe("secret");
  });

  it("sends secret ADD_ENTRY and REVEAL_SECRET params and parses the reply", async () => {
    const sent: unknown[] = [];
    const t = fakeTransport();
    t.send = async (m) => void sent.push(m);
    const client = new DeviceClient(t);
    const p = client.call("REVEAL_SECRET", { id: "e1" });
    t.reply({ id: 1, ok: true, result: { username: "u", password: "p" } });
    await expect(p).resolves.toEqual({ username: "u", password: "p" });
    const q = client.call("ADD_ENTRY", { kind: "secret", title: "T", generateLength: 20 });
    t.reply({ id: 2, ok: true, result: { entry: { id: "x", kind: "secret", site: "", username: "", title: "T", updatedAt: 1 } } });
    expect((await q).entry.kind).toBe("secret");
    expect(sent).toEqual([
      { id: 1, cmd: "REVEAL_SECRET", params: { id: "e1" } },
      { id: 2, cmd: "ADD_ENTRY", params: { kind: "secret", title: "T", generateLength: 20, now: expect.any(Number) } },
    ]);
  });
});

describe("protocol v0.6 backup commands", () => {
  afterEach(() => vi.useRealTimers());
  const salt = new Uint8Array(16);

  it("gives EXPORT_BEGIN / RESTORE_BEGIN the confirm window plus PBKDF2 time; EXPORT_GET the plain one", async () => {
    vi.useFakeTimers();
    const t = fakeTransport();
    const client = new DeviceClient(t);
    const a = client.call("EXPORT_BEGIN", { passphrase: "backup passphrase" });
    await vi.advanceTimersByTimeAsync(38_000);
    t.reply({ id: 1, ok: true, result: { count: 1, salt, iter: 200_000 } });
    await expect(a).resolves.toMatchObject({ count: 1, iter: 200_000 });
    const b = client.call("RESTORE_BEGIN", { passphrase: "backup passphrase", salt, iter: 200_000, count: 1 });
    await vi.advanceTimersByTimeAsync(38_000);
    t.reply({ id: 2, ok: true, result: {} });
    await expect(b).resolves.toEqual({});
    const get = client.call("EXPORT_GET", { index: 0 });
    const assertion = expect(get).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
  });

  it("rejects bad params before sending and validates results", async () => {
    const sent: unknown[] = [];
    const t = fakeTransport();
    t.send = async (m) => void sent.push(m);
    const client = new DeviceClient(t);
    await expect(client.call("EXPORT_BEGIN", { passphrase: "short" })).rejects.toThrow();
    await expect(client.call("EXPORT_BEGIN", { passphrase: "é".repeat(65) })).rejects.toThrow(); // 130 bytes
    await expect(client.call("RESTORE_BEGIN", { passphrase: "backup passphrase", salt: new Uint8Array(15), iter: 200_000, count: 1 })).rejects.toThrow();
    await expect(client.call("RESTORE_BEGIN", { passphrase: "backup passphrase", salt, iter: 99_999, count: 1 })).rejects.toThrow();
    await expect(client.call("RESTORE_BEGIN", { passphrase: "backup passphrase", salt, iter: 200_000, count: 257 })).rejects.toThrow();
    expect(sent).toEqual([]);

    // the 5 rejected calls above consumed ids 1-5
    // 10 UTF-8 bytes in 5 characters is accepted
    const ok = client.call("EXPORT_BEGIN", { passphrase: "ééééé" });
    t.reply({ id: 6, ok: true, result: { count: 2, salt: new Uint8Array(15), iter: 200_000 } });
    await expect(ok).rejects.toMatchObject({ code: "PROTOCOL" }); // salt must be 16 bytes
    const entry = client.call("RESTORE_ENTRY", { index: 0, blob: new Uint8Array(30) });
    t.reply({ id: 7, ok: true, result: { result: "maybe" } });
    await expect(entry).rejects.toMatchObject({ code: "PROTOCOL" });
    const end = client.call("RESTORE_END", {});
    t.reply({ id: 8, ok: true, result: { added: 1, skipped: 2 } });
    await expect(end).resolves.toEqual({ added: 1, skipped: 2 });
  });
});

describe("protocol v0.7 client layer", () => {
  const meta = (n: number) => ({ id: `e${n}`, site: "x.com", username: "u", updatedAt: 1 });

  /** Transport that answers LIST with the given pages (by cursor) and records every sent frame. */
  function listTransport(pages: Record<number, { entries: ReturnType<typeof meta>[]; next?: number }>) {
    const t = fakeTransport();
    const sent: { id: number; cmd: string; params: { cursor?: number; now?: number } }[] = [];
    t.send = async (m) => {
      const req = m as (typeof sent)[number];
      sent.push(req);
      queueMicrotask(() => t.reply({ id: req.id, ok: true, result: pages[req.params.cursor ?? 0] }));
    };
    return { t, sent };
  }

  it("listAll follows `next` and omits cursor on the first page", async () => {
    const { t, sent } = listTransport({
      0: { entries: [meta(1), meta(2)], next: 2 },
      2: { entries: [meta(3)], next: 5 },
      5: { entries: [meta(4)] },
    });
    const all = await new DeviceClient(t).listAll();
    expect(all.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(sent.map((s) => s.params)).toEqual([{}, { cursor: 2 }, { cursor: 5 }]);
  });

  it("listAll throws PROTOCOL when next does not advance", async () => {
    const { t } = listTransport({ 0: { entries: [meta(1)], next: 3 }, 3: { entries: [meta(2)], next: 3 } });
    await expect(new DeviceClient(t).listAll()).rejects.toMatchObject({ code: "PROTOCOL" });
    const { t: t0 } = listTransport({ 0: { entries: [meta(1)], next: 0 } });
    await expect(new DeviceClient(t0).listAll()).rejects.toMatchObject({ code: "PROTOCOL" });
  });

  it("listAll gives up after 64 pages", async () => {
    const pages: Record<number, { entries: ReturnType<typeof meta>[]; next?: number }> = {};
    for (let i = 0; i < 200; i++) pages[i === 0 ? 0 : i] = { entries: [meta(i)], next: i + 1 };
    const { t, sent } = listTransport(pages);
    await expect(new DeviceClient(t).listAll()).rejects.toMatchObject({ code: "PROTOCOL" });
    expect(sent).toHaveLength(64);
  });

  it("adds `now` (integer unix seconds) to ADD_ENTRY, UPDATE_ENTRY and RESTORE_ENTRY only", async () => {
    const sent: { cmd: string; params: { now?: number } }[] = [];
    const t = fakeTransport();
    t.send = async (m) => void sent.push(m as (typeof sent)[number]);
    const client = new DeviceClient(t);
    void client.call("ADD_ENTRY", { origin: "https://a.com", site: "a.com", username: "u", password: "p" }).catch(() => undefined);
    void client.call("ADD_ENTRY", { kind: "secret", title: "T", password: "p" }).catch(() => undefined);
    void client.call("UPDATE_ENTRY", { id: "x", password: "p" }).catch(() => undefined);
    void client.call("RESTORE_ENTRY", { index: 0, blob: new Uint8Array(30) }).catch(() => undefined);
    void client.call("DELETE_ENTRY", { id: "x" }).catch(() => undefined);
    void client.call("LIST", {}).catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    const now = Math.floor(Date.now() / 1000);
    const [a, b, u, r, d, l] = sent;
    for (const m of [a, b, u, r]) {
      expect(Number.isInteger(m!.params.now)).toBe(true);
      expect(Math.abs(m!.params.now! - now)).toBeLessThanOrEqual(2);
    }
    expect(d!.params).toEqual({ id: "x" });
    expect(l!.params).toEqual({});
  });
});

describe("DeviceClient v0.9 TOTP", () => {
  it("getTotp auto-fills integer `now`; origin is passed only when given", async () => {
    const sent: { cmd: string; params: { id?: string; origin?: string; now?: number } }[] = [];
    const t = fakeTransport();
    t.send = async (m) => void sent.push(m as (typeof sent)[number]);
    const client = new DeviceClient(t);
    void client.getTotp("e1").catch(() => undefined);
    void client.getTotp("e2", "https://example.com").catch(() => undefined);
    void client.call("GET_TOTP", { id: "e3" }).catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    const now = Math.floor(Date.now() / 1000);
    expect(sent.map((m) => m.cmd)).toEqual(["GET_TOTP", "GET_TOTP", "GET_TOTP"]);
    for (const m of sent) {
      expect(Number.isInteger(m.params.now)).toBe(true);
      expect(Math.abs(m.params.now! - now)).toBeLessThanOrEqual(2);
    }
    expect(sent[0]!.params).toEqual({ id: "e1", now: expect.any(Number) });
    expect(sent[1]!.params).toEqual({ id: "e2", origin: "https://example.com", now: expect.any(Number) });
  });
});

describe("pair() (v0.11 PAIR_VERIFY)", () => {
  afterEach(() => vi.useRealTimers());

  function recording() {
    const t = fakeTransport();
    const sent: { id: number; cmd: string; params: unknown }[] = [];
    t.send = async (f) => void sent.push(f as (typeof sent)[number]);
    return { t, sent };
  }
  const verifyEvent = (d: Record<string, unknown>) => ({ event: "CONFIRM_PENDING", data: { action: "pair", timeoutMs: 30_000, ...d } });

  it("gives PAIR_HOST the verify window plus a margin, but no button window", async () => {
    vi.useFakeTimers();
    const { t } = recording();
    const client = new DeviceClient(t);
    const p = client.pair(() => true);
    t.reply(verifyEvent({ code: "12", phase: "verify" }));
    await vi.advanceTimersByTimeAsync(31_000);
    t.reply({ id: 2, ok: true, result: {} });
    t.reply({ id: 1, ok: true, result: {} });
    await expect(p).resolves.toBeUndefined();
  });

  it("PAIR_HOST times out after the verify window + 2 s (no press phase to wait for)", async () => {
    vi.useFakeTimers();
    const { t } = recording();
    const client = new DeviceClient(t);
    const p = client.call("PAIR_HOST", {});
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(32_001);
    await assertion;
  });

  it("PAIR_VERIFY uses the standard request timeout (the device answers at once)", async () => {
    vi.useFakeTimers();
    const { t } = recording();
    const client = new DeviceClient(t);
    const p = client.call("PAIR_VERIFY", { match: true });
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
  });

  it("no-press wire order: CONFIRM_DONE, PAIR_VERIFY {}, PAIR_HOST {} -> resolves", async () => {
    const { t, sent } = recording();
    const client = new DeviceClient(t);
    const p = client.pair((info) => info.code === "07");
    t.reply(verifyEvent({ code: "07", phase: "verify" }));
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ cmd: "PAIR_VERIFY", params: { match: true } });
    t.reply({ event: "CONFIRM_DONE" });
    t.reply({ id: 2, ok: true, result: {} });
    t.reply({ id: 1, ok: true, result: {} });
    await expect(p).resolves.toBeUndefined();
    expect(sent).toHaveLength(2); // boshqa so'rov yo'q
  });

  it("sends PAIR_VERIFY with the choice, then reports the PAIR_HOST outcome", async () => {
    const { t, sent } = recording();
    const client = new DeviceClient(t);
    const p = client.pair((info) => info.code === "12");
    t.reply(verifyEvent({ code: "12", phase: "verify" }));
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ id: 2, cmd: "PAIR_VERIFY", params: { match: true } });
    t.reply({ id: 2, ok: true, result: {} });
    t.reply({ id: 1, ok: false, error: "USER_REJECTED" });
    await expect(p).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("fails closed with PROTOCOL when PAIR_HOST succeeds without a verify phase (downgrade)", async () => {
    const { t, sent } = recording();
    const choose = vi.fn(() => true);
    const client = new DeviceClient(t);
    const p = client.pair(choose);
    t.reply(verifyEvent({ code: "12" })); // eski firmware tugma hodisasi (phase yo'q) — verify emas
    t.reply({ id: 1, ok: true, result: {} });
    await expect(p).rejects.toMatchObject({ code: "PROTOCOL" });
    expect(choose).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it("mismatch: sends PAIR_VERIFY {match:false} and rejects USER_REJECTED at once, without waiting for PAIR_HOST", async () => {
    const { t, sent } = recording();
    const client = new DeviceClient(t);
    const p = client.pair(() => false);
    t.reply(verifyEvent({ code: "12", phase: "verify" }));
    await expect(p).rejects.toMatchObject({ code: "USER_REJECTED" }); // PAIR_HOST hali javob bermagan
    expect(sent[1]).toMatchObject({ cmd: "PAIR_VERIFY", params: { match: false } });
    // keyingi PAIR_HOST natijasi (hatto {}) yutiladi: unhandled rejection yo'q, kech o'zgarish yo'q
    t.reply({ id: 2, ok: true, result: {} });
    t.reply({ id: 1, ok: true, result: {} });
    await new Promise((r) => setTimeout(r, 5));
  });

  it("mismatch: a later PAIR_HOST error is swallowed and the listener is removed", async () => {
    const { t, sent } = recording();
    const choose = vi.fn(() => false);
    const client = new DeviceClient(t);
    const p = client.pair(choose);
    t.reply(verifyEvent({ code: "12", phase: "verify" }));
    await expect(p).rejects.toMatchObject({ code: "USER_REJECTED" });
    t.reply(verifyEvent({ code: "12", phase: "verify" })); // tinglovchi olib tashlangan
    t.reply({ id: 1, ok: false, error: "USER_REJECTED" });
    await new Promise((r) => setTimeout(r, 5));
    expect(choose).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
  });

  it("choose throwing a DeviceError rejects with that error at once (match=false sent)", async () => {
    const { t, sent } = recording();
    const client = new DeviceClient(t);
    const p = client.pair(() => Promise.reject(new DeviceError("TIMEOUT")));
    t.reply(verifyEvent({ code: "12", phase: "verify" }));
    await expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(sent[1]).toMatchObject({ cmd: "PAIR_VERIFY", params: { match: false } });
  });

  it("does not resolve on an early PAIR_HOST {} while choose is pending; a later 'no' is USER_REJECTED and sends no late PAIR_VERIFY", async () => {
    const { t, sent } = recording();
    const client = new DeviceClient(t);
    let decide: (v: boolean) => void = () => undefined;
    const p = client.pair(() => new Promise<boolean>((r) => (decide = r)));
    let settled = false;
    void p.then(() => (settled = true), () => (settled = true));
    t.reply(verifyEvent({ code: "12", phase: "verify" }));
    t.reply({ id: 1, ok: true, result: {} });
    await new Promise((r) => setTimeout(r, 5));
    expect(settled).toBe(false);
    decide(false);
    await expect(p).rejects.toMatchObject({ code: "USER_REJECTED" });
    await new Promise((r) => setTimeout(r, 5));
    expect(sent).toHaveLength(1); // PAIR_HOST allaqachon tugagan: kech PAIR_VERIFY yuborilmaydi
  });

  it("PAIR_HOST error while choose is pending rejects with it and sends no late PAIR_VERIFY", async () => {
    const { t, sent } = recording();
    const client = new DeviceClient(t);
    let decide: (v: boolean) => void = () => undefined;
    const p = client.pair(() => new Promise<boolean>((r) => (decide = r)));
    t.reply(verifyEvent({ code: "12", phase: "verify" }));
    t.reply({ id: 1, ok: false, error: "TIMEOUT" });
    await expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    decide(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(sent).toHaveLength(1);
  });

  it("throws PROTOCOL when the verify event carries no code, answering match=false", async () => {
    const { t, sent } = recording();
    const choose = vi.fn(() => true);
    const client = new DeviceClient(t);
    const p = client.pair(choose);
    t.reply(verifyEvent({ phase: "verify" }));
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({ cmd: "PAIR_VERIFY", params: { match: false } });
    t.reply({ id: 2, ok: true, result: {} });
    t.reply({ id: 1, ok: false, error: "USER_REJECTED" });
    await expect(p).rejects.toMatchObject({ code: "PROTOCOL" });
    expect(choose).not.toHaveBeenCalled();
  });
});
