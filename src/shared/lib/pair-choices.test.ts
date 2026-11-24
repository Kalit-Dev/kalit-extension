import { describe, expect, it } from "vitest";
import { PAIR_CODE_RE } from "@/shared/api/device/protocol";
import { makePairChoices } from "./pair-choices";

describe("makePairChoices", () => {
  it("returns 3 distinct 4-digit codes including real exactly once", () => {
    for (let i = 0; i < 500; i++) {
      const c = makePairChoices("0042");
      expect(c).toHaveLength(3);
      expect(new Set(c).size).toBe(3);
      expect(c.filter((x) => x === "0042")).toHaveLength(1);
      for (const x of c) expect(x).toMatch(PAIR_CODE_RE);
    }
  });

  it("regenerates when a decoy collides with real or with another decoy", () => {
    // 42 -> "0042" (real), 7 -> "0007", 7 again (dup), 42 again (real), 99 -> "0099"; then shuffle values
    const seq = [42, 7, 7, 42, 99, 0, 0, 0, 0];
    let i = 0;
    const random = (n: number) => {
      const a = new Uint32Array(n);
      for (let k = 0; k < n; k++) a[k] = seq[i++ % seq.length]!;
      return a;
    };
    const c = makePairChoices("0042", random);
    expect(new Set(c)).toEqual(new Set(["0042", "0007", "0099"]));
  });

  it("real code position is not constant", () => {
    const idx = new Set<number>();
    for (let i = 0; i < 200; i++) idx.add(makePairChoices("0042").indexOf("0042"));
    expect(idx.size).toBeGreaterThanOrEqual(2);
  });
});
