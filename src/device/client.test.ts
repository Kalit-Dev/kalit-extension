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
