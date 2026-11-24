import { describe, expect, it } from "vitest";
import { PAIR_CODE_RE } from "@/shared/api/device/protocol";
import { makePairChoices } from "./pair-choices";

/** Berilgan ketma-ketlikni qaytaruvchi deterministik RNG (oxiriga yetsa — aylanadi). */
function seq(values: number[]) {
  let i = 0;
  const calls: number[] = [];
  const random = (n: number) => {
    const a = new Uint32Array(n);
    for (let k = 0; k < n; k++) {
      a[k] = values[i++ % values.length]!;
      calls.push(a[k]!);
    }
    return a;
  };
  return { random, calls };
}

describe("makePairChoices", () => {
  it("returns 3 distinct 2-digit codes including real exactly once", () => {
    for (let i = 0; i < 500; i++) {
      const c = makePairChoices("42");
      expect(c).toHaveLength(3);
      expect(new Set(c).size).toBe(3);
      expect(c.filter((x) => x === "42")).toHaveLength(1);
      for (const x of c) expect(x).toMatch(PAIR_CODE_RE);
    }
  });

  it("keeps leading zeros (real '07', decoys zero-padded)", () => {
    const { random } = seq([3, 5, 0, 0]); // decoys 3 -> "03", 5 -> "05"
    const c = makePairChoices("07", random);
    expect(new Set(c)).toEqual(new Set(["07", "03", "05"]));
    for (const x of makePairChoices("07")) expect(x).toMatch(/^\d{2}$/);
  });

  it("decoys are taken modulo 100", () => {
    const { random } = seq([1_000_042, 1_000_007, 0, 0]); // % 100 -> "42", "07"
    expect(new Set(makePairChoices("99", random))).toEqual(new Set(["99", "42", "07"]));
  });

  it("regenerates when a decoy collides with real or with another decoy", () => {
    // 42 -> "42" (real), 7 -> "07", 7 again (dup), 142 -> "42" (real), 99 -> "99"; then shuffle values
    const { random } = seq([42, 7, 7, 142, 99, 0, 0]);
    expect(new Set(makePairChoices("42", random))).toEqual(new Set(["42", "07", "99"]));
  });

  it("rejection-samples values at or above the largest multiple of 100 below 2^32", () => {
    const LIMIT = 4294967200; // floor(2^32 / 100) * 100
    // LIMIT va 2^32-1 tashlanadi (aks holda % 100 -> "00", "95"); keyin 11, 22
    const { random } = seq([LIMIT, 0xffffffff, 11, 22, 0, 0]);
    expect(new Set(makePairChoices("50", random))).toEqual(new Set(["50", "11", "22"]));
    // LIMIT-1 qabul qilinadi (% 100 = 99)
    const ok = seq([LIMIT - 1, 22, 0, 0]);
    expect(new Set(makePairChoices("50", ok.random))).toEqual(new Set(["50", "99", "22"]));
  });

  it("Fisher–Yates uses an unbiased per-range limit (rejects values >= floor(2^32/n)*n)", () => {
    // decoys: 11, 22. So'ng i=2 (n=3): limit3 = 4294967295 -> 0xffffffff tashlanadi, 4 % 3 = 1;
    // i=1 (n=2): limit2 = 4294967296 -> 0xffffffff qabul (% 2 = 1).
    const { random } = seq([11, 22, 0xffffffff, 4, 0xffffffff]);
    // boshlang'ich ["50","11","22"]; i=2,j=1 -> ["50","22","11"]; i=1,j=1 -> o'zgarmaydi
    expect(makePairChoices("50", random)).toEqual(["50", "22", "11"]);
  });

  it("real code position is not constant", () => {
    const idx = new Set<number>();
    for (let i = 0; i < 200; i++) idx.add(makePairChoices("42").indexOf("42"));
    expect(idx.size).toBe(3);
  });

  it("throws on an invalid real code", () => {
    for (const bad of ["", "7", "123", "0042", "ab", " 7"]) expect(() => makePairChoices(bad)).toThrow("invalid pair code");
  });
});
