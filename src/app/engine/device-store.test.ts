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

describe("device store: v0.6 encrypted backup", () => {
  const PASS = "backup passphrase 1";

  async function unlockedStore(device: MockTransport) {
    plugged.current = device;
    await useDevice.getState().connect("usb");
    autoPress(device);
    await useDevice.getState().pair();
    await useDevice.getState().onboard(MASTER);
    await useDevice.getState().refresh();
  }
  const addWeb = (n: number, username = "u") =>
    useDevice.getState().addEntry({ origin: `https://s${n}.example.com`, username, password: `pw${n}` });

  it("exportBackup -> file -> restoreBackup into another device; entries refresh, progress reported", async () => {
    await unlockedStore(new MockTransport({ fast: true }));
    await addWeb(1, "alice");
    await addWeb(2, "bob");
    const progress: string[] = [];
    const file = await useDevice.getState().exportBackup(PASS, (p) => progress.push(`${p.stage}:${p.done}/${p.total}`));
    expect(file.count).toBe(2);
    expect(JSON.stringify(file)).not.toContain("alice");
    expect(progress).toEqual(["confirm:0/0", "transfer:0/2", "transfer:1/2", "transfer:2/2"]);
    expect(useDevice.getState().pending).toBeNull();

    await useDevice.getState().disconnect();
    await useDevice.getState().forgetDevice(); // a different physical device
    await unlockedStore(new MockTransport({ fast: true }));
    expect(useDevice.getState().entries).toEqual([]);
    expect(await useDevice.getState().restoreBackup(file, PASS)).toEqual({ added: 2, skipped: 0 });
    expect(useDevice.getState().entries.map((e) => e.username).sort()).toEqual(["alice", "bob"]);
    expect(await useDevice.getState().restoreBackup(file, PASS)).toEqual({ added: 0, skipped: 2 });
  });

  it("wrong passphrase -> BAD_PASSWORD, nothing added, session closed (a later restore with the right one works)", async () => {
    await unlockedStore(new MockTransport({ fast: true }));
    await addWeb(1);
    const file = await useDevice.getState().exportBackup(PASS);
    await useDevice.getState().disconnect();
    await useDevice.getState().forgetDevice(); // a different physical device
    await unlockedStore(new MockTransport({ fast: true }));
    const err = await useDevice.getState().restoreBackup(file, "some other passphrase").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "BAD_PASSWORD" });
    expect(JSON.stringify(err)).not.toContain("some other passphrase");
    expect(useDevice.getState().entries).toEqual([]);
    expect(await useDevice.getState().restoreBackup(file, PASS)).toEqual({ added: 1, skipped: 0 });
  });

  it("tampered file -> BAD_PASSWORD; a failed export leaves no session behind", async () => {
    await unlockedStore(new MockTransport({ fast: true }));
    await addWeb(1);
    const file = await useDevice.getState().exportBackup(PASS);
    const flipped = Uint8Array.from(atob(file.records[0]!), (c) => c.charCodeAt(0));
    flipped[0] ^= 1;
    const bad = { ...file, records: [btoa(String.fromCharCode(...flipped))] };
    expect(await code(useDevice.getState().restoreBackup(bad, PASS))).toBe("BAD_PASSWORD");
    // EXPORT_END ran in finally: a new export session can start right away
    expect((await useDevice.getState().exportBackup(PASS)).count).toBe(1);
  });

  it("empty vault and invalid passphrases are refused as INVALID_STATE without leaking the passphrase", async () => {
    await unlockedStore(new MockTransport({ fast: true }));
    expect(await code(useDevice.getState().exportBackup(PASS))).toBe("INVALID_STATE"); // empty vault
    const err = await useDevice.getState().exportBackup("short").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "INVALID_STATE" });
    expect(JSON.stringify(err)).not.toContain("short");
  });

  it("locked vault -> LOCKED", async () => {
    await unlockedStore(new MockTransport({ fast: true }));
    await addWeb(1);
    await useDevice.getState().lock();
    expect(await code(useDevice.getState().exportBackup(PASS))).toBe("LOCKED");
  });
});
