import { describe, expect, it } from "vitest";
import { Commands, ConfirmInfo, PAIR_CODE_RE, PAIR_VERIFY_TIMEOUT_MS } from "./protocol";

describe("v0.11 pairing verify schema", () => {
  it("PAIR_VERIFY params accept {match:true} and reject {} and {match:'x'}", () => {
    const p = Commands.PAIR_VERIFY.params;
    expect(p.safeParse({ match: true }).success).toBe(true);
    expect(p.safeParse({ match: false }).success).toBe(true);
    expect(p.safeParse({}).success).toBe(false);
    expect(p.safeParse({ match: "x" }).success).toBe(false);
    // tugma bosqichi yo'q: PAIR_VERIFY javobi darhol keladi (oddiy so'rov taymeri)
    expect(Commands.PAIR_VERIFY.confirm).toBe(false);
  });

  it("ConfirmInfo accepts phase 'verify' and rejects other phases", () => {
    const base = { action: "pair", code: "12", timeoutMs: 30000 };
    expect(ConfirmInfo.safeParse({ ...base, phase: "verify" }).success).toBe(true);
    expect(ConfirmInfo.safeParse(base).success).toBe(true);
    expect(ConfirmInfo.safeParse({ ...base, phase: "other" }).success).toBe(false);
  });

  it("constants", () => {
    expect(PAIR_VERIFY_TIMEOUT_MS).toBe(30_000);
    expect(PAIR_CODE_RE.test("07")).toBe(true);
    expect(PAIR_CODE_RE.test("99")).toBe(true);
    expect(PAIR_CODE_RE.test("7")).toBe(false);
    expect(PAIR_CODE_RE.test("123")).toBe(false);
    expect(PAIR_CODE_RE.test("0123")).toBe(false);
  });
});
