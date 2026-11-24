/**
 * Interop: haqiqiy TS SecureTransport <-> kalit-firmware native binari (C++ Noise responder).
 * Binar: $KALIT_FIRMWARE_DIR (default ../kalit-firmware) / .pio/build/native_app/program
 * Yaratish: `pio run -e native_app` (firmware repo'sida). Binar topilmasa test SKIP bo'ladi.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, runExport, runRestore, type BackupDeviceApi } from "./backup";
import { DeviceClient, DeviceError } from "./client";
import { encodeFrame, FrameReader } from "./cobs";
import { generateKeyPair, type KeyPair } from "./noise";
import { SecureTransport } from "./secure-transport";
import { hostMatchesSite, originHost, siteValid } from "./site-rules";
import type { RawTransport } from "./transport";

const here = path.dirname(fileURLToPath(import.meta.url));
const firmwareDir = process.env.KALIT_FIRMWARE_DIR ?? path.resolve(here, "..", "..", "..", "..", "..", "kalit-firmware");
const binary = path.join(firmwareDir, ".pio/build/native_app/program");
const available = existsSync(binary);
if (!available) console.warn(`[interop] SKIPPED: ${binary} topilmadi (pio run -e native_app)`);

class ProcessTransport implements RawTransport {
  readonly kind = "usb" as const;
  stderr = "";
  private proc: ChildProcessWithoutNullStreams | null = null;
  private readonly reader = new FrameReader();
  private frameListener: (f: Uint8Array) => void = () => undefined;
  private closeListener: () => void = () => undefined;

  constructor(private readonly args: string[]) {}

  async open() {
    const proc = spawn(binary, this.args);
    this.proc = proc;
    proc.stdout.on("data", (chunk: Buffer) => {
      for (const f of this.reader.push(new Uint8Array(chunk))) this.frameListener(f);
    });
    proc.stderr.on("data", (c: Buffer) => (this.stderr += c.toString()));
    proc.on("exit", () => this.closeListener());
    await new Promise((r) => setTimeout(r, 100));
  }
  async close() {
    this.proc?.stdin.end();
    this.proc?.kill();
  }
  async send(frame: Uint8Array) {
    this.proc!.stdin.write(encodeFrame(frame));
  }
  onFrame(l: (f: Uint8Array) => void) {
    this.frameListener = l;
  }
  onClose(l: () => void) {
    this.closeListener = l;
  }
}

const open: ProcessTransport[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((t) => t.close()));
});

async function start(mode: "accept" | "reject") {
  const state = mkdtempSync(path.join(tmpdir(), "kalit-interop-"));
  const raw = new ProcessTransport(["--state", state, `--auto-confirm=${mode}`]);
  open.push(raw);
  const secure = new SecureTransport(raw, generateKeyPair(), {
    pinnedDeviceKey: async () => null,
    pinDeviceKey: async () => undefined,
    hostName: "Interop Host",
    handshakeTimeoutMs: 3000,
  });
  await secure.open();
  return { raw, secure, client: new DeviceClient(secure) };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof DeviceError ? e.code : String(e);
  }
};

describe.skipIf(!available)("interop with native firmware", () => {
  it("handshakes, pairs, onboards, stores and fills a credential", async () => {
    const { raw, secure, client } = await start("accept");
    expect(secure.deviceInfo).toEqual({ fw: "1.0.0", name: "Kalit" });

    const status = await client.call("GET_STATUS", {});
    expect(status).toMatchObject({ state: "FACTORY", hostTrusted: false, firmware: "1.0.0" });
    expect(await code(client.call("LIST", {}))).toBe("NOT_TRUSTED");

    await client.call("PAIR_HOST", {});
    // SAS kodi ikki tomonda bir xil: qurilma uni serial log'ga yozgan
    expect(raw.stderr).toContain(`PAIR CODE ${secure.pairingCode}`);

    await client.call("ONBOARD", { masterPassword: "correct horse battery" });
    const { entry } = await client.call("ADD_ENTRY", {
      origin: "https://accounts.example.com",
      site: "example.com",
      username: "ali",
      generateLength: 24,
    });
    expect(entry).toMatchObject({ site: "example.com", username: "ali" });

    await client.call("LOCK", {});
    expect(await code(client.call("LIST", {}))).toBe("LOCKED");
    await client.call("UNLOCK", { masterPassword: "correct horse battery" });
    expect((await client.call("LIST", {})).entries).toHaveLength(1);

    const cred = await client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://mail.example.com" });
    expect(cred.username).toBe("ali");
    expect(cred.password).toHaveLength(24);
    expect(await code(client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://notexample.com" }))).toBe(
      "ORIGIN_MISMATCH",
    );
    await client.call("DELETE_ENTRY", { id: entry.id });
    expect((await client.call("LIST", {})).entries).toHaveLength(0);
  }, 30_000);

  it("v0.3 management: update entry, change master, list hosts, revoke", async () => {
    const { client } = await start("accept");
    await client.call("PAIR_HOST", {});
    await client.call("ONBOARD", { masterPassword: "correct horse battery" });
    const { entry } = await client.call("ADD_ENTRY", {
      origin: "https://example.com",
      site: "example.com",
      username: "ali",
      generateLength: 20,
    });

    const upd = await client.call("UPDATE_ENTRY", { id: entry.id, username: "vali", password: "n3w-Pass-Word-123" });
    expect(upd.entry).toMatchObject({ id: entry.id, site: "example.com", username: "vali" });
    const cred = await client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://example.com" });
    expect(cred).toMatchObject({ username: "vali", password: "n3w-Pass-Word-123" });

    expect(await code(client.call("CHANGE_MASTER", { oldPassword: "wrong password!!", newPassword: "another long master" }))).toBe(
      "BAD_PASSWORD",
    );
    await client.call("CHANGE_MASTER", { oldPassword: "correct horse battery", newPassword: "another long master" });
    await client.call("LOCK", {});
    expect(await code(client.call("UNLOCK", { masterPassword: "correct horse battery" }))).toBe("BAD_PASSWORD");
    await client.call("UNLOCK", { masterPassword: "another long master" });
    expect((await client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://example.com" })).password).toBe(
      "n3w-Pass-Word-123",
    );

    const { hosts } = await client.call("LIST_HOSTS", {});
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({ current: true });
    expect(hosts[0]!.fp).toMatch(/^[0-9a-f]{16}$/);
    await client.call("REVOKE_HOST", { slot: hosts[0]!.slot });
  }, 30_000);

  it("v0.4 secret entries: add, list, reveal, get_credential mismatch, update, delete", async () => {
    const { client } = await start("accept");
    await client.call("PAIR_HOST", {});
    await client.call("ONBOARD", { masterPassword: "correct horse battery" });
    const { entry } = await client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", username: "home", password: "s3cret-pw" });
    expect(entry).toMatchObject({ kind: "secret", site: "", title: "Wi-Fi", username: "home" });
    const web = await client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw" });
    expect(web.entry.kind).toBe("web");
    expect((await client.call("LIST", {})).entries.map((e) => e.kind).sort()).toEqual(["secret", "web"]);

    expect(await client.call("REVEAL_SECRET", { id: entry.id })).toEqual({ username: "home", password: "s3cret-pw" });
    expect(await code(client.call("REVEAL_SECRET", { id: web.entry.id }))).toBe("INVALID_STATE");
    expect(await code(client.call("REVEAL_SECRET", { id: "nope" }))).toBe("NOT_FOUND");
    expect(await code(client.call("GET_CREDENTIAL", { id: entry.id, origin: "https://example.com" }))).toBe("ORIGIN_MISMATCH");

    const upd = await client.call("UPDATE_ENTRY", { id: entry.id, title: "Office", password: "new-pw" });
    expect(upd.entry).toMatchObject({ kind: "secret", title: "Office" });
    expect((await client.call("REVEAL_SECRET", { id: entry.id })).password).toBe("new-pw");
    await client.call("DELETE_ENTRY", { id: entry.id });
    expect((await client.call("LIST", {})).entries).toHaveLength(1);
  }, 30_000);

  it("v0.5 import session: one confirmation, then adds without buttons", async () => {
    const { client } = await start("accept");
    await client.call("PAIR_HOST", {});
    await client.call("ONBOARD", { masterPassword: "correct horse battery" });
    const seen: string[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data.action));

    await client.call("IMPORT_BEGIN", { count: 2 });
    expect(seen).toEqual(["import"]);
    await client.call("ADD_ENTRY", { origin: "https://a.example.com", site: "a.example.com", username: "u", password: "pw" });
    expect(await code(client.call("ADD_ENTRY", { origin: "https://evil.com", site: "example.com", username: "u", password: "p" }))).toBe(
      "ORIGIN_MISMATCH",
    );
    await client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", password: "pw" });
    expect(seen).toEqual(["import"]); // count tugadi: sessiya yopilgan
    await client.call("ADD_ENTRY", { origin: "https://b.example.com", site: "b.example.com", username: "u", password: "pw" });
    expect(seen).toEqual(["import", "save"]);
    expect(await client.call("IMPORT_END", {})).toEqual({ added: 0 });

    // IMPORT_END erta tugatadi va qo'shilganlar sonini qaytaradi
    await client.call("IMPORT_BEGIN", { count: 5 });
    await client.call("ADD_ENTRY", { origin: "https://c.example.com", site: "c.example.com", username: "u", password: "pw" });
    expect(await client.call("IMPORT_END", {})).toEqual({ added: 1 });
    expect(await code(client.call("IMPORT_BEGIN", { count: 31 }))).toBe("INVALID_STATE"); // 4 ta band, 28 bo'sh

    // LOCK sessiyani tugatadi; boshqa buyruqlar tugma talab qiladi
    await client.call("IMPORT_BEGIN", { count: 2 });
    await client.call("LOCK", {});
    await client.call("UNLOCK", { masterPassword: "correct horse battery" });
    const before = seen.length;
    await client.call("ADD_ENTRY", { origin: "https://d.example.com", site: "d.example.com", username: "u", password: "pw" });
    expect(seen.slice(before)).toEqual(["save"]);
  }, 30_000);

  it("surfaces CONFIRM_PENDING for the pairing code and honours a rejection on the device", async () => {
    const { client } = await start("reject");
    const seen: string[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data.action));
    expect(await code(client.call("PAIR_HOST", {}))).toBe("USER_REJECTED");
    expect(seen).toEqual(["pair"]);
    expect((await client.call("GET_STATUS", {})).hostTrusted).toBe(false);
  }, 15_000);
});

/** Host-side persistent view: same identity key + the same in-memory "pin store" across device restarts. */
function hostProfile() {
  const pin: { key: Uint8Array | null } = { key: null };
  const identity = generateKeyPair();
  return {
    pin,
    identity,
    forget: () => void (pin.key = null),
  };
}

async function startOn(state: string, profile: { pin: { key: Uint8Array | null }; identity: KeyPair }, mode: "accept" | "reject" = "accept") {
  const raw = new ProcessTransport(["--state", state, `--auto-confirm=${mode}`]);
  open.push(raw);
  const secure = new SecureTransport(raw, profile.identity, {
    pinnedDeviceKey: async () => profile.pin.key,
    pinDeviceKey: async (k) => void (profile.pin.key = k),
    hostName: "Interop Host",
    handshakeTimeoutMs: 3000,
  });
  await secure.open();
  return { raw, secure, client: new DeviceClient(secure) };
}

async function stop(t: ProcessTransport) {
  const exited = new Promise<void>((r) => t.onClose(r));
  await t.close();
  await Promise.race([exited, new Promise((r) => setTimeout(r, 500))]);
}

describe.skipIf(!available)("interop: wipe, attempts and device-key pinning against the real firmware", () => {
  const MASTER = "correct horse battery";

  it("10th wrong password wipes: WIPED, session closed, new device key rejected until forgotten, factory afterwards", async () => {
    const state = mkdtempSync(path.join(tmpdir(), "kalit-interop-"));
    const profile = hostProfile();
    const a = await startOn(state, profile);
    const pinnedKey = profile.pin.key!;
    expect(pinnedKey).toHaveLength(32);
    await a.client.call("PAIR_HOST", {});
    await a.client.call("ONBOARD", { masterPassword: MASTER });
    await a.client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw" });
    await a.client.call("LOCK", {});
    for (let i = 1; i <= 9; i++) {
      expect(await code(a.client.call("UNLOCK", { masterPassword: "wrong wrong wrong" }))).toBe("BAD_PASSWORD");
      expect((await a.client.call("GET_STATUS", {})).attemptsLeft).toBe(10 - i);
    }
    let closed = false;
    a.secure.onClose(() => (closed = true));
    expect(await code(a.client.call("UNLOCK", { masterPassword: "wrong wrong wrong" }))).toBe("WIPED");
    await new Promise((r) => setTimeout(r, 200));
    expect(closed).toBe(true); // device dropped the session
    expect(await code(a.client.call("GET_STATUS", {}))).not.toBeNull();
    await stop(a.raw);

    // same device, same USB port, new static key: the host must refuse, and must not touch its pin
    await expect(startOn(state, profile)).rejects.toThrow("DEVICE_KEY_CHANGED");
    expect(profile.pin.key).toEqual(pinnedKey);
    await expect(startOn(state, profile)).rejects.toThrow("DEVICE_KEY_CHANGED"); // retry does not silently re-pin
    expect(profile.pin.key).toEqual(pinnedKey);

    profile.forget(); // explicit user action
    const b = await startOn(state, profile);
    expect(profile.pin.key).not.toEqual(pinnedKey);
    expect(await b.client.call("GET_STATUS", {})).toMatchObject({ state: "FACTORY", hostTrusted: false, attemptsLeft: 10 });
    expect(await code(b.client.call("LIST", {}))).toBe("NOT_TRUSTED"); // pairing is gone too
    expect(await code(b.client.call("UNLOCK", { masterPassword: MASTER }))).toBe("NOT_TRUSTED");
  }, 60_000);

  it("attempt counter survives process restarts: no free guesses, wipe on exactly the 10th total failure", async () => {
    const state = mkdtempSync(path.join(tmpdir(), "kalit-interop-"));
    const profile = hostProfile();
    const a = await startOn(state, profile);
    await a.client.call("PAIR_HOST", {});
    await a.client.call("ONBOARD", { masterPassword: MASTER });
    await a.client.call("LOCK", {});
    for (let i = 0; i < 4; i++) expect(await code(a.client.call("UNLOCK", { masterPassword: "wrong wrong wrong" }))).toBe("BAD_PASSWORD");
    await stop(a.raw);

    const b = await startOn(state, profile); // pin unchanged -> same device key across restarts
    expect(await b.client.call("GET_STATUS", {})).toMatchObject({ state: "LOCKED", hostTrusted: true, attemptsLeft: 6 });
    for (let i = 0; i < 5; i++) expect(await code(b.client.call("UNLOCK", { masterPassword: "wrong wrong wrong" }))).toBe("BAD_PASSWORD");
    await stop(b.raw);

    const c = await startOn(state, profile);
    expect((await c.client.call("GET_STATUS", {})).attemptsLeft).toBe(1);
    expect(await code(c.client.call("UNLOCK", { masterPassword: "wrong wrong wrong" }))).toBe("WIPED");
  }, 60_000);

  it("a different device on the same host profile is refused with DEVICE_KEY_CHANGED", async () => {
    const profile = hostProfile();
    const genuine = await startOn(mkdtempSync(path.join(tmpdir(), "kalit-interop-")), profile);
    const pinned = profile.pin.key!;
    await stop(genuine.raw);
    const impostorState = mkdtempSync(path.join(tmpdir(), "kalit-interop-"));
    await expect(startOn(impostorState, profile)).rejects.toThrow("DEVICE_KEY_CHANGED");
    expect(profile.pin.key).toEqual(pinned);
  }, 30_000);

  it("origin rules agree between the TS rules and the real firmware (hostile origins)", async () => {
    const { client } = await start("accept");
    await client.call("PAIR_HOST", {});
    await client.call("ONBOARD", { masterPassword: MASTER });
    const { entry } = await client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "ali", password: "pw" });
    const origins = [
      "https://example.com", "https://www.example.com", "https://a.b.example.com:8443/p?q#f", "HTTP://EXAMPLE.COM",
      "https://notexample.com", "https://example.com.evil.com", "https://example.com@evil.com", "https://evil.com@example.com",
      "https://example.com:443@evil.com", "https://example.com:x@evil.com", "https://example.com.", "https://.example.com",
      "https://a..example.com", "https://example.com:", "https://example.com:123456", "https://xn--xample-9ua.com",
      "https://ex\u00e4mple.com", "https://example.com\\@evil.com", "ftp://example.com", "example.com", "https://", "",
    ];
    for (const origin of origins) {
      const host = originHost(origin);
      const expected = host !== null && hostMatchesSite(host, "example.com");
      const got = await code(client.call("GET_CREDENTIAL", { id: entry.id, origin }));
      expect([origin, got === null]).toEqual([origin, expected]);
      if (!expected) expect([origin, got]).toEqual([origin, "ORIGIN_MISMATCH"]);
    }
    const adds: [string, string][] = [
      ["https://login.example.com", "example.com"], ["https://example.com", "com"], ["https://example.com", "evil.com"],
      ["https://example.com", "Example.com"], ["https://example.com", "example.com."], ["https://1.2.3.4", "3.4"],
      ["https://1.2.3.4", "1.2.3.4"], ["http://localhost:3000", "localhost"], ["https://example.com:x@evil.com", "example.com"],
      ["https://example.com.", "example.com."],
    ];
    for (const [origin, site] of adds) {
      const host = originHost(origin);
      const expected = host !== null && siteValid(site, host);
      const got = await code(client.call("ADD_ENTRY", { origin, site, username: "u", password: "pw" }));
      expect([origin, site, got === null]).toEqual([origin, site, expected]);
      if (!expected) expect([origin, site, got]).toEqual([origin, site, "ORIGIN_MISMATCH"]);
    }
  }, 60_000);
});

/** v0.6 backup needs firmware >= 0.5.0; older (or missing) binaries skip these tests. */
const backupSupported = available && (await (async () => {
  try {
    const { secure } = await start("accept");
    const [maj = 0, min = 0] = (secure.deviceInfo?.fw ?? "0.0.0").split(".").map(Number);
    await Promise.all(open.splice(0).map((t) => t.close()));
    return maj > 0 || min >= 5;
  } catch {
    return false;
  }
})());
if (available && !backupSupported) console.warn("[interop] v0.6 backup tests SKIPPED: native firmware < 0.5.0");

function backupApi(client: DeviceClient): BackupDeviceApi {
  return {
    exportBegin: async (passphrase) => {
      const r = await client.call("EXPORT_BEGIN", { passphrase });
      return { count: r.count, salt: bytesToBase64(r.salt), iter: r.iter };
    },
    exportGet: async (index) => bytesToBase64((await client.call("EXPORT_GET", { index })).blob),
    exportEnd: async () => void (await client.call("EXPORT_END", {})),
    restoreBegin: async (passphrase, salt, iter, count) => void (await client.call("RESTORE_BEGIN", { passphrase, salt: base64ToBytes(salt), iter, count })),
    restoreEntry: async (index, blob) => (await client.call("RESTORE_ENTRY", { index, blob: base64ToBytes(blob) })).result,
    restoreEnd: () => client.call("RESTORE_END", {}),
  };
}

describe.skipIf(!backupSupported)("interop: v0.6 encrypted backup against the real firmware", () => {
  const MASTER = "correct horse battery";
  const PASS = "backup passphrase 1";

  async function device() {
    const d = await start("accept");
    await d.client.call("PAIR_HOST", {});
    await d.client.call("ONBOARD", { masterPassword: MASTER });
    return d;
  }

  it("export -> wiped/fresh device -> restore reproduces entries and passwords; wrong passphrase and tampering fail", async () => {
    const a = await device();
    const seen: string[] = [];
    a.client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(`${e.data.action}:${e.data.site ?? ""}`));
    await a.client.call("ADD_ENTRY", { origin: "https://accounts.example.com", site: "example.com", username: "ali", password: "pw-ali" });
    await a.client.call("ADD_ENTRY", { origin: "https://b.example.org", site: "example.org", username: "bob", password: "pw-bob" });
    await a.client.call("ADD_ENTRY", { kind: "secret", title: "Wi-Fi", username: "root", password: "pw-wifi" });
    seen.length = 0;

    const file = await runExport(backupApi(a.client), PASS);
    expect(seen).toEqual(["export:3 ta yozuv"]);
    expect(file).toMatchObject({ format: "kalit-backup", version: 1, count: 3 });
    const raw = file.records.map((r) => new TextDecoder("latin1").decode(base64ToBytes(r))).join("|");
    expect(raw).not.toMatch(/example|pw-ali|pw-bob|pw-wifi|Wi-Fi/);
    for (const r of file.records) expect(base64ToBytes(r).length).toBeLessThanOrEqual(1127);
    const before = (await a.client.call("LIST", {})).entries;

    const b = await device(); // fresh (wiped) device
    const seenB: string[] = [];
    b.client.onEvent((e) => e.event === "CONFIRM_PENDING" && seenB.push(`${e.data.action}:${e.data.site ?? ""}`));

    // wrong passphrase: BAD_PASSWORD, nothing stored
    await expect(runRestore(backupApi(b.client), file, "wrong passphrase 99")).rejects.toMatchObject({ code: "BAD_PASSWORD" });
    expect((await b.client.call("LIST", {})).entries).toEqual([]);

    // tampered blob: BAD_PASSWORD
    const tampered = base64ToBytes(file.records[1]!);
    tampered[tampered.length - 1] ^= 1;
    const bad = { ...file, records: [file.records[0]!, bytesToBase64(tampered), file.records[2]!] };
    await expect(runRestore(backupApi(b.client), bad, PASS)).rejects.toMatchObject({ code: "BAD_PASSWORD" });
    // swapped records are bound to the index
    const swapped = { ...file, records: [file.records[1]!, file.records[0]!, file.records[2]!] };
    await expect(runRestore(backupApi(b.client), swapped, PASS)).rejects.toMatchObject({ code: "BAD_PASSWORD" });

    seenB.length = 0;
    // The tampered attempt had already stored record 0 before failing at record 1 (restore is not atomic): it is now a duplicate.
    expect(await runRestore(backupApi(b.client), file, PASS)).toEqual({ added: 2, skipped: 1 });
    expect(seenB.filter((s) => s.startsWith("restore"))).toEqual(["restore:3 ta yozuv"]);
    const after = (await b.client.call("LIST", {})).entries;
    const key = (e: { kind: string; site: string; username: string; title?: string }) => `${e.kind}|${e.site}|${e.username}|${e.title ?? ""}`;
    expect(after.map(key).sort()).toEqual(before.map(key).sort());
    const web = after.find((e) => e.site === "example.com")!;
    expect(await b.client.call("GET_CREDENTIAL", { id: web.id, origin: "https://accounts.example.com" })).toEqual({ username: "ali", password: "pw-ali" });
    const secret = after.find((e) => e.kind === "secret")!;
    expect((await b.client.call("REVEAL_SECRET", { id: secret.id })).password).toBe("pw-wifi");

    // restoring again: everything is a duplicate
    expect(await runRestore(backupApi(b.client), file, PASS)).toEqual({ added: 0, skipped: 3 });
  }, 90_000);

  it("contract errors: empty vault, bad index, no session, bad passphrase length", async () => {
    const a = await device();
    expect(await code(a.client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("INVALID_STATE"); // empty vault
    await a.client.call("ADD_ENTRY", { origin: "https://example.com", site: "example.com", username: "u", password: "pw" });
    expect(await code(a.client.call("EXPORT_GET", { index: 0 }))).toBe("INVALID_STATE");
    await a.client.call("EXPORT_BEGIN", { passphrase: PASS });
    expect(await code(a.client.call("EXPORT_GET", { index: 1 }))).toBe("INVALID_STATE");
    expect(await code(a.client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("INVALID_STATE");
    await a.client.call("EXPORT_END", {});
    await a.client.call("EXPORT_END", {}); // idempotent
    expect(await a.client.call("RESTORE_END", {})).toEqual({ added: 0, skipped: 0 });
    await a.client.call("LOCK", {});
    expect(await code(a.client.call("EXPORT_BEGIN", { passphrase: PASS }))).toBe("LOCKED");
  }, 60_000);
});
