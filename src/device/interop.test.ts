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
import { DeviceClient, DeviceError } from "./client";
import { encodeFrame, FrameReader } from "./cobs";
import { generateKeyPair } from "./noise";
import { SecureTransport } from "./secure-transport";
import type { RawTransport } from "./transport";

const here = path.dirname(fileURLToPath(import.meta.url));
const firmwareDir = process.env.KALIT_FIRMWARE_DIR ?? path.resolve(here, "../../../kalit-firmware");
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
    expect(secure.deviceInfo).toEqual({ fw: "0.2.0", name: "Kalit" });

    const status = await client.call("GET_STATUS", {});
    expect(status).toMatchObject({ state: "FACTORY", hostTrusted: false, firmware: "0.2.0" });
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

  it("surfaces CONFIRM_PENDING for the pairing code and honours a rejection on the device", async () => {
    const { client } = await start("reject");
    const seen: string[] = [];
    client.onEvent((e) => e.event === "CONFIRM_PENDING" && seen.push(e.data.action));
    expect(await code(client.call("PAIR_HOST", {}))).toBe("USER_REJECTED");
    expect(seen).toEqual(["pair"]);
    expect((await client.call("GET_STATUS", {})).hostTrusted).toBe(false);
  }, 15_000);
});
