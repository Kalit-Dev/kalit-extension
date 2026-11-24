import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceClient } from "./client";
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
    await expect(client.call("IMPORT_BEGIN", { count: 33 })).rejects.toThrow();
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
      { id: 2, cmd: "ADD_ENTRY", params: { kind: "secret", title: "T", generateLength: 20 } },
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
    await expect(client.call("RESTORE_BEGIN", { passphrase: "backup passphrase", salt, iter: 200_000, count: 33 })).rejects.toThrow();
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
