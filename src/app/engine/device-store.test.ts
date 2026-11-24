import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockTransport } from "@/shared/api/device/mock-transport";
import type { RawTransport } from "@/shared/api/device/transport";

// The store talks to the real SecureTransport + keys (pin storage) + the in-memory firmware simulator.
// Only the Web Serial port lookup is replaced: tests decide which "physical device" is plugged in.
const plugged: { current: RawTransport | null } = { current: null };
vi.mock("@/shared/api/device/serial-transport", () => ({
  SerialTransport: { fromGranted: async () => plugged.current },
}));

const { useDevice } = await import("./device-store");
const { getPinnedDeviceKey } = await import("@/shared/api/device/keys");

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

const MASTER = "correct horse battery";
const BAD = "wrong wrong wrong";

/** Auto-presses the simulated button for every confirmation, like a user pressing "accept". */
function autoPress(device: MockTransport) {
  useDevice.getState().client!.onEvent((e) => {
    if (e.event === "CONFIRM_PENDING") queueMicrotask(() => device.press("short"));
  });
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

beforeEach(async () => {
  stubChrome();
  vi.stubGlobal("navigator", { platform: "TestOS" });
  await useDevice.getState().disconnect().catch(() => undefined);
  plugged.current = null;
});

describe("device store: device key pinning and wipe", () => {
  it("pins the key on the first connect and refuses a different device afterwards without re-pinning", async () => {
    const genuine = new MockTransport({ fast: true });
    plugged.current = genuine;
    await useDevice.getState().connect("usb");
    const pinned = await getPinnedDeviceKey();
    expect(pinned).toHaveLength(32);
    await useDevice.getState().disconnect();

    plugged.current = new MockTransport({ fast: true }); // someone swaps the device
    expect(await code(useDevice.getState().connect("usb"))).toBe("DEVICE_KEY_CHANGED");
    expect(useDevice.getState().client).toBeNull();
    expect(useDevice.getState().phase).toBe("disconnected");
    expect(await getPinnedDeviceKey()).toEqual(pinned);

    // same genuine device still works, nothing was forgotten
    plugged.current = genuine;
    await useDevice.getState().connect("usb");
    expect(useDevice.getState().client).not.toBeNull();
  });

  it("silent auto-connect to a changed device stays disconnected and does not re-pin", async () => {
    plugged.current = new MockTransport({ fast: true });
    await useDevice.getState().connect("usb");
    const pinned = await getPinnedDeviceKey();
    await useDevice.getState().disconnect();
    plugged.current = new MockTransport({ fast: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await useDevice.getState().connect("usb", { silent: true }); // swallows the error by design
    expect(useDevice.getState().client).toBeNull();
    expect(await getPinnedDeviceKey()).toEqual(pinned);
  });

  it("10th wrong master: WIPED forgets the pin, drops the session, and the next connect to the regenerated device pins afresh", async () => {
    const device = new MockTransport({ fast: true });
    plugged.current = device;
    await useDevice.getState().connect("usb");
    autoPress(device);
    await useDevice.getState().pair();
    await useDevice.getState().onboard(MASTER);
    await useDevice.getState().refresh();
    await useDevice.getState().lock();
    const pinned = await getPinnedDeviceKey();

    for (let i = 1; i <= 9; i++) {
      expect(await code(useDevice.getState().unlock(BAD))).toBe("BAD_PASSWORD");
      expect(useDevice.getState().status?.attemptsLeft).toBe(10 - i);
    }
    expect(await code(useDevice.getState().unlock(BAD))).toBe("WIPED");
    expect(useDevice.getState().client).toBeNull();
    expect(useDevice.getState().phase).toBe("disconnected");
    expect(await getPinnedDeviceKey()).toBeNull();

    await useDevice.getState().connect("usb");
    const repinned = await getPinnedDeviceKey();
    expect(repinned).not.toEqual(pinned); // device regenerated its static key
    expect(useDevice.getState().phase).toBe("pairing"); // factory + untrusted host
  });

  it("without the host-side forget (e.g. wipe seen on another host) a regenerated device is refused", async () => {
    const device = new MockTransport({ fast: true });
    plugged.current = device;
    await useDevice.getState().connect("usb");
    autoPress(device);
    await useDevice.getState().pair();
    await useDevice.getState().onboard(MASTER);
    await useDevice.getState().lock();
    const pinned = await getPinnedDeviceKey();
    await useDevice.getState().disconnect();
    // wipe the device behind the host's back
    const other = new MockTransport({ fast: true });
    plugged.current = other;
    expect(await code(useDevice.getState().connect("usb"))).toBe("DEVICE_KEY_CHANGED");
    expect(await getPinnedDeviceKey()).toEqual(pinned);
    await useDevice.getState().forgetDevice(); // explicit user action
    await useDevice.getState().connect("usb");
    expect(await getPinnedDeviceKey()).not.toEqual(pinned);
  });

  it("changeMaster with a wrong old password uses the same counter and wipes on the 10th failure", async () => {
    const device = new MockTransport({ fast: true });
    plugged.current = device;
    await useDevice.getState().connect("usb");
    autoPress(device);
    await useDevice.getState().pair();
    await useDevice.getState().onboard(MASTER);
    await useDevice.getState().refresh();
    for (let i = 0; i < 9; i++) expect(await code(useDevice.getState().changeMaster(BAD, "another long master pw"))).toBe("BAD_PASSWORD");
    expect(await code(useDevice.getState().changeMaster(BAD, "another long master pw"))).toBe("WIPED");
    expect(await getPinnedDeviceKey()).toBeNull();
    expect(useDevice.getState().client).toBeNull();
  });
});
