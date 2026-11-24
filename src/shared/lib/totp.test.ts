import { describe, expect, it } from "vitest";
import { computeTotp, decodeBase32, groupTotp, parseTotpInput, TotpInputError } from "./totp";

const ascii = (s: string) => new TextEncoder().encode(s);
const SEED = ascii("12345678901234567890");
// "12345678901234567890" base32
const B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("computeTotp (RFC 6238 SHA1, 6 raqam)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("T=%i -> %s", (t, code) => {
    expect(computeTotp(SEED, t)).toBe(code);
  });
  it("bir qadam ichida bir xil, keyingisida boshqa", () => {
    expect(computeTotp(SEED, 30)).toBe(computeTotp(SEED, 59));
    expect(computeTotp(SEED, 59)).not.toBe(computeTotp(SEED, 60));
  });
});

describe("parseTotpInput: base32", () => {
  it("katta-kichik harf, bo'shliq, tire, padding ixtiyoriy", () => {
    expect(parseTotpInput(B32)).toEqual(SEED);
    expect(parseTotpInput(B32.toLowerCase())).toEqual(SEED);
    expect(parseTotpInput("GEZD GNBV-GY3T QOJQ  GEZD GNBV GY3T QOJQ")).toEqual(SEED);
    expect(parseTotpInput(`${B32}====`)).toEqual(SEED);
    expect(parseTotpInput(`  ${B32}\n`)).toEqual(SEED);
  });
  it("noto'g'ri belgi, bo'sh, juda qisqa/uzun", () => {
    expect(() => parseTotpInput("")).toThrow(TotpInputError);
    expect(() => parseTotpInput("GEZDGNBVGY3TQOJ1")).toThrow(/base32/);
    expect(() => parseTotpInput("GEZDGNBV")).toThrow(/qisqa/); // 5 bayt
    expect(() => parseTotpInput("A".repeat(104))).toThrow(/uzun/); // 65 bayt
  });
  it("chegara: 10 va 64 bayt", () => {
    expect(parseTotpInput("A".repeat(16))).toHaveLength(10);
    expect(parseTotpInput("A".repeat(103))).toHaveLength(64);
  });
  it("decodeBase32 RFC 4648 vektorlari", () => {
    expect(new TextDecoder().decode(decodeBase32("MZXW6YTBOI======"))).toBe("foobar");
    expect(new TextDecoder().decode(decodeBase32("MZXW6YQ"))).toBe("foob");
  });
});

describe("parseTotpInput: otpauth URI", () => {
  const uri = (q: string) => `otpauth://totp/Example:alice@x.com?${q}`;
  it("secret + default parametrlar", () => {
    expect(parseTotpInput(uri(`secret=${B32}&issuer=Example`))).toEqual(SEED);
    expect(parseTotpInput(uri(`secret=${B32}&algorithm=SHA1&digits=6&period=30`))).toEqual(SEED);
    expect(parseTotpInput(uri(`secret=${B32}&algorithm=sha1`))).toEqual(SEED);
  });
  it.each([
    ["algorithm=SHA256"],
    ["algorithm=SHA512"],
    ["digits=8"],
    ["period=60"],
  ])("%s rad etiladi (unsupported)", (extra) => {
    try {
      parseTotpInput(uri(`secret=${B32}&${extra}`));
      throw new Error("must throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TotpInputError);
      expect((e as TotpInputError).reason).toBe("unsupported");
      expect((e as Error).message).toMatch(/SHA1, 6 raqam va 30/);
    }
  });
  it("hotp, secret yo'q, buzuq havola, boshqa sxema", () => {
    expect(() => parseTotpInput(`otpauth://hotp/x?secret=${B32}&counter=1`)).toThrow(TotpInputError);
    expect(() => parseTotpInput(uri("issuer=x"))).toThrow(/secret/);
    expect(() => parseTotpInput("otpauth://")).toThrow(TotpInputError);
    expect((() => { try { parseTotpInput(`steam://${B32}`); } catch (e) { return e as TotpInputError; } })()?.reason).toBe("unsupported");
  });
  it("xato matnida urug' yo'q", () => {
    try {
      parseTotpInput(uri(`secret=${B32}&digits=8`));
    } catch (e) {
      expect((e as Error).message).not.toContain(B32);
    }
  });
});

describe("groupTotp", () => {
  it("123 456", () => expect(groupTotp("123456")).toBe("123 456"));
});
