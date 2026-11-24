import { describe, expect, it } from "vitest";
import { AddSecretEntryParams, AddWebEntryParams, Commands, ConfirmAction, EntryMeta, UpdateEntryParams } from "./protocol";

const seed = (n: number) => new Uint8Array(n).fill(1);
const web = { origin: "https://example.com", site: "example.com", username: "ali", password: "pw" };

describe("protocol v0.9 TOTP schemas", () => {
  it("EntryMeta.hasTotp is optional boolean", () => {
    const base = { id: "1", site: "a.com", username: "u", updatedAt: 0 };
    expect(EntryMeta.parse(base).hasTotp).toBeUndefined();
    expect(EntryMeta.parse({ ...base, hasTotp: true }).hasTotp).toBe(true);
    expect(EntryMeta.safeParse({ ...base, hasTotp: "yes" }).success).toBe(false);
  });

  it("ADD_ENTRY accepts totp seed of 10..64 bytes (web and secret), rejects others", () => {
    for (const n of [10, 20, 64]) {
      expect(AddWebEntryParams.safeParse({ ...web, totp: seed(n) }).success).toBe(true);
      expect(AddSecretEntryParams.safeParse({ kind: "secret", title: "T", password: "p", totp: seed(n) }).success).toBe(true);
    }
    for (const n of [0, 9, 65]) {
      expect(AddWebEntryParams.safeParse({ ...web, totp: seed(n) }).success).toBe(false);
      expect(AddSecretEntryParams.safeParse({ kind: "secret", title: "T", password: "p", totp: seed(n) }).success).toBe(false);
    }
    expect(AddWebEntryParams.safeParse({ ...web, totp: "JBSWY3DPEHPK3PXP" }).success).toBe(false); // xom baytlar, matn emas
  });

  it("UPDATE_ENTRY: totp counts as a field; empty Bytes removes; 1..9 and 65+ rejected", () => {
    expect(UpdateEntryParams.safeParse({ id: "x" }).success).toBe(false);
    expect(UpdateEntryParams.safeParse({ id: "x", totp: seed(20) }).success).toBe(true);
    expect(UpdateEntryParams.safeParse({ id: "x", totp: new Uint8Array(0) }).success).toBe(true);
    expect(UpdateEntryParams.safeParse({ id: "x", totp: seed(5) }).success).toBe(false);
    expect(UpdateEntryParams.safeParse({ id: "x", totp: seed(65) }).success).toBe(false);
  });

  it("GET_TOTP params/result", () => {
    const { params, result, confirm } = Commands.GET_TOTP;
    expect(confirm).toBe(true);
    expect(params.safeParse({ id: "x", now: 1_700_000_000 }).success).toBe(true);
    expect(params.safeParse({ id: "x", origin: "https://a.com", now: 1 }).success).toBe(true);
    expect(params.safeParse({ now: 1 }).success).toBe(false);
    expect(params.safeParse({ id: "x", now: -1 }).success).toBe(false);
    expect(result.safeParse({ code: "012345", validFor: 30, period: 30 }).success).toBe(true);
    expect(result.safeParse({ code: "012345", validFor: 1, period: 30 }).success).toBe(true);
    for (const bad of [
      { code: "12345", validFor: 5, period: 30 },
      { code: "1234567", validFor: 5, period: 30 },
      { code: "12345a", validFor: 5, period: 30 },
      { code: "123456", validFor: 0, period: 30 },
      { code: "123456", validFor: 31, period: 30 },
    ]) {
      expect(result.safeParse(bad).success).toBe(false);
    }
  });

  it("totp is a confirm action", () => {
    expect(ConfirmAction.safeParse("totp").success).toBe(true);
  });
});
