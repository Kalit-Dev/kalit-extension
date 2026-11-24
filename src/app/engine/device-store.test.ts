import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockTransport } from "@/shared/api/device/mock-transport";
import type { RawTransport } from "@/shared/api/device/transport";

// The store talks to the real SecureTransport + keys (pin storage) + the in-memory firmware simulator.
// Only the Web Serial port lookup is replaced: tests decide which "physical device" is plugged in.
const plugged: { current: RawTransport | null } = { current: null };
vi.mock("@/shared/api/device/serial-transport", () => ({
  SerialTransport: { fromGranted: async () => plugged.current },
}));

const { useDevice, engineSnapshot } = await import("./device-store");
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

/** Faol obunalar: har test oldidan bekor qilinadi (oldingi testning avto-tanlovi keyingisiga o'tmasin). */
const unsubs: (() => void)[] = [];

/**
 * Auto-presses the simulated button for every confirmation, like a user pressing "accept",
 * and picks the host-local pairing code when the engine offers pair choices.
 */
function autoPress(device: MockTransport) {
  useDevice.getState().client!.onEvent((e) => {
    if (e.event === "CONFIRM_PENDING") queueMicrotask(() => device.press("short"));
  });
  unsubs.push(
    useDevice.subscribe((s, prev) => {
      if (s.pairChoices && !prev.pairChoices) queueMicrotask(() => void useDevice.getState().pairChoose(useDevice.getState().pairingCode));
    }),
  );
}

/** Engine kod variantlarini ko'rsatguncha kutadi. */
const choicesShown = () => vi.waitFor(() => expect(useDevice.getState().pairChoices).not.toBeNull());

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

beforeEach(async () => {
  unsubs.splice(0).forEach((u) => u());
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

describe("device store: v0.7 device auto-lock and paging", () => {
  async function unlockedStore(device: MockTransport) {
    plugged.current = device;
    await useDevice.getState().connect("usb");
    autoPress(device);
    await useDevice.getState().pair();
    await useDevice.getState().onboard(MASTER);
    await useDevice.getState().refresh();
  }

  it("a LOCKED event from the device moves the store to locked and drops cached entries", async () => {
    const device = new MockTransport({ fast: true });
    await unlockedStore(device);
    await useDevice.getState().addEntry({ origin: "https://example.com", username: "ali", password: "pw" });
    expect(useDevice.getState().phase).toBe("unlocked");
    expect(useDevice.getState().entries).toHaveLength(1);

    device.triggerAutoLock();
    await vi.waitFor(() => expect(useDevice.getState().phase).toBe("locked"));
    expect(useDevice.getState().entries).toEqual([]);
    expect(useDevice.getState().pending).toBeNull();
    expect(useDevice.getState().status?.state).toBe("LOCKED");

    await useDevice.getState().unlock(MASTER); // unlock form works again
    expect(useDevice.getState().phase).toBe("unlocked");
    expect(useDevice.getState().entries).toHaveLength(1);
  });

  it("refresh returns the complete list across LIST pages (40 entries > 16 per page)", async () => {
    const device = new MockTransport({ fast: true });
    await unlockedStore(device);
    for (let i = 0; i < 40; i++) {
      await useDevice.getState().addEntry({ origin: `https://s${i}.example.com`, username: "u", password: "pw" });
    }
    await useDevice.getState().refresh();
    expect(useDevice.getState().entries).toHaveLength(40);
    expect(new Set(useDevice.getState().entries.map((e) => e.id)).size).toBe(40);
  });
});

describe("device store: v0.11 pairing code choice", () => {
  async function connected(device = new MockTransport({ fast: true })) {
    plugged.current = device;
    await useDevice.getState().connect("usb");
    expect(useDevice.getState().phase).toBe("pairing");
    return device;
  }
  /** Mock qurilmaning o'z hisoblagan SAS kodi (private maydon, faqat test uchun). */
  const deviceSas = (d: MockTransport) => d as unknown as { sas: string };

  it("pair exposes 3 choices incl. the local code and pins after choosing it (no button press)", async () => {
    const device = await connected();
    const local = useDevice.getState().pairingCode!;
    expect(local).toMatch(/^\d{2}$/);
    expect(local).toBe(deviceSas(device).sas); // halol qurilma: bir xil handshake hash
    const p = useDevice.getState().pair();
    await choicesShown();
    const choices = useDevice.getState().pairChoices!;
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
    expect(choices).toContain(local);
    await useDevice.getState().pairChoose(local);
    await p;
    expect(useDevice.getState().pairChoices).toBeNull();
    expect(useDevice.getState().status?.hostTrusted).toBe(true);
    expect(useDevice.getState().phase).toBe("factory");
  });

  it("pairChoose(null) rejects pair with USER_REJECTED and leaves phase 'pairing'", async () => {
    await connected();
    const p = code(useDevice.getState().pair());
    await choicesShown();
    await useDevice.getState().pairChoose(null);
    expect(await p).toBe("USER_REJECTED");
    expect(useDevice.getState().pairChoices).toBeNull();
    await useDevice.getState().refresh();
    expect(useDevice.getState().phase).toBe("pairing");
  });

  it("choosing a decoy rejects (USER_REJECTED) and host stays untrusted", async () => {
    await connected();
    const local = useDevice.getState().pairingCode!;
    const p = code(useDevice.getState().pair());
    await choicesShown();
    const decoy = useDevice.getState().pairChoices!.find((c) => c !== local)!;
    await useDevice.getState().pairChoose(decoy);
    expect(await p).toBe("USER_REJECTED");
    await useDevice.getState().refresh();
    expect(useDevice.getState().status?.hostTrusted).toBe(false);
    expect(useDevice.getState().phase).toBe("pairing");
  });

  it("choices come from the host-local code, not the code the device claims (MITM)", async () => {
    const device = await connected();
    const local = useDevice.getState().pairingCode!;
    const claimed = local === "00" ? "11" : "00";
    deviceSas(device).sas = claimed; // qurilma (yoki MITM) boshqa kodni e'lon qiladi
    const p = code(useDevice.getState().pair());
    await choicesShown();
    expect(useDevice.getState().pairChoices).toContain(local);
    // qurilma e'lon qilgan kodni tanlash = mos emas
    await useDevice.getState().pairChoose(claimed);
    expect(await p).toBe("USER_REJECTED");
    await useDevice.getState().refresh();
    expect(useDevice.getState().status?.hostTrusted).toBe(false);

    // mahalliy kodni tanlash qurilma e'lon qilgan kodga bog'liq emas
    const p2 = useDevice.getState().pair();
    await choicesShown();
    await useDevice.getState().pairChoose(local);
    await p2;
    expect(useDevice.getState().status?.hostTrusted).toBe(true);
  });

  it("retries in the same session expose the same choice set (decoys do not reveal the real code)", async () => {
    await connected();
    const local = useDevice.getState().pairingCode!;
    const p1 = code(useDevice.getState().pair());
    await choicesShown();
    const first = [...useDevice.getState().pairChoices!];
    await useDevice.getState().pairChoose(first.find((c) => c !== local)!);
    expect(await p1).toBe("USER_REJECTED");

    const p2 = code(useDevice.getState().pair());
    await choicesShown();
    expect(useDevice.getState().pairChoices).toEqual(first); // bir xil to'plam va tartib
    await useDevice.getState().pairChoose(null);
    expect(await p2).toBe("USER_REJECTED");

    const p3 = useDevice.getState().pair();
    await choicesShown();
    expect(useDevice.getState().pairChoices).toEqual(first);
    await useDevice.getState().pairChoose(local);
    await p3;
    expect(useDevice.getState().status?.hostTrusted).toBe(true);
  });

  it("a new session (disconnect + reconnect) regenerates the choice set with the new local code", async () => {
    const device = await connected();
    const p1 = code(useDevice.getState().pair());
    await choicesShown();
    const first = useDevice.getState().pairChoices!;
    await useDevice.getState().pairChoose(null);
    expect(await p1).toBe("USER_REJECTED");
    await useDevice.getState().disconnect();

    await connected(device);
    const local2 = useDevice.getState().pairingCode!;
    const p2 = code(useDevice.getState().pair());
    await choicesShown();
    const second = useDevice.getState().pairChoices!;
    expect(second).not.toBe(first);
    expect(second).toContain(local2);
    expect(second).not.toEqual(first); // yangi handshake = yangi kod va yangi chalg'ituvchilar
    await useDevice.getState().pairChoose(null);
    expect(await p2).toBe("USER_REJECTED");
  });

  it("pair without a local pairing code fails closed with PROTOCOL", async () => {
    await connected();
    useDevice.setState({ pairingCode: null });
    expect(await code(useDevice.getState().pair())).toBe("PROTOCOL");
    expect(useDevice.getState().pairChoices).toBeNull();
  });

  it("disconnect during choice resolves and clears pairChoices", async () => {
    await connected();
    const p = code(useDevice.getState().pair());
    await choicesShown();
    await useDevice.getState().disconnect();
    expect(useDevice.getState().pairChoices).toBeNull();
    // Bekor qilish = rad: qurilmaga PAIR_VERIFY {match:false} yuboriladi (u OLED'ni bo'shatadi), keyin port yopiladi.
    expect(await p).toBe("USER_REJECTED");
    expect(useDevice.getState().pairChoices).toBeNull();
    expect(await getPinnedDeviceKey()).toHaveLength(32); // TOFU pin ulanishda; host esa ishonchli emas
  });

  it("verify phase does not set pending; there is no press phase", async () => {
    await connected();
    const seen: { phase: string; pending: boolean }[] = [];
    useDevice.getState().client!.onEvent((e) => {
      if (e.event !== "CONFIRM_PENDING") return;
      queueMicrotask(() => {
        seen.push({ phase: e.data.phase ?? "press", pending: useDevice.getState().pending !== null });
        if (e.data.phase === "verify") void useDevice.getState().pairChoose(useDevice.getState().pairingCode);
      });
    });
    await useDevice.getState().pair();
    // pair oqimi o'z UI'siga ega: verify bosqichi umumiy tugma overlay'ini (`pending`) ochmaydi; tugma bosqichi yo'q
    expect(seen).toEqual([{ phase: "verify", pending: false }]);
    expect(useDevice.getState().pending).toBeNull();
    expect(useDevice.getState().status?.hostTrusted).toBe(true);
  });

  it("stale pairChoose with no pending choice is a no-op", async () => {
    await connected();
    await expect(useDevice.getState().pairChoose("12")).resolves.toBeUndefined();
    await expect(useDevice.getState().pairChoose(null)).resolves.toBeUndefined();
    expect(useDevice.getState().pairChoices).toBeNull();
    expect(useDevice.getState().phase).toBe("pairing");
  });

  it("snapshot has no pairingCode field", async () => {
    await connected();
    const p = useDevice.getState().pair();
    await choicesShown();
    const snap = engineSnapshot();
    expect(snap).not.toHaveProperty("pairingCode");
    expect(snap.pairChoices).toEqual(useDevice.getState().pairChoices);
    expect(Object.keys(snap).sort()).toEqual(["entries", "kind", "pairChoices", "pairState", "pending", "phase", "status"]);
    expect(snap.pairState).toBe("choosing");
    expect(JSON.stringify(snap)).not.toContain("pairingCode");
    await useDevice.getState().pairChoose(useDevice.getState().pairingCode);
    await p;
    expect(engineSnapshot().pairChoices).toBeNull();
  });
});

describe("device store: pair safety (final review fixes)", () => {
  async function connected(device = new MockTransport({ fast: true })) {
    plugged.current = device;
    await useDevice.getState().connect("usb");
    expect(useDevice.getState().phase).toBe("pairing");
    return device;
  }

  it("a phase-less action:'pair' CONFIRM_PENDING from the device never becomes `pending` (no device code in the overlay)", async () => {
    const device = await connected();
    device.emitEventForTest({ ev: "CONFIRM_PENDING", d: { action: "pair", code: "43", timeoutMs: 10_000 } });
    await new Promise((r) => setTimeout(r, 5));
    expect(useDevice.getState().pending).toBeNull();
    expect(engineSnapshot().pending).toBeNull();
  });

  it("other actions still set `pending`, but a device-supplied `code` is stripped", async () => {
    const device = await connected();
    device.emitEventForTest({ ev: "CONFIRM_PENDING", d: { action: "fill", site: "a.com", username: "u", code: "43", timeoutMs: 10_000 } });
    await vi.waitFor(() => expect(useDevice.getState().pending).not.toBeNull());
    expect(useDevice.getState().pending).toMatchObject({ action: "fill", site: "a.com", username: "u" });
    expect(useDevice.getState().pending).not.toHaveProperty("code");
  });

  it("pairState: idle -> choosing -> idle after picking the LOCAL code (no 'confirming' state, no button phase)", async () => {
    await connected();
    const states: string[] = [];
    unsubs.push(useDevice.subscribe((s, prev) => s.pairState !== prev.pairState && states.push(s.pairState)));
    const phases: (string | undefined)[] = [];
    useDevice.getState().client!.onEvent((e) => e.event === "CONFIRM_PENDING" && phases.push(e.data.phase));
    expect(useDevice.getState().pairState).toBe("idle");
    const p = useDevice.getState().pair();
    await vi.waitFor(() => expect(useDevice.getState().pairState).toBe("choosing"));
    await useDevice.getState().pairChoose(useDevice.getState().pairingCode);
    expect(useDevice.getState().pairState).toBe("idle"); // sinxron: mos keldi, ogohlantirish yo'q
    expect(useDevice.getState().pairChoices).toBeNull();
    await p;
    expect(states).toEqual(["choosing", "idle"]);
    expect(phases).toEqual(["verify"]);
    expect(useDevice.getState().status?.hostTrusted).toBe(true);
    expect(useDevice.getState().phase).toBe("factory");
  });

  it("decoy pick: pairState 'mismatch' (persistent), pair rejects USER_REJECTED without a button phase", async () => {
    await connected();
    const phases: (string | undefined)[] = [];
    useDevice.getState().client!.onEvent((e) => e.event === "CONFIRM_PENDING" && phases.push(e.data.phase));
    const local = useDevice.getState().pairingCode!;
    const p = code(useDevice.getState().pair());
    await vi.waitFor(() => expect(useDevice.getState().pairState).toBe("choosing"));
    await useDevice.getState().pairChoose(useDevice.getState().pairChoices!.find((c) => c !== local)!);
    expect(useDevice.getState().pairState).toBe("mismatch");
    expect(await p).toBe("USER_REJECTED");
    await new Promise((r) => setTimeout(r, 10));
    expect(useDevice.getState().pairState).toBe("mismatch"); // CONFIRM_DONE va kech PAIR_HOST uni o'chirmaydi
    expect(phases).toEqual(["verify"]);
    expect(engineSnapshot().pairState).toBe("mismatch");
    // qayta urinish holatni tozalaydi
    const p2 = code(useDevice.getState().pair());
    await vi.waitFor(() => expect(useDevice.getState().pairState).toBe("choosing"));
    await useDevice.getState().pairChoose(null);
    expect(await p2).toBe("USER_REJECTED");
  });

  it("'none' pick: pairState 'mismatch'", async () => {
    await connected();
    const p = code(useDevice.getState().pair());
    await vi.waitFor(() => expect(useDevice.getState().pairState).toBe("choosing"));
    await useDevice.getState().pairChoose(null);
    expect(useDevice.getState().pairState).toBe("mismatch");
    expect(await p).toBe("USER_REJECTED");
    expect(useDevice.getState().pairState).toBe("mismatch");
  });

  it("device-side verify end (CONFIRM_DONE) during choice -> TIMEOUT, pairState idle (not a user mismatch)", async () => {
    const device = await connected();
    const p = code(useDevice.getState().pair());
    await vi.waitFor(() => expect(useDevice.getState().pairState).toBe("choosing"));
    device.emitEventForTest({ ev: "CONFIRM_DONE" });
    expect(await p).toBe("TIMEOUT");
    expect(useDevice.getState().pairState).toBe("idle");
    expect(useDevice.getState().pairChoices).toBeNull();
  });

  it("disconnect resets pairState to idle", async () => {
    await connected();
    const p = code(useDevice.getState().pair());
    await vi.waitFor(() => expect(useDevice.getState().pairState).toBe("choosing"));
    await useDevice.getState().pairChoose(null);
    await p;
    await useDevice.getState().disconnect();
    expect(useDevice.getState().pairState).toBe("idle");
  });

  it("old firmware (< 1.3.0): pair() throws FIRMWARE_OUTDATED and never sends PAIR_HOST; other flows unchanged", async () => {
    const device = await connected(new MockTransport({ fast: true, firmware: "mock-1.2.9" }));
    expect(useDevice.getState().status?.firmware).toBe("mock-1.2.9");
    const c = useDevice.getState().client!;
    const sent: string[] = [];
    const call = c.call.bind(c);
    vi.spyOn(c, "call").mockImplementation(((cmd: Parameters<typeof call>[0], params: never) => {
      sent.push(cmd);
      return call(cmd, params);
    }) as typeof c.call);
    const events: string[] = [];
    c.onEvent((e) => events.push(e.event));
    expect(await code(useDevice.getState().pair())).toBe("FIRMWARE_OUTDATED");
    expect(sent).not.toContain("PAIR_HOST");
    expect(events).toEqual([]);
    expect(useDevice.getState().pairChoices).toBeNull();
    expect(useDevice.getState().pairState).toBe("idle");
    await useDevice.getState().refresh(); // GET_STATUS ishlaydi
    expect(useDevice.getState().phase).toBe("pairing");
    expect(useDevice.getState().status?.hostTrusted).toBe(false);
    void device;
  });

  it.each(["1.3.0", "mock-1.3.0", "1.10.0", "2.0.0"])("firmware %s passes the gate", async (fw) => {
    const device = await connected(new MockTransport({ fast: true, firmware: fw }));
    autoPress(device);
    await useDevice.getState().pair();
    expect(useDevice.getState().status?.hostTrusted).toBe(true);
  });

  it.each(["0.9.9", "1.2.0", "mock-1.1.0", "dev"])("firmware %s is refused", async (fw) => {
    await connected(new MockTransport({ fast: true, firmware: fw }));
    expect(await code(useDevice.getState().pair())).toBe("FIRMWARE_OUTDATED");
  });
});
