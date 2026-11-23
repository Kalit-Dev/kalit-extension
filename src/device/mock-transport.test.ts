import { describe, expect, it } from "vitest";
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

  it("refuses a fifth host with INVALID_STATE", async () => {
    const mock = new MockTransport({ fast: true });
    for (let i = 0; i < 4; i++) {
      const c = connect(mock);
      await c.transport.open();
      await c.client.call("PAIR_HOST", {});
      await c.transport.close();
    }
    const fifth = connect(mock);
    await fifth.transport.open();
    expect(await code(fifth.client.call("PAIR_HOST", {}))).toBe("INVALID_STATE");
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
});
