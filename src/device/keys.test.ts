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

  it("ignores a corrupt stored value", async () => {
    const data = stubChrome();
    data.deviceKey = "zz-not-hex";
    expect(await getPinnedDeviceKey()).toBeNull();
  });
});
