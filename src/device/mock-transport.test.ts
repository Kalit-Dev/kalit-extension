import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceClient, DeviceError } from "./client";
import { generateKeyPair, type KeyPair } from "./noise";
import { MockTransport } from "./mock-transport";
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
  await c.client.call("PAIR_HOST", {});
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

  it("refuses the 33rd entry with INVALID_STATE", async () => {
    const { client } = await ready();
    for (let i = 0; i < 32; i++) {
      await client.call("ADD_ENTRY", { origin: `https://s${i}.example.com`, site: `s${i}.example.com`, username: "u" });
    }
    expect(await code(client.call("ADD_ENTRY", { origin: "https://x.example.com", site: "x.example.com", username: "u" }))).toBe("INVALID_STATE");
  });

  it("evicts the oldest host when a fifth one is paired with a button confirmation", async () => {
    const mock = new MockTransport({ fast: true });
    const hosts: KeyPair[] = [];
    for (let i = 0; i < 5; i++) {
      const id = generateKeyPair();
      hosts.push(id);
      const c = connect(mock, id);
      await c.transport.open();
      await c.client.call("PAIR_HOST", {});
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
      await a.client.call("PAIR_HOST", {});
      await a.client.call("ONBOARD", { masterPassword: "correct horse battery" });
      await a.transport.close();
      const b = connect(mock);
      await b.transport.open();
      await b.client.call("PAIR_HOST", {});
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

    it("CHANGE_MASTER keeps kind; capacity of 32 is shared between kinds", async () => {
      const { client } = await ready();
      const { entry } = await addSecret(client);
      await client.call("CHANGE_MASTER", { oldPassword: "correct horse battery", newPassword: "another long passphrase" });
      expect((await client.call("LIST", {})).entries[0]).toMatchObject({ id: entry.id, kind: "secret" });
      for (let i = 0; i < 31; i++) await addSecret(client, { title: `s${i}` });
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
    await first.client.call("PAIR_HOST", {});
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
    await client.call("PAIR_HOST", {});
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
    for (let i = 0; i < 30; i++) await client.call("ADD_ENTRY", { kind: "secret", title: `s${i}`, password: "pw" });
    expect(await code(client.call("IMPORT_BEGIN", { count: 3 }))).toBe("INVALID_STATE");
    await client.call("IMPORT_BEGIN", { count: 2 });
    await client.call("LOCK", {});
    expect(await code(client.call("IMPORT_BEGIN", { count: 1 }))).toBe("LOCKED");
  });
});
