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

  it("still times out ordinary commands after 8 s", async () => {
    vi.useFakeTimers();
    const client = new DeviceClient(fakeTransport());
    const p = client.call("LOCK", {});
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
  });
});
