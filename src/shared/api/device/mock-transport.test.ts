import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceClient, DeviceError } from "./client";
import { generateKeyPair, type KeyPair } from "./noise";
import { MockTransport } from "./mock-transport";
import { computeTotp, parseTotpInput } from "@/shared/lib/totp";
import { SecureTransport } from "./secure-transport";

function connect(mock: MockTransport, identity: KeyPair = generateKeyPair(), pinned: { key: Uint8Array | null } = { key: null }) {
  const transport = new SecureTransport(mock, identity, {
    pinnedDeviceKey: async () => pinned.key,
    pinDeviceKey: async (k) => void (pinned.key = k),
    hostName: "Test Host",
    handshakeTimeoutMs: 500,
  });
  const client = new DeviceClient(transport);
  client.onEvent((e) => {
    if (e.event === "CONFIRM_PENDING") queueMicrotask(() => mock.press("short"));
  });
  return { transport, client, pinned };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof DeviceError ? e.code : String(e);
  }
};

async function ready(mock = new MockTransport({ fast: true })) {
  const c = connect(mock);
  await c.transport.open();
  await c.client.pair(() => true);
  await c.client.call("ONBOARD", { masterPassword: "correct horse battery" });
  return { mock, ...c };
}

describe("MockTransport behind Noise", () => {
  it("answers GET_STATUS for an unknown host but refuses everything else with NOT_TRUSTED", async () => {
    const { client, transport } = connect(new MockTransport({ fast: true }));
    await transport.open();
    expect((await client.call("GET_STATUS", {})).hostTrusted).toBe(false);
    expect(await code(client.call("LIST", {}))).toBe("NOT_TRUSTED");
    expect(await code(client.call("UNLOCK", { masterPassword: "x" }))).toBe("NOT_TRUSTED");
  });

  it("runs pair → onboard → add → lock → unlock → fill end to end", async () => {
    const { client } = await ready();
    const { entry } = await client.call("ADD_ENTRY", {
      origin: "https://accounts.example.com",
      site: "example.com",
      username: "ali",
      generateLength: 20,
    });
    expect(entry.site).toBe("example.com");
    await client.call("LOCK", {});
    await client.call("UNLOCK", { masterPassword: "correct horse battery" });
    const cred = await client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://mail.example.com" });
    expect(cred.username).toBe("ali");
    expect(cred.password).toHaveLength(20);
  });

  it("refuses GET_CREDENTIAL for another site with ORIGIN_MISMATCH", async () => {
    const { client } = await ready();
    const { entry } = await client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "a" });
    expect(await code(client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://notexample.com" }))).toBe("ORIGIN_MISMATCH");
  });

  it("refuses ADD_ENTRY whose site is not a suffix of the origin host", async () => {
    const { client } = await ready();
    expect(await code(client.call("ADD_ENTRY", { origin: "https://example.com", site: "evil.com", username: "a" }))).toBe("ORIGIN_MISMATCH");
    expect(await code(client.call("ADD_ENTRY", { origin: "https://example.com", site: "com", username: "a" }))).toBe("ORIGIN_MISMATCH");
  });

  it("refuses an entry whose site+username+title exceed the 160-byte metadata budget", async () => {
    const { client } = await ready();
    const longUser = "u".repeat(200);
    expect(await code(client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: longUser }))).toBe("INVALID_STATE");
  });

  it("refuses the 257th entry with INVALID_STATE", async () => {
    const { client } = await ready();
    for (let i = 0; i < 256; i++) {
      await client.call("ADD_ENTRY", { origin: `https://s${i}.example.com`, site: `s${i}.example.com`, username: "u" });
    }
    expect(await code(client.call("ADD_ENTRY", { origin: "https://x.example.com", site: "x.example.com", username: "u" }))).toBe("INVALID_STATE");
  });

  it("evicts the oldest host when a fifth one is paired", async () => {
    const mock = new MockTransport({ fast: true });
    const hosts: KeyPair[] = [];
    for (let i = 0; i < 5; i++) {
      const id = generateKeyPair();
      hosts.push(id);
      const c = connect(mock, id);
      await c.transport.open();
      await c.client.pair(() => true);
      await c.transport.close();
    }
    const status = async (id: KeyPair) => {
      const c = connect(mock, id, { key: null });
      await c.transport.open();
      const st = await c.client.call("GET_STATUS", {});
      await c.transport.close();
      return st.hostTrusted;
    };
    expect(await status(hosts[0]!)).toBe(false);
    expect(await status(hosts[1]!)).toBe(true);
    expect(await status(hosts[4]!)).toBe(true);
  });

  it("closes the session after WIPED so the old key cannot be used again", async () => {
    const { client, transport } = await ready();
    await client.call("LOCK", {});
    let closed = 0;
    transport.onClose(() => closed++);
    for (let i = 0; i < 10; i++) await code(client.call("UNLOCK", { masterPassword: "wrong wrong wrong" }));
    await new Promise((r) => setTimeout(r, 5));
    expect(closed).toBe(1);
  });

  it("wipes after 10 bad passwords: vault, pins and device key are gone", async () => {
    const { client, mock, pinned, transport } = await ready();
    await client.call("LOCK", {});
    let last: string | null = null;
    for (let i = 0; i < 10; i++) last = await code(client.call("UNLOCK", { masterPassword: "wrong wrong wrong" }));
    expect(last).toBe("WIPED");
    await transport.close();

    // eski pin bilan: qurilma kaliti o'zgargan
    const stale = connect(mock, generateKeyPair(), { key: pinned.key });
    await expect(stale.transport.open()).rejects.toThrow("DEVICE_KEY_CHANGED");

    // yangi pin bilan: zavod holati, host ishonchsiz, ma'lumot yo'q
    const fresh = connect(mock);
    await fresh.transport.open();
    const status = await fresh.client.call("GET_STATUS", {});
    expect(status).toMatchObject({ state: "FACTORY", hostTrusted: false });
    expect(await code(fresh.client.call("LIST", {}))).toBe("NOT_TRUSTED");
  });

  describe("v0.3 management", () => {
    const add = (client: DeviceClient) =>
      client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw-one" });

    it("CHANGE_MASTER re-keys: old password stops working, new one unlocks", async () => {
      const { client } = await ready();
      await client.call("CHANGE_MASTER", { oldPassword: "correct horse battery", newPassword: "another long passphrase" });
      await client.call("LOCK", {});
      expect(await code(client.call("UNLOCK", { masterPassword: "correct horse battery" }))).toBe("BAD_PASSWORD");
      await client.call("UNLOCK", { masterPassword: "another long passphrase" });
    });

    it("CHANGE_MASTER with a wrong old password burns attempts and wipes at zero", async () => {
      const { client, transport } = await ready();
      const bad = { oldPassword: "wrong wrong wrong", newPassword: "another long passphrase" };
      expect(await code(client.call("CHANGE_MASTER", bad))).toBe("BAD_PASSWORD");
      expect((await client.call("GET_STATUS", {})).attemptsLeft).toBe(9);
      let closed = 0;
      transport.onClose(() => closed++);
      let last: string | null = null;
      for (let i = 0; i < 9; i++) last = await code(client.call("CHANGE_MASTER", bad));
      expect(last).toBe("WIPED");
      await new Promise((r) => setTimeout(r, 5));
      expect(closed).toBe(1);
    });

    it("CHANGE_MASTER rejects short new passwords client-side", async () => {
      const { client } = await ready();
      await expect(client.call("CHANGE_MASTER", { oldPassword: "x", newPassword: "short" })).rejects.toThrow();
    });

    it("UPDATE_ENTRY changes username/title/password but never the site", async () => {
      const { client } = await ready();
      const { entry } = await add(client);
      const { entry: upd } = await client.call("UPDATE_ENTRY", { id: entry.id, username: "vali", title: "Work", password: "pw-two" });
      expect(upd).toMatchObject({ id: entry.id, site: "example.com", username: "vali", title: "Work" });
      const cred = await client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://example.com" });
      expect(cred).toEqual({ username: "vali", password: "pw-two" });
      expect((await client.call("LIST", {})).entries[0]).toMatchObject({ username: "vali", title: "Work" });
    });

    it("UPDATE_ENTRY needs at least one field, a known id and respects the metadata budget", async () => {
      const { client } = await ready();
      const { entry } = await add(client);
      await expect(client.call("UPDATE_ENTRY", { id: entry.id })).rejects.toThrow();
      expect(await code(client.call("UPDATE_ENTRY", { id: "nope", title: "x" }))).toBe("NOT_FOUND");
      expect(await code(client.call("UPDATE_ENTRY", { id: entry.id, username: "u".repeat(200) }))).toBe("INVALID_STATE");
    });

    it("LIST_HOSTS marks the current host; REVOKE_HOST of another host removes it", async () => {
      const mock = new MockTransport({ fast: true });
      const a = connect(mock);
      await a.transport.open();
      await a.client.pair(() => true);
      await a.client.call("ONBOARD", { masterPassword: "correct horse battery" });
      await a.transport.close();
      const b = connect(mock);
      await b.transport.open();
      await b.client.pair(() => true);
      const { hosts } = await b.client.call("LIST_HOSTS", {});
      expect(hosts).toHaveLength(2);
      expect(hosts.filter((h) => h.current)).toHaveLength(1);
      expect(hosts.every((h) => /^[0-9a-f]{16}$/.test(h.fp))).toBe(true);
      const other = hosts.find((h) => !h.current)!;
      await b.client.call("REVOKE_HOST", { slot: other.slot });
      expect((await b.client.call("LIST_HOSTS", {})).hosts).toHaveLength(1);
      expect(await code(b.client.call("REVOKE_HOST", { slot: other.slot }))).toBe("NOT_FOUND");
    });

    it("revoking the current host answers, then closes the channel", async () => {
      const { client, transport } = await ready();
      const { hosts } = await client.call("LIST_HOSTS", {});
      let closed = 0;
      transport.onClose(() => closed++);
      await client.call("REVOKE_HOST", { slot: hosts[0]!.slot });
      await new Promise((r) => setTimeout(r, 5));
      expect(closed).toBe(1);
    });

    it("vault commands require UNLOCKED, host commands do not (firmware parity)", async () => {
      const { client } = await ready();
      await client.call("LOCK", {});
      expect(await code(client.call("UPDATE_ENTRY", { id: "x", title: "t" }))).toBe("LOCKED");
      expect(await code(client.call("CHANGE_MASTER", { oldPassword: "a", newPassword: "b".repeat(12) }))).toBe("LOCKED");
      const { hosts } = await client.call("LIST_HOSTS", {});
      expect(hosts.length).toBeGreaterThan(0);
    });
  });
  describe("v0.4 secret entries", () => {
    const addSecret = (client: DeviceClient, extra: Record<string, unknown> = {}) =>
      client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", username: "home", password: "s3cret-pw", ...extra });
    const addWeb = (client: DeviceClient) =>
      client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw-one" });

    it("adds a secret (site empty, kind secret) and lists kinds; web defaults to web", async () => {
      const { client } = await ready();
      const { entry } = await addSecret(client);
      expect(entry).toMatchObject({ kind: "secret", site: "", title: "Wi-Fi", username: "home" });
      await addWeb(client);
      const kinds = (await client.call("LIST", {})).entries.map((e) => e.kind);
      expect(kinds).toEqual(["secret", "web"]);
    });

    it("generates a password and allows an empty username", async () => {
      const { client } = await ready();
      const { entry } = await client.call("ADD_ENTRY", { kind: "secret", title: "PIN", generateLength: 16 });
      expect(entry.username).toBe("");
      const cred = await client.call("REVEAL_SECRET", { id: entry.id });
      expect(cred.password).toHaveLength(16);
    });

    it("rejects invalid secret params client-side (no title, no password/generateLength)", async () => {
      const { client } = await ready();
      await expect(client.call("ADD_ENTRY", { kind: "secret", title: "", password: "x" })).rejects.toThrow();
      await expect(client.call("ADD_ENTRY", { kind: "secret", title: "x" })).rejects.toThrow();
      await expect(client.call("ADD_ENTRY", { kind: "secret", title: "x", generateLength: 11 })).rejects.toThrow();
    });

    it("REVEAL_SECRET returns the secret with a 'reveal' confirmation titled by the entry", async () => {
      const { client } = await ready();
      const { entry } = await addSecret(client);
      const seen: { action: string; site?: string }[] = [];
      client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data));
      expect(await client.call("REVEAL_SECRET", { id: entry.id })).toEqual({ username: "home", password: "s3cret-pw" });
      expect(seen[0]).toMatchObject({ action: "reveal", site: "Wi-Fi" });
    });

    it("REVEAL_SECRET errors: web -> INVALID_STATE, unknown -> NOT_FOUND, locked -> LOCKED", async () => {
      const { client } = await ready();
      const { entry: web } = await addWeb(client);
      expect(await code(client.call("REVEAL_SECRET", { id: web.id }))).toBe("INVALID_STATE");
      expect(await code(client.call("REVEAL_SECRET", { id: "nope" }))).toBe("NOT_FOUND");
      await client.call("LOCK", {});
      expect(await code(client.call("REVEAL_SECRET", { id: "nope" }))).toBe("LOCKED");
    });

    it("GET_CREDENTIAL on a secret is ORIGIN_MISMATCH", async () => {
      const { client } = await ready();
      const { entry } = await addSecret(client);
      expect(await code(client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://example.com" }))).toBe("ORIGIN_MISMATCH");
    });

    it("UPDATE_ENTRY and DELETE_ENTRY work for secrets and confirm with the title", async () => {
      const { client } = await ready();
      const { entry } = await addSecret(client);
      const seen: { action: string; site?: string }[] = [];
      client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data));
      const { entry: upd } = await client.call("UPDATE_ENTRY", { id: entry.id, title: "Office Wi-Fi", password: "new-pw" });
      expect(upd).toMatchObject({ kind: "secret", site: "", title: "Office Wi-Fi" });
      expect(await client.call("REVEAL_SECRET", { id: entry.id })).toEqual({ username: "home", password: "new-pw" });
      await client.call("DELETE_ENTRY", { id: entry.id });
      expect((await client.call("LIST", {})).entries).toHaveLength(0);
      expect(seen.map((s) => [s.action, s.site])).toEqual([
        ["update", "Wi-Fi"],
        ["reveal", "Office Wi-Fi"],
        ["delete", "Office Wi-Fi"],
      ]);
    });

    it("CHANGE_MASTER keeps kind; capacity of 256 is shared between kinds", async () => {
      const { client } = await ready();
      const { entry } = await addSecret(client);
      await client.call("CHANGE_MASTER", { oldPassword: "correct horse battery", newPassword: "another long passphrase" });
      expect((await client.call("LIST", {})).entries[0]).toMatchObject({ id: entry.id, kind: "secret" });
      for (let i = 0; i < 255; i++) await addSecret(client, { title: `s${i}` });
      expect(await code(addSecret(client, { title: "overflow" }))).toBe("INVALID_STATE");
      expect(await code(addWeb(client))).toBe("INVALID_STATE");
    });
  });
});

describe("protocol v0.5 import session", () => {
  afterEach(() => vi.useRealTimers());

  const add = (client: DeviceClient, n: number) =>
    client.call("ADD_ENTRY", { origin: `https://s${n}.example.com`, site: `s${n}.example.com`, username: "u", password: "pw" });
  const confirms = (client: DeviceClient) => {
    const seen: { action: string; site?: string; username?: string }[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data));
    return seen;
  };

  it("one confirmation, then count adds without buttons; session ends by itself", async () => {
    const { client } = await ready();
    const seen = confirms(client);
    await client.call("IMPORT_BEGIN", { count: 2 });
    expect(seen).toEqual([{ action: "import", site: "2 ta yozuv", timeoutMs: 10_000 }]);
    await add(client, 1);
    await client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", password: "pw" });
    expect(seen).toHaveLength(1);
    // count tugadi: keyingisi yana tasdiq so'raydi
    await add(client, 3);
    expect(seen.map((s) => s.action)).toEqual(["import", "save"]);
    expect(await client.call("IMPORT_END", {})).toEqual({ added: 0 });
    expect((await client.call("LIST", {})).entries).toHaveLength(3);
  });

  it("IMPORT_END returns the added count and closes the session", async () => {
    const { client } = await ready();
    const seen = confirms(client);
    await client.call("IMPORT_BEGIN", { count: 5 });
    await add(client, 1);
    await add(client, 2);
    expect(await client.call("IMPORT_END", {})).toEqual({ added: 2 });
    expect(await client.call("IMPORT_END", {})).toEqual({ added: 0 });
    await add(client, 3);
    expect(seen.map((s) => s.action)).toEqual(["import", "save"]);
  });

  it("expires after 120 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { client } = await ready();
    const seen = confirms(client);
    await client.call("IMPORT_BEGIN", { count: 3 });
    await add(client, 1);
    vi.setSystemTime(Date.now() + 119_000);
    await add(client, 2);
    vi.setSystemTime(Date.now() + 2_000);
    await add(client, 3);
    expect(seen.map((s) => s.action)).toEqual(["import", "save"]);
  });

  it("LOCK ends the session", async () => {
    const { client } = await ready();
    const seen = confirms(client);
    await client.call("IMPORT_BEGIN", { count: 3 });
    await client.call("LOCK", {});
    await client.call("UNLOCK", { masterPassword: "correct horse battery" });
    await add(client, 1);
    expect(seen.map((s) => s.action)).toEqual(["import", "save"]);
  });

  it("a reconnect (close) ends the session", async () => {
    const mock = new MockTransport({ fast: true });
    const identity = generateKeyPair();
    const first = connect(mock, identity);
    await first.transport.open();
    await first.client.pair(() => true);
    await first.client.call("ONBOARD", { masterPassword: "correct horse battery" });
    await first.client.call("IMPORT_BEGIN", { count: 3 });
    await mock.close();
    const second = connect(mock, identity);
    await second.transport.open();
    const seen = confirms(second.client);
    await second.client.call("UNLOCK", { masterPassword: "correct horse battery" });
    await add(second.client, 1);
    expect(seen.map((s) => s.action)).toEqual(["save"]);
  });

  it("rejection leaves no session", async () => {
    const mock = new MockTransport({ fast: true });
    const transport = new SecureTransport(mock, generateKeyPair(), {
      pinnedDeviceKey: async () => null,
      pinDeviceKey: async () => undefined,
      hostName: "Test Host",
      handshakeTimeoutMs: 500,
    });
    const client = new DeviceClient(transport);
    let button: "short" | "long" = "short";
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && queueMicrotask(() => mock.press(button)));
    await transport.open();
    await client.pair(() => true);
    await client.call("ONBOARD", { masterPassword: "correct horse battery" });
    button = "long";
    expect(await code(client.call("IMPORT_BEGIN", { count: 2 }))).toBe("USER_REJECTED");
    expect(await client.call("IMPORT_END", {})).toEqual({ added: 0 });
    const seen = confirms(client);
    expect(await code(add(client, 1))).toBe("USER_REJECTED"); // sessiya yo'q -> "save" tasdig'i
    expect(seen.map((s) => s.action)).toEqual(["save"]);
  });

  it("other confirm-requiring commands still need the button", async () => {
    const { client } = await ready();
    const { entry } = await add(client, 1);
    const seen = confirms(client);
    await client.call("IMPORT_BEGIN", { count: 3 });
    await client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://s1.example.com" });
    await client.call("UPDATE_ENTRY", { id: entry.id, username: "v" });
    await client.call("DELETE_ENTRY", { id: entry.id });
    expect(seen.map((s) => s.action)).toEqual(["import", "fill", "update", "delete"]);
  });

  it("errors do not end the session or consume the count", async () => {
    const { client } = await ready();
    const seen = confirms(client);
    await client.call("IMPORT_BEGIN", { count: 1 });
    expect(await code(client.call("ADD_ENTRY", { origin: "https://evil.com", site: "example.com", username: "u", password: "p" }))).toBe(
      "ORIGIN_MISMATCH",
    );
    await add(client, 1);
    expect(seen).toHaveLength(1);
    expect((await client.call("LIST", {})).entries).toHaveLength(1);
  });

  it("INVALID_STATE for a second session or count above free slots; LOCKED when locked", async () => {
    const { client } = await ready();
    await client.call("IMPORT_BEGIN", { count: 2 });
    expect(await code(client.call("IMPORT_BEGIN", { count: 1 }))).toBe("INVALID_STATE");
    await client.call("IMPORT_END", {});
    for (let i = 0; i < 254; i++) await client.call("ADD_ENTRY", { kind: "secret", title: `s${i}`, password: "pw" });
    expect(await code(client.call("IMPORT_BEGIN", { count: 3 }))).toBe("INVALID_STATE");
    await client.call("IMPORT_BEGIN", { count: 2 });
    await client.call("LOCK", {});
    expect(await code(client.call("IMPORT_BEGIN", { count: 1 }))).toBe("LOCKED");
  });
});

describe("protocol v0.6 encrypted backup (mock)", () => {
  afterEach(() => vi.useRealTimers());

  const PASS = "backup passphrase 1";
  const addWebN = (client: DeviceClient, n: number, username = "u") =>
    client.call("ADD_ENTRY", { origin: `https://s${n}.example.com`, site: `s${n}.example.com`, username, password: `pw${n}` });
  const confirms = (client: DeviceClient) => {
    const seen: { action: string; site?: string }[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data));
    return seen;
  };
  async function exportAll(client: DeviceClient, passphrase = PASS) {
    const { count, salt, iter } = await client.call("EXPORT_BEGIN", { passphrase });
    const blobs: Uint8Array[] = [];
    for (let i = 0; i < count; i++) blobs.push((await client.call("EXPORT_GET", { index: i })).blob);
    await client.call("EXPORT_END", {});
    return { count, salt, iter, blobs };
  }
  /** A second, empty device that will receive the backup. */
  async function fresh() {
    return ready(new MockTransport({ fast: true }));
  }
  const restoreBegin = (client: DeviceClient, b: { salt: Uint8Array; iter: number; count: number }, passphrase = PASS) =>
    client.call("RESTORE_BEGIN", { passphrase, salt: b.salt, iter: b.iter, count: b.count });

  it("export: one confirmation (site '<n> ta yozuv'), GET without buttons, blobs are opaque and bound to index", async () => {
    const { client } = await ready();
    await addWebN(client, 1, "alice");
    await client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", password: "supersecret" });
    const seen = confirms(client);
    const b = await exportAll(client);
    expect(seen).toEqual([{ action: "export", site: "2 ta yozuv", timeoutMs: 10_000 }]);
    expect(b.count).toBe(2);
    expect(b.salt).toHaveLength(16);
    expect(b.iter).toBeGreaterThanOrEqual(100_000);
    for (const blob of b.blobs) {
      const text = new TextDecoder("latin1").decode(blob);
      for (const secret of ["alice", "supersecret", "example.com", "Wi-Fi", "pw1"]) expect(text).not.toContain(secret);
    }
  });

  it("export errors: bad passphrase length, empty vault, active session, locked, not trusted", async () => {
    const { client } = await ready();
    // Passphrase length is also validated host-side by the schema; the device-side check is covered by an empty-vault case.
    expect(await code(client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("INVALID_STATE"); // empty vault
    await addWebN(client, 1);
    await client.call("EXPORT_BEGIN", { passphrase: PASS });
    expect(await code(client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("INVALID_STATE"); // session active
    expect(await code(client.call("RESTORE_BEGIN", { passphrase: PASS, salt: new Uint8Array(16), iter: 200_000, count: 1 }))).toBe(
      "INVALID_STATE",
    );
    await client.call("EXPORT_END", {});
    await client.call("LOCK", {});
    expect(await code(client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("LOCKED");
    expect(await code(client.call("EXPORT_GET", { index: 0 }))).toBe("LOCKED");

    const stranger = connect(new MockTransport({ fast: true }));
    await stranger.transport.open();
    expect(await code(stranger.client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("NOT_TRUSTED");
    expect(await code(stranger.client.call("RESTORE_ENTRY", { index: 0, blob: new Uint8Array(20) }))).toBe("NOT_TRUSTED");
  });

  it("EXPORT_GET: INVALID_STATE without session and for index >= count; EXPORT_END is idempotent", async () => {
    const { client } = await ready();
    await addWebN(client, 1);
    expect(await code(client.call("EXPORT_GET", { index: 0 }))).toBe("INVALID_STATE");
    await client.call("EXPORT_END", {});
    await client.call("EXPORT_BEGIN", { passphrase: PASS });
    expect(await code(client.call("EXPORT_GET", { index: 1 }))).toBe("INVALID_STATE");
    await client.call("EXPORT_GET", { index: 0 });
    await client.call("EXPORT_END", {});
    await client.call("EXPORT_END", {});
    expect(await code(client.call("EXPORT_GET", { index: 0 }))).toBe("INVALID_STATE");
  });

  it("rejecting the export confirmation leaves no session", async () => {
    const mock = new MockTransport({ fast: true });
    const transport = new SecureTransport(mock, generateKeyPair(), {
      pinnedDeviceKey: async () => null,
      pinDeviceKey: async () => undefined,
      hostName: "Test Host",
      handshakeTimeoutMs: 500,
    });
    const client = new DeviceClient(transport);
    let button: "short" | "long" = "short";
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && queueMicrotask(() => mock.press(button)));
    await transport.open();
    await client.pair(() => true);
    await client.call("ONBOARD", { masterPassword: "correct horse battery" });
    await addWebN(client, 1);
    button = "long";
    expect(await code(client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("USER_REJECTED");
    expect(await code(client.call("EXPORT_GET", { index: 0 }))).toBe("INVALID_STATE");
    expect(await code(client.call("RESTORE_BEGIN", { passphrase: PASS, salt: new Uint8Array(16), iter: 200_000, count: 1 }))).toBe(
      "USER_REJECTED",
    );
    expect(await client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });
  });

  it("round trip into an empty device: one confirmation, entries equal, passwords restored", async () => {
    const src = await ready();
    await addWebN(src.client, 1, "alice");
    await src.client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", username: "root", password: "s3cret" });
    const b = await exportAll(src.client);

    const dst = await fresh();
    const seen = confirms(dst.client);
    await restoreBegin(dst.client, b);
    expect(seen).toEqual([{ action: "restore", site: "2 ta yozuv", timeoutMs: 10_000 }]);
    const results = [];
    for (let i = 0; i < b.count; i++) results.push((await dst.client.call("RESTORE_ENTRY", { index: i, blob: b.blobs[i]! })).result);
    expect(results).toEqual(["added", "added"]);
    expect(await dst.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 }); // session closed itself after the last entry
    expect(seen).toHaveLength(1);

    const { entries } = await dst.client.call("LIST", {});
    expect(entries.map((e) => [e.kind, e.site, e.username, e.title ?? null])).toEqual([
      ["web", "s1.example.com", "alice", null],
      ["secret", "", "root", "Wi-Fi"],
    ]);
    const web = entries.find((e) => e.kind === "web")!;
    const cred = await dst.client.call("GET_CREDENTIAL", { id: web.id, origin: "https://s1.example.com" });
    expect(cred).toEqual({ username: "alice", password: "pw1" });
    const secret = entries.find((e) => e.kind === "secret")!;
    expect((await dst.client.call("REVEAL_SECRET", { id: secret.id })).password).toBe("s3cret");
  });

  it("restoring twice marks everything duplicate (kind+site+username), and a full vault fails with INVALID_STATE", async () => {
    const src = await ready();
    await addWebN(src.client, 1, "alice");
    await addWebN(src.client, 2, "bob");
    const b = await exportAll(src.client);
    // Same device: both already exist.
    await restoreBegin(src.client, b);
    for (let i = 0; i < b.count; i++) {
      expect((await src.client.call("RESTORE_ENTRY", { index: i, blob: b.blobs[i]! })).result).toBe("duplicate");
    }
    expect(await src.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });

    // Different device: one pre-existing, one new.
    const dst = await fresh();
    await addWebN(dst.client, 1, "alice");
    await restoreBegin(dst.client, b);
    expect((await dst.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! })).result).toBe("duplicate");
    expect((await dst.client.call("RESTORE_ENTRY", { index: 1, blob: b.blobs[1]! })).result).toBe("added");
    expect(await dst.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });

    // Full vault: the next new entry cannot fit.
    const full = await fresh();
    for (let i = 0; i < 256; i++) await full.client.call("ADD_ENTRY", { kind: "secret", title: `s${i}`, password: "pw" });
    await restoreBegin(full.client, b);
    expect(await code(full.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! }))).toBe("INVALID_STATE");
    await full.client.call("RESTORE_END", {});
  });

  it("wrong passphrase -> BAD_PASSWORD on the first entry and the session ends", async () => {
    const src = await ready();
    await addWebN(src.client, 1);
    await addWebN(src.client, 2);
    const b = await exportAll(src.client);
    const dst = await fresh();
    await restoreBegin(dst.client, b, "a completely different one");
    expect(await code(dst.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! }))).toBe("BAD_PASSWORD");
    expect(await code(dst.client.call("RESTORE_ENTRY", { index: 1, blob: b.blobs[1]! }))).toBe("INVALID_STATE"); // session is gone
    expect(await dst.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });
    expect((await dst.client.call("LIST", {})).entries).toEqual([]);
  });

  it("tampering: bit flip, swapped records, duplicated record, wrong salt / iter / count all fail", async () => {
    const src = await ready();
    for (let i = 1; i <= 3; i++) await addWebN(src.client, i);
    const b = await exportAll(src.client);
    const dst = await fresh();
    const attempt = async (begin: { salt: Uint8Array; iter: number; count: number }, index: number, blob: Uint8Array) => {
      await restoreBegin(dst.client, begin);
      const c = await code(dst.client.call("RESTORE_ENTRY", { index, blob }));
      await dst.client.call("RESTORE_END", {});
      return c;
    };
    const flipped = Uint8Array.from(b.blobs[0]!);
    flipped[3] ^= 1;
    expect(await attempt(b, 0, flipped)).toBe("BAD_PASSWORD");
    expect(await attempt(b, 0, b.blobs[1]!)).toBe("BAD_PASSWORD"); // swapped (index is bound)
    expect(await attempt(b, 2, b.blobs[0]!)).toBe("BAD_PASSWORD"); // duplicated at another index
    expect(await attempt(b, 0, b.blobs[0]!.subarray(0, 5))).toBe("BAD_PASSWORD"); // truncated
    expect(await attempt({ ...b, count: 2 }, 0, b.blobs[0]!)).toBe("BAD_PASSWORD"); // count is bound
    expect(await attempt({ ...b, iter: b.iter + 1 }, 0, b.blobs[0]!)).toBe("BAD_PASSWORD");
    const salt = Uint8Array.from(b.salt);
    salt[0] ^= 1;
    expect(await attempt({ ...b, salt }, 0, b.blobs[0]!)).toBe("BAD_PASSWORD");
    expect((await dst.client.call("LIST", {})).entries).toEqual([]);
    expect(await attempt(b, 0, b.blobs[0]!)).toBeNull(); // the untouched backup still works
  });

  it("RESTORE_ENTRY: out-of-range index, replayed index, no session -> INVALID_STATE; RESTORE_END idempotent", async () => {
    const src = await ready();
    await addWebN(src.client, 1);
    const b = await exportAll(src.client);
    const dst = await fresh();
    expect(await code(dst.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! }))).toBe("INVALID_STATE");
    await restoreBegin(dst.client, b);
    expect(await code(dst.client.call("RESTORE_ENTRY", { index: 1, blob: b.blobs[0]! }))).toBe("INVALID_STATE");
    await dst.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! });
    expect(await code(dst.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! }))).toBe("INVALID_STATE"); // session closed itself
    expect(await dst.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });
    expect(await dst.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });
  });

  it("RESTORE_BEGIN: second session and locked vault -> errors; schema rejects out-of-range iter/count/salt host-side", async () => {
    const { client } = await ready();
    const begin = { salt: new Uint8Array(16), iter: 200_000, count: 1 };
    await restoreBegin(client, begin);
    expect(await code(restoreBegin(client, begin))).toBe("INVALID_STATE");
    await client.call("RESTORE_END", {});
    await expect(restoreBegin(client, { ...begin, iter: 99_999 })).rejects.toThrow();
    await expect(restoreBegin(client, { ...begin, iter: 1_000_001 })).rejects.toThrow();
    await expect(restoreBegin(client, { ...begin, count: 0 })).rejects.toThrow();
    await expect(restoreBegin(client, { ...begin, count: 257 })).rejects.toThrow();
    await expect(restoreBegin(client, { ...begin, salt: new Uint8Array(15) })).rejects.toThrow();
    await expect(restoreBegin(client, begin, "short")).rejects.toThrow();
    await client.call("LOCK", {});
    expect(await code(restoreBegin(client, begin))).toBe("LOCKED");
  });

  it("sessions expire 120 s after the confirmation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const src = await ready();
    await addWebN(src.client, 1);
    await src.client.call("EXPORT_BEGIN", { passphrase: PASS });
    vi.setSystemTime(Date.now() + 119_000);
    const { blob } = await src.client.call("EXPORT_GET", { index: 0 });
    vi.setSystemTime(Date.now() + 2_000);
    expect(await code(src.client.call("EXPORT_GET", { index: 0 }))).toBe("INVALID_STATE");
    expect(await code(src.client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBeNull(); // slot is free again
    await src.client.call("EXPORT_END", {});

    const dst = await fresh();
    await restoreBegin(dst.client, { salt: new Uint8Array(16), iter: 200_000, count: 1 });
    vi.setSystemTime(Date.now() + 121_000);
    expect(await code(dst.client.call("RESTORE_ENTRY", { index: 0, blob }))).toBe("INVALID_STATE");
    expect(await dst.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });
  });

  it("LOCK and a reconnect end export and restore sessions", async () => {
    const mock = new MockTransport({ fast: true });
    const identity = generateKeyPair();
    const first = connect(mock, identity);
    await first.transport.open();
    await first.client.pair(() => true);
    await first.client.call("ONBOARD", { masterPassword: "correct horse battery" });
    await addWebN(first.client, 1);
    await first.client.call("EXPORT_BEGIN", { passphrase: PASS });
    await first.client.call("LOCK", {});
    await first.client.call("UNLOCK", { masterPassword: "correct horse battery" });
    expect(await code(first.client.call("EXPORT_GET", { index: 0 }))).toBe("INVALID_STATE");

    await first.client.call("EXPORT_BEGIN", { passphrase: PASS });
    await mock.close();
    const second = connect(mock, identity);
    await second.transport.open();
    await second.client.call("UNLOCK", { masterPassword: "correct horse battery" });
    expect(await code(second.client.call("EXPORT_GET", { index: 0 }))).toBe("INVALID_STATE");
    await second.client.call("RESTORE_BEGIN", { passphrase: PASS, salt: new Uint8Array(16), iter: 200_000, count: 1 });
    await mock.close();
    const third = connect(mock, identity);
    await third.transport.open();
    expect(await third.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });
  });

  it("RESTORE_END mid-session returns the running totals and ends it", async () => {
    const src = await ready();
    await addWebN(src.client, 1);
    await addWebN(src.client, 2);
    const b = await exportAll(src.client);
    const dst = await fresh();
    await restoreBegin(dst.client, b);
    await dst.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! });
    expect(await dst.client.call("RESTORE_END", {})).toEqual({ added: 1, skipped: 0 });
    expect(await code(dst.client.call("RESTORE_ENTRY", { index: 1, blob: b.blobs[1]! }))).toBe("INVALID_STATE");
  });

  it("secret duplicates are kind+username+title; web duplicates are kind+site+username", async () => {
    const src = await ready();
    await src.client.call("ADD_ENTRY", { kind: "secret", title: "A", username: "u", password: "p1" });
    await src.client.call("ADD_ENTRY", { kind: "secret", title: "B", username: "u", password: "p2" });
    const b = await exportAll(src.client);
    const dst = await fresh();
    await dst.client.call("ADD_ENTRY", { kind: "secret", title: "A", username: "u", password: "other" });
    await restoreBegin(dst.client, b);
    expect((await dst.client.call("RESTORE_ENTRY", { index: 0, blob: b.blobs[0]! })).result).toBe("duplicate");
    expect((await dst.client.call("RESTORE_ENTRY", { index: 1, blob: b.blobs[1]! })).result).toBe("added");
    expect((await dst.client.call("LIST", {})).entries).toHaveLength(2);
  });

  it("while an export session is active ADD/UPDATE/DELETE_ENTRY and CHANGE_MASTER answer BUSY; reads still work", async () => {
    const { client } = await ready();
    const { entry } = await addWebN(client, 1);
    await client.call("EXPORT_BEGIN", { passphrase: PASS });
    expect(await code(addWebN(client, 2))).toBe("BUSY");
    expect(await code(client.call("UPDATE_ENTRY", { id: entry.id, username: "v" }))).toBe("BUSY");
    expect(await code(client.call("DELETE_ENTRY", { id: entry.id }))).toBe("BUSY");
    expect(await code(client.call("CHANGE_MASTER", { oldPassword: "correct horse battery", newPassword: "another long passphrase" }))).toBe("BUSY");
    expect((await client.call("LIST", {})).entries).toHaveLength(1);
    await client.call("EXPORT_END", {});
    expect(await code(addWebN(client, 2))).toBeNull();
  });
});

describe("protocol v0.7: paginated LIST, updatedAt, auto-lock", () => {
  afterEach(() => vi.useRealTimers());

  const addN = (client: DeviceClient, n: number) =>
    client.call("ADD_ENTRY", { origin: `https://s${n}.example.com`, site: `s${n}.example.com`, username: "u", password: "pw" });

  it("pages 16 entries at a time with `next` = slot index; listAll joins them", async () => {
    const { client } = await ready();
    for (let i = 0; i < 40; i++) await addN(client, i);
    const p1 = await client.call("LIST", {});
    expect(p1.entries).toHaveLength(16);
    expect(p1.next).toBe(16);
    const p2 = await client.call("LIST", { cursor: 16 });
    expect(p2.entries).toHaveLength(16);
    expect(p2.next).toBe(32);
    const p3 = await client.call("LIST", { cursor: 32 });
    expect(p3.entries).toHaveLength(8);
    expect(p3.next).toBeUndefined();
    expect((await client.call("LIST", { cursor: 999 })).entries).toEqual([]);
    const all = await client.listAll();
    expect(all.map((e) => e.site)).toEqual(Array.from({ length: 40 }, (_, i) => `s${i}.example.com`));
  });

  it("exactly 16 entries fit one page without `next`; 256 entries need 16 pages", async () => {
    const { client } = await ready();
    for (let i = 0; i < 16; i++) await addN(client, i);
    expect((await client.call("LIST", {})).next).toBeUndefined();
    for (let i = 16; i < 256; i++) await client.call("ADD_ENTRY", { kind: "secret", title: `s${i}`, password: "pw" });
    expect(await client.listAll()).toHaveLength(256);
    expect(await code(client.call("LIST", { cursor: -1 }))).not.toBeNull();
  });

  it("stamps updatedAt (unix seconds) on ADD, UPDATE and RESTORE", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.900Z"));
    const t0 = Math.floor(Date.now() / 1000);
    const { client } = await ready();
    const { entry } = await addN(client, 1);
    expect(entry.updatedAt).toBe(t0);
    vi.setSystemTime(Date.now() + 5_000);
    const { entry: updated } = await client.call("UPDATE_ENTRY", { id: entry.id, password: "new" });
    expect(updated.updatedAt).toBe(t0 + 5);

    const { salt, iter } = await client.call("EXPORT_BEGIN", { passphrase: "backup passphrase 1" });
    const { blob } = await client.call("EXPORT_GET", { index: 0 });
    await client.call("EXPORT_END", {});
    const dst = await ready();
    vi.setSystemTime(Date.now() + 10_000);
    await dst.client.call("RESTORE_BEGIN", { passphrase: "backup passphrase 1", salt, iter, count: 1 });
    await dst.client.call("RESTORE_ENTRY", { index: 0, blob });
    expect((await dst.client.listAll())[0]!.updatedAt).toBe(t0 + 15);
  });

  it("`now` is optional on the wire: the schema accepts requests without it", async () => {
    const { Commands } = await import("./protocol");
    expect(Commands.UPDATE_ENTRY.params.safeParse({ id: "x", password: "p" }).success).toBe(true);
    expect(Commands.UPDATE_ENTRY.params.safeParse({ id: "x", password: "p", now: 1.5 }).success).toBe(false);
  });

  it("triggerAutoLock emits LOCKED, closes sessions and makes vault commands fail with LOCKED", async () => {
    const { client, mock } = await ready();
    const events: string[] = [];
    client.onEvent((e) => events.push(e.event));
    await addN(client, 1);
    await client.call("IMPORT_BEGIN", { count: 2 });
    mock.triggerAutoLock();
    await vi.waitFor(() => expect(events).toContain("LOCKED"));
    expect(await code(client.listAll())).toBe("LOCKED");
    expect((await client.call("GET_STATUS", {})).state).toBe("LOCKED");
    await client.call("UNLOCK", { masterPassword: "correct horse battery" });
    expect(await code(client.call("IMPORT_END", {}))).toBeNull();
    mock.triggerAutoLock(); // no-op when already locked is safe
  });
});

describe("protocol v0.8 secure note", () => {
  it("stores the note, flags hasNote in LIST, and returns text only via GET_NOTE with a confirmation", async () => {
    const { client } = await ready();
    const events: string[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && events.push(e.data.action));
    const { entry } = await client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw", note: "kod: 1234" });
    const plain = await client.call("ADD_ENTRY", { origin: "https://b.example.com", site: "b.example.com", username: "ali", password: "pw" });
    expect(entry.hasNote).toBe(true);
    expect(plain.entry.hasNote).toBeUndefined();
    const { entries } = await client.call("LIST", {});
    expect(entries.map((e) => !!e.hasNote)).toEqual([true, false]);
    expect(JSON.stringify(entries)).not.toContain("kod: 1234");
    events.length = 0;
    expect(await client.call("GET_NOTE", { id: entry.id })).toEqual({ note: "kod: 1234" });
    expect(events).toEqual(["reveal"]);
    events.length = 0;
    expect(await code(client.call("GET_NOTE", { id: plain.entry.id }))).toBe("INVALID_STATE");
    expect(await code(client.call("GET_NOTE", { id: "nope" }))).toBe("NOT_FOUND");
    expect(events).toEqual([]); // eslatmasiz/yo'q yozuvda tasdiq so'ralmaydi
  });

  it("works for secret entries and never leaks through GET_CREDENTIAL / REVEAL_SECRET", async () => {
    const { client } = await ready();
    const { entry } = await client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", username: "home", password: "pw", note: "router: 192.168.0.1" });
    expect(entry.hasNote).toBe(true);
    expect(await client.call("REVEAL_SECRET", { id: entry.id })).toEqual({ username: "home", password: "pw" });
    expect((await client.call("GET_NOTE", { id: entry.id })).note).toBe("router: 192.168.0.1");
  });

  it("updates and clears the note; a note-only UPDATE_ENTRY is valid; password updates keep it", async () => {
    const { client } = await ready();
    const { entry } = await client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw" });
    expect((await client.call("UPDATE_ENTRY", { id: entry.id, note: "bir" })).entry.hasNote).toBe(true);
    await client.call("UPDATE_ENTRY", { id: entry.id, password: "pw2" });
    expect((await client.call("GET_NOTE", { id: entry.id })).note).toBe("bir");
    expect((await client.call("UPDATE_ENTRY", { id: entry.id, note: "" })).entry.hasNote).toBeUndefined();
    expect(await code(client.call("GET_NOTE", { id: entry.id }))).toBe("INVALID_STATE");
  });

  it("limits the note to 1024 UTF-8 bytes (client validation and device INVALID_STATE)", async () => {
    const { client } = await ready();
    const base = { origin: "https://example.com", site: "example.com", username: "ali", password: "pw" };
    expect((await client.call("ADD_ENTRY", { ...base, note: "n".repeat(1024) })).entry.hasNote).toBe(true);
    // "ў" = 2 bayt: 513 ta = 1026 bayt
    await expect(client.call("ADD_ENTRY", { ...base, site: "b.example.com", origin: "https://b.example.com", note: "ў".repeat(513) })).rejects.toThrow();
    expect((await client.call("ADD_ENTRY", { ...base, site: "c.example.com", origin: "https://c.example.com", note: "ў".repeat(512) })).entry.hasNote).toBe(true);
  });

  it("survives encrypted export -> restore on a fresh device", async () => {
    const a = await ready();
    const { entry } = await a.client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw", note: "zaxira eslatmasi" });
    const begin = await a.client.call("EXPORT_BEGIN", { passphrase: "backup passphrase 1" });
    const blobs = [];
    for (let i = 0; i < begin.count; i++) blobs.push((await a.client.call("EXPORT_GET", { index: i })).blob);
    await a.client.call("EXPORT_END", {});
    const b = await ready();
    await b.client.call("RESTORE_BEGIN", { passphrase: "backup passphrase 1", salt: begin.salt, iter: begin.iter, count: begin.count });
    for (let i = 0; i < blobs.length; i++) await b.client.call("RESTORE_ENTRY", { index: i, blob: blobs[i]! });
    const { entries } = await b.client.call("LIST", {});
    expect(entries).toHaveLength(1);
    expect(entries[0]!.hasNote).toBe(true);
    expect((await b.client.call("GET_NOTE", { id: entries[0]!.id })).note).toBe("zaxira eslatmasi");
    expect(entry.id).not.toBe(entries[0]!.id);
  });
});

describe("protocol v0.9 TOTP (mock)", () => {
  const SEED = new TextEncoder().encode("12345678901234567890");
  const web = { origin: "https://example.com", site: "example.com", username: "ali", password: "pw" };

  it("computes the RFC 6238 code on the device after a confirmation, hasTotp in meta, seed never listed", async () => {
    const { client } = await ready();
    const events: string[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && events.push(e.data.action));
    const { entry } = await client.call("ADD_ENTRY", { ...web, totp: SEED });
    expect(entry.hasTotp).toBe(true);
    const { entries } = await client.call("LIST", {});
    expect(entries[0]!.hasTotp).toBe(true);
    expect(JSON.stringify(entries)).not.toContain("1234567890");
    events.length = 0;
    const t0 = Math.floor(Date.now() / 1000);
    const res = await client.getTotp(entry.id, "https://mail.example.com");
    expect(events).toEqual(["totp"]);
    expect(res.period).toBe(30);
    expect(res.validFor).toBeGreaterThanOrEqual(1);
    expect(res.validFor).toBeLessThanOrEqual(30);
    expect([computeTotp(SEED, t0), computeTotp(SEED, t0 + 1)]).toContain(res.code);
  });

  it("INVALID_STATE without a seed (no confirm), NOT_FOUND, ORIGIN_MISMATCH, LOCKED", async () => {
    const { client } = await ready();
    const events: string[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && events.push(e.data.action));
    const plain = await client.call("ADD_ENTRY", web);
    const withSeed = await client.call("ADD_ENTRY", { ...web, site: "b.com", origin: "https://b.com", totp: SEED });
    events.length = 0;
    expect(await code(client.getTotp(plain.entry.id))).toBe("INVALID_STATE");
    expect(await code(client.getTotp("nope"))).toBe("NOT_FOUND");
    expect(await code(client.getTotp(withSeed.entry.id, "https://evil.com"))).toBe("ORIGIN_MISMATCH");
    expect(await code(client.getTotp(withSeed.entry.id, "https://notb.com"))).toBe("ORIGIN_MISMATCH");
    expect(events).toEqual([]);
    await client.call("LOCK", {});
    expect(await code(client.getTotp(withSeed.entry.id))).toBe("LOCKED");
  });

  it("USER_REJECTED when the button is long-pressed", async () => {
    const mock = new MockTransport({ fast: true });
    const transport = new SecureTransport(mock, generateKeyPair(), {
      pinnedDeviceKey: async () => null,
      pinDeviceKey: async () => undefined,
      hostName: "Test Host",
      handshakeTimeoutMs: 500,
    });
    const client = new DeviceClient(transport);
    let press: "short" | "long" = "short";
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && queueMicrotask(() => mock.press(press)));
    await transport.open();
    await client.pair(() => true);
    await client.call("ONBOARD", { masterPassword: "correct horse battery" });
    const { entry } = await client.call("ADD_ENTRY", { ...web, totp: SEED });
    press = "long";
    expect(await code(client.getTotp(entry.id))).toBe("USER_REJECTED");
  });

  it("INVALID_STATE when `now` goes backwards (client stamps Date.now())", async () => {
    const { client } = await ready();
    const { entry } = await client.call("ADD_ENTRY", { ...web, totp: SEED });
    const spy = vi.spyOn(Date, "now");
    try {
      spy.mockReturnValue(2_000_000_000_000);
      await client.getTotp(entry.id);
      spy.mockReturnValue(1_999_999_000_000);
      expect(await code(client.getTotp(entry.id))).toBe("INVALID_STATE");
      spy.mockReturnValue(2_000_000_100_000);
      expect((await client.getTotp(entry.id)).code).toMatch(/^\d{6}$/);
    } finally {
      spy.mockRestore();
    }
  });

  it("update sets, replaces and removes (empty bytes); a totp-only UPDATE is valid", async () => {
    const { client } = await ready();
    const { entry } = await client.call("ADD_ENTRY", web);
    expect((await client.call("UPDATE_ENTRY", { id: entry.id, totp: SEED })).entry.hasTotp).toBe(true);
    const other = parseTotpInput("JBSWY3DPEHPK3PXP");
    await client.call("UPDATE_ENTRY", { id: entry.id, totp: other });
    const t = Math.floor(Date.now() / 1000);
    const got = await client.getTotp(entry.id);
    expect([computeTotp(other, t), computeTotp(other, t + 1)]).toContain(got.code);
    await client.call("UPDATE_ENTRY", { id: entry.id, password: "pw2" }); // parol yangilanishi TOTP'ni saqlaydi
    expect((await client.call("LIST", {})).entries[0]!.hasTotp).toBe(true);
    expect((await client.call("UPDATE_ENTRY", { id: entry.id, totp: new Uint8Array(0) })).entry.hasTotp).toBeUndefined();
    expect(await code(client.getTotp(entry.id))).toBe("INVALID_STATE");
  });

  it("works for secret entries (origin ignored) and survives export -> restore", async () => {
    const a = await ready();
    const { entry } = await a.client.call("ADD_ENTRY", { kind: "secret", title: "VPN", password: "pw", totp: SEED });
    expect(entry.hasTotp).toBe(true);
    expect((await a.client.getTotp(entry.id)).code).toMatch(/^\d{6}$/);
    const begin = await a.client.call("EXPORT_BEGIN", { passphrase: "backup passphrase 1" });
    const blob = (await a.client.call("EXPORT_GET", { index: 0 })).blob;
    await a.client.call("EXPORT_END", {});
    const b = await ready();
    await b.client.call("RESTORE_BEGIN", { passphrase: "backup passphrase 1", salt: begin.salt, iter: begin.iter, count: 1 });
    await b.client.call("RESTORE_ENTRY", { index: 0, blob });
    const [restored] = (await b.client.call("LIST", {})).entries;
    expect(restored!.hasTotp).toBe(true);
    const t = Math.floor(Date.now() / 1000);
    expect([computeTotp(SEED, t), computeTotp(SEED, t + 1)]).toContain((await b.client.getTotp(restored!.id)).code);
  });

  it("rejects out-of-range seeds on the wire (client schema)", async () => {
    const { client } = await ready();
    await expect(client.call("ADD_ENTRY", { ...web, totp: new Uint8Array(9) })).rejects.toThrow();
    await expect(client.call("ADD_ENTRY", { ...web, totp: new Uint8Array(65) })).rejects.toThrow();
  });
});

describe("v0.11 pairing code verify (PAIR_VERIFY)", () => {
  const trusted = async (client: DeviceClient) => (await client.call("GET_STATUS", {})).hostTrusted;
  const fresh = async () => {
    const mock = new MockTransport({ fast: true });
    const c = connect(mock);
    await c.transport.open();
    return { mock, ...c };
  };

  afterEach(() => vi.useRealTimers());

  /** Tugmani hech qachon bosmaydigan ulanish (pair tugmasiz tugashi kerak). */
  const freshNoPress = async () => {
    const mock = new MockTransport({ fast: true });
    const transport = new SecureTransport(mock, generateKeyPair(), {
      pinnedDeviceKey: async () => null,
      pinDeviceKey: async () => undefined,
      hostName: "Test Host",
      handshakeTimeoutMs: 500,
    });
    const client = new DeviceClient(transport);
    const log: string[] = [];
    client.onEvent((e) => log.push(e.event === "CONFIRM_PENDING" ? `PENDING:${e.data.phase ?? "press"}` : e.event));
    const orig = client.call.bind(client);
    client.call = ((cmd: Parameters<typeof orig>[0], params: Parameters<typeof orig>[1]) =>
      orig(cmd, params).then(
        (r) => (log.push(`${cmd}:ok`), r),
        (e: unknown) => {
          log.push(`${cmd}:${e instanceof DeviceError ? e.code : "err"}`);
          throw e;
        },
      )) as typeof client.call;
    await transport.open();
    return { mock, transport, client, log };
  };

  it("pair: matching choice pins WITHOUT any button press; wire order CONFIRM_DONE, PAIR_VERIFY {}, PAIR_HOST {}", async () => {
    const { client, log } = await freshNoPress();
    await client.pair(() => true);
    expect(log).toEqual(["PENDING:verify", "CONFIRM_DONE", "PAIR_VERIFY:ok", "PAIR_HOST:ok"]);
    expect(await trusted(client)).toBe(true);
  }, 2_000);

  it("pair: mismatch wire order CONFIRM_DONE, PAIR_VERIFY {}, PAIR_HOST USER_REJECTED", async () => {
    const { client, log } = await freshNoPress();
    const host = code(client.call("PAIR_HOST", {}));
    await vi.waitFor(() => expect(log).toContain("PENDING:verify"));
    await client.call("PAIR_VERIFY", { match: false });
    expect(await host).toBe("USER_REJECTED");
    expect(log).toEqual(["PENDING:verify", "CONFIRM_DONE", "PAIR_VERIFY:ok", "PAIR_HOST:USER_REJECTED"]);
    expect(await trusted(client)).toBe(false);
  });

  it("pair: verify timeout emits CONFIRM_DONE then PAIR_HOST TIMEOUT", async () => {
    const { client, log } = await freshNoPress();
    vi.useFakeTimers();
    const p = code(client.pair(() => new Promise<boolean>(() => {})));
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await p).toBe("TIMEOUT");
    vi.useRealTimers();
    expect(log).toEqual(["PENDING:verify", "CONFIRM_DONE", "PAIR_HOST:TIMEOUT"]);
  });

  it("pair: button presses during verify have no effect", async () => {
    const { mock, client } = await freshNoPress();
    const p = client.pair(async () => {
      mock.press("long");
      mock.press("short");
      await new Promise((r) => setTimeout(r, 5));
      return true;
    });
    await expect(p).resolves.toBeUndefined();
    expect(await trusted(client)).toBe(true);
  });

  it("pair: matching choice pins the host", async () => {
    const { client } = await fresh();
    await client.pair(() => true);
    expect(await trusted(client)).toBe(true);
  });

  it("pair: choose receives the device code", async () => {
    const { client, transport } = await fresh();
    const seen: { action: string; code: string; phase?: string; timeoutMs: number }[] = [];
    await client.pair((info) => (seen.push(info), true));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ action: "pair", phase: "verify", timeoutMs: 30_000 });
    expect(seen[0]!.code).toBe(transport.pairingCode);
  });

  it("pair: wrong choice rejects with USER_REJECTED and host stays untrusted", async () => {
    const { client } = await fresh();
    expect(await code(client.pair(() => false))).toBe("USER_REJECTED");
    expect(await trusted(client)).toBe(false);
  });

  it("pair: choose throwing/returning false never pins", async () => {
    const { client } = await fresh();
    expect(await code(client.pair(() => {
      throw new Error("ui closed");
    }))).toBe("USER_REJECTED");
    expect(await code(client.pair(async () => Promise.reject(new Error("x"))))).toBe("USER_REJECTED");
    expect(await code(client.pair(async () => false))).toBe("USER_REJECTED");
    expect(await trusted(client)).toBe(false);
  });

  it("PAIR_VERIFY without pending PAIR_HOST → INVALID_STATE", async () => {
    const { client } = await fresh();
    expect(await code(client.call("PAIR_VERIFY", { match: true }))).toBe("INVALID_STATE");
    expect(await trusted(client)).toBe(false);
  });

  it("second PAIR_VERIFY → INVALID_STATE", async () => {
    const { client } = await fresh();
    let second: Promise<string | null> | null = null;
    await client.pair(() => {
      // Birinchi PAIR_VERIFY'dan keyin yuborilsin (bir xil tartibdagi kanal).
      setTimeout(() => (second = code(client.call("PAIR_VERIFY", { match: false }))), 0);
      return true;
    });
    expect(await second).toBe("INVALID_STATE");
    expect(await trusted(client)).toBe(true);
  });

  it("LIST during verify → BUSY", async () => {
    const { client } = await fresh();
    let during: string | null = null;
    let status: boolean | null = null;
    await client.pair(async () => {
      during = await code(client.call("LIST", {}));
      status = await trusted(client);
      return true;
    });
    expect(during).toBe("BUSY");
    expect(status).toBe(false);
    expect(await trusted(client)).toBe(true);
  });

  it("verify timeout → TIMEOUT and no pin", async () => {
    const { client } = await fresh();
    vi.useFakeTimers();
    const p = code(client.pair(() => new Promise<boolean>(() => {})));
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await p).toBe("TIMEOUT");
    vi.useRealTimers();
    expect(await trusted(client)).toBe(false);
    expect(await code(client.call("PAIR_VERIFY", { match: true }))).toBe("INVALID_STATE");
  });

  it("closing the connection clears a pending verify", async () => {
    const mock = new MockTransport({ fast: true });
    const identity = generateKeyPair();
    const first = connect(mock, identity);
    await first.transport.open();
    const p = code(first.client.pair(() => new Promise<boolean>(() => {})));
    await new Promise((r) => setTimeout(r, 5));
    await mock.close();
    expect(await p).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5)); // eski sessiyaning kech javobi yangi handshake'ga aralashmasin
    const second = connect(mock, identity);
    await second.transport.open();
    await second.client.pair(() => true);
    expect(await trusted(second.client)).toBe(true);
  });

  it("PAIR_HOST for an already trusted host returns without a verify step", async () => {
    const { client } = await fresh();
    await client.pair(() => true);
    const seen: string[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data.phase ?? "button"));
    expect(await client.call("PAIR_HOST", {})).toEqual({});
    expect(seen).toEqual([]);
  });
});
