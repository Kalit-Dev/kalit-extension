import { describe, expect, it, vi } from "vitest";
import { DeviceError } from "./client";
import {
  BACKUP_MAX_FILE_BYTES,
  BackupFileError,
  backupFileName,
  base64ToBytes,
  bytesToBase64,
  parseBackupFile,
  runExport,
  runRestore,
  serializeBackup,
  type BackupDeviceApi,
  type BackupFile,
} from "./backup";

const SALT = bytesToBase64(new Uint8Array(16).fill(7));
const good = (): BackupFile => ({
  format: "kalit-backup",
  version: 1,
  kdf: "pbkdf2-hmac-sha256",
  iter: 200_000,
  salt: SALT,
  count: 2,
  records: [bytesToBase64(new Uint8Array(40).fill(1)), bytesToBase64(new Uint8Array(50).fill(2))],
  createdAt: "2026-11-24T10:00:00.000Z",
});
const parse = (o: unknown) => parseBackupFile(JSON.stringify(o));
const msg = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BackupFileError);
    return (e as Error).message;
  }
  throw new Error("expected a BackupFileError");
};

describe("backup file parsing", () => {
  it("round-trips a valid file and names it kalit-backup-YYYY-MM-DD.kalit", () => {
    expect(parseBackupFile(serializeBackup(good()))).toEqual(good());
    expect(backupFileName(new Date("2026-11-24T23:59:00Z"))).toBe("kalit-backup-2026-11-24.kalit");
  });

  it("base64 helpers round-trip all byte values", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64ToBytes(bytesToBase64(all))).toEqual(all);
  });

  it("rejects hostile files with Uzbek errors", () => {
    expect(msg(() => parseBackupFile("not json {"))).toMatch(/zaxira fayli emas/);
    expect(msg(() => parseBackupFile("[1,2]"))).toMatch(/zaxira fayli emas/);
    expect(msg(() => parseBackupFile("null"))).toMatch(/zaxira fayli emas/);
    expect(msg(() => parse({ ...good(), format: "other" }))).toMatch(/zaxira fayli emas/);
    expect(msg(() => parse({ ...good(), version: 2 }))).toMatch(/versiyasi/);
    expect(msg(() => parseBackupFile("x".repeat(BACKUP_MAX_FILE_BYTES + 1)))).toMatch(/katta/);
    const bad: Record<string, unknown>[] = [
      { kdf: "scrypt" },
      { iter: 99_999 },
      { iter: 1_000_001 },
      { iter: 200_000.5 },
      { iter: "200000" },
      { salt: bytesToBase64(new Uint8Array(15)) },
      { salt: bytesToBase64(new Uint8Array(17)) },
      { salt: "!!!!" },
      { count: 3 }, // != records.length
      { count: 0, records: [] },
      { count: 257, records: Array(257).fill(bytesToBase64(new Uint8Array(30))) },
      { records: ["@@@@", bytesToBase64(new Uint8Array(30))] },
      { records: ["abc", bytesToBase64(new Uint8Array(30))] }, // length not multiple of 4
      { records: ["", bytesToBase64(new Uint8Array(30))] },
      { records: [123, "AAAA"] },
      { records: [bytesToBase64(new Uint8Array(4000)), "AAAA"] }, // > 4096 chars
      { createdAt: "yesterday" },
      { createdAt: 5 },
      { extra: "field" },
    ];
    for (const patch of bad) expect(() => parse({ ...good(), ...patch }), JSON.stringify(patch).slice(0, 60)).toThrow(BackupFileError);
    expect(() => parse({ ...good(), createdAt: undefined })).toThrow(BackupFileError);
  });

  it("does not choke on prototype-pollution style keys", () => {
    expect(() => parseBackupFile('{"format":"kalit-backup","version":1,"__proto__":{"x":1}}')).toThrow(BackupFileError);
  });
});

/** In-memory device API double: records the order of calls. */
function fakeApi(over: Partial<BackupDeviceApi> = {}) {
  const calls: string[] = [];
  const api: BackupDeviceApi = {
    exportBegin: async () => (calls.push("begin"), { count: 3, salt: SALT, iter: 200_000 }),
    exportGet: async (i) => (calls.push(`get${i}`), bytesToBase64(new Uint8Array(30).fill(i + 1))),
    exportEnd: async () => void calls.push("end"),
    restoreBegin: async () => void calls.push("rbegin"),
    restoreEntry: async (i) => (calls.push(`entry${i}`), i === 1 ? "duplicate" : "added"),
    restoreEnd: async () => (calls.push("rend"), { added: 2, skipped: 1 }),
    ...over,
  };
  return { api, calls };
}
const PASS = "backup passphrase 1";

describe("runExport", () => {
  it("begins, gets 0..count-1 sequentially, ends, reports progress, builds a valid file", async () => {
    const { api, calls } = fakeApi();
    const progress = vi.fn();
    const file = await runExport(api, PASS, progress);
    expect(calls).toEqual(["begin", "get0", "get1", "get2", "end"]);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { stage: "confirm", done: 0, total: 0 },
      { stage: "transfer", done: 0, total: 3 },
      { stage: "transfer", done: 1, total: 3 },
      { stage: "transfer", done: 2, total: 3 },
      { stage: "transfer", done: 3, total: 3 },
    ]);
    expect(file).toMatchObject({ format: "kalit-backup", version: 1, count: 3, iter: 200_000, salt: SALT });
    expect(parseBackupFile(serializeBackup(file))).toEqual(file);
  });

  it("ends the session in finally when a get fails, and never leaks the passphrase", async () => {
    const { api, calls } = fakeApi({ exportGet: async (i) => { if (i === 1) throw new DeviceError("DISCONNECTED"); return "AAAA"; } });
    const err = await runExport(api, PASS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeviceError);
    expect(`${(err as Error).message}${(err as DeviceError).detail ?? ""}${JSON.stringify(err)}`).not.toContain(PASS);
    expect(calls.at(-1)).toBe("end");
  });

  it("a failing exportEnd does not mask the result; begin failure still calls end", async () => {
    const a = fakeApi({ exportEnd: async () => { throw new DeviceError("DISCONNECTED"); } });
    await expect(runExport(a.api, PASS)).resolves.toMatchObject({ count: 3 });
    const b = fakeApi({ exportBegin: async () => { throw new DeviceError("USER_REJECTED"); } });
    await expect(runExport(b.api, PASS)).rejects.toMatchObject({ code: "USER_REJECTED" });
    expect(b.calls).toEqual(["end"]);
  });

  it("refuses invalid passphrases without touching the device and without echoing them", async () => {
    const { api, calls } = fakeApi();
    const err = await runExport(api, "short").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "INVALID_STATE" });
    expect(calls).toEqual([]);
    await expect(runExport(api, "x".repeat(129))).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects an implausible device count", async () => {
    const { api } = fakeApi({ exportBegin: async () => ({ count: 999, salt: SALT, iter: 200_000 }) });
    await expect(runExport(api, PASS)).rejects.toMatchObject({ code: "PROTOCOL" });
  });
});

describe("runRestore", () => {
  const file = { ...good(), count: 3, records: ["AAAA", "AAAA", "AAAA"] };

  it("begin, entries in order, end; returns the device's RESTORE_END tally", async () => {
    const { api, calls } = fakeApi();
    const progress = vi.fn();
    expect(await runRestore(api, file, PASS, progress)).toEqual({ added: 2, skipped: 1 });
    expect(calls).toEqual(["rbegin", "entry0", "entry1", "entry2", "rend"]);
    expect(progress).toHaveBeenLastCalledWith({ stage: "transfer", done: 3, total: 3 });
  });

  it("stops on BAD_PASSWORD, calls end, and does not send later entries", async () => {
    const { api, calls } = fakeApi({ restoreEntry: async (i) => { if (i === 0) throw new DeviceError("BAD_PASSWORD"); return "added"; } });
    await expect(runRestore(api, file, PASS)).rejects.toMatchObject({ code: "BAD_PASSWORD" });
    expect(calls).toEqual(["rbegin", "rend"]);
  });

  it("falls back to the local tally if RESTORE_END fails after all entries", async () => {
    const { api } = fakeApi({ restoreEnd: async () => { throw new DeviceError("DISCONNECTED"); } });
    expect(await runRestore(api, file, PASS)).toEqual({ added: 2, skipped: 1 });
  });

  it("validates the file and the passphrase before talking to the device", async () => {
    const { api, calls } = fakeApi();
    await expect(runRestore(api, { ...file, count: 2 }, PASS)).rejects.toBeInstanceOf(BackupFileError);
    await expect(runRestore(api, file, "short")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(calls).toEqual([]);
  });
});
