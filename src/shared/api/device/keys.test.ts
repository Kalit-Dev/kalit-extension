import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetDevice, getHostKeyPair, getPinnedDeviceKey, pinDeviceKey } from "./keys";

function stubChrome() {
  const data: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (k: string) => (k in data ? { [k]: data[k] } : {}),
        set: async (o: Record<string, unknown>) => void Object.assign(data, o),
        remove: async (k: string) => void delete data[k],
      },
    },
  });
  return data;
}

describe("keys", () => {
  beforeEach(() => void stubChrome());

  it("creates the host key pair once and returns the same one afterwards", async () => {
    const a = await getHostKeyPair();
    const b = await getHostKeyPair();
    expect(a.pub).toHaveLength(32);
    expect(b).toEqual(a);
  });

  it("pins, reads and forgets the device key", async () => {
    expect(await getPinnedDeviceKey()).toBeNull();
    const key = new Uint8Array(32).fill(7);
    await pinDeviceKey(key);
    expect(await getPinnedDeviceKey()).toEqual(key);
    await forgetDevice();
    expect(await getPinnedDeviceKey()).toBeNull();
  });

  it("fails closed on a corrupt pin instead of treating it as 'no pin' (no silent re-pin)", async () => {
    for (const bad of ["zz-not-hex", "ab", "A".repeat(64), "0".repeat(63), 1234, true, {}, []]) {
      const data = stubChrome();
      data.deviceKey = bad;
      await expect(getPinnedDeviceKey()).rejects.toThrow("DEVICE_KEY_CHANGED");
    }
  });

  it("forgetDevice recovers from a corrupt pin explicitly", async () => {
    const data = stubChrome();
    data.deviceKey = "zz-not-hex";
    await forgetDevice();
    expect(await getPinnedDeviceKey()).toBeNull();
  });

  it("forgetDevice does not touch the host identity key", async () => {
    const host = await getHostKeyPair();
    await pinDeviceKey(new Uint8Array(32).fill(1));
    await forgetDevice();
    expect(await getHostKeyPair()).toEqual(host);
  });
});
