import { describe, expect, it } from "vitest";
import { AddEntryParams } from "@/shared/api/device/protocol";
import { DEFAULT_GENERATOR, describeGenerator, generatorError, generatorParams, type GeneratorSettings } from "./generator-options";

const g = (patch: Partial<GeneratorSettings>): GeneratorSettings => ({ ...DEFAULT_GENERATOR, ...patch });
const wire = { kind: "secret", title: "T" } as const;

describe("generator options", () => {
  it("default = legacy shape (only generateLength), valid on the wire", () => {
    expect(generatorParams(DEFAULT_GENERATOR)).toEqual({ generateLength: 20 });
    expect(generatorError(DEFAULT_GENERATOR)).toBeNull();
    expect(AddEntryParams.safeParse({ ...wire, ...generatorParams(DEFAULT_GENERATOR) }).success).toBe(true);
  });

  it("no symbols: reduced charset flagged explicitly", () => {
    const s = g({ symbol: false, length: 16 });
    expect(generatorParams(s)).toEqual({ charset: 7, generateLength: 16 });
    expect(AddEntryParams.safeParse({ ...wire, ...generatorParams(s) }).success).toBe(true);
  });

  it("PIN: digits only, length 4..12", () => {
    expect(generatorParams(g({ kind: "pin", pinLength: 6 }))).toEqual({ charset: 4, generateLength: 6 });
    expect(generatorError(g({ kind: "pin", pinLength: 3 }))).not.toBeNull();
    expect(generatorError(g({ kind: "pin", pinLength: 13 }))).not.toBeNull();
    expect(generatorError(g({ kind: "pin", pinLength: 4 }))).toBeNull();
  });

  it("passphrase: words only, 4..10", () => {
    expect(generatorParams(g({ kind: "words", words: 5 }))).toEqual({ words: 5 });
    expect(generatorError(g({ kind: "words", words: 3 }))).not.toBeNull();
    expect(generatorError(g({ kind: "words", words: 10 }))).toBeNull();
    expect(AddEntryParams.safeParse({ ...wire, ...generatorParams(g({ kind: "words", words: 5 })) }).success).toBe(true);
  });

  it("chars: needs a class; full set needs >= 12, reduced >= 4; max 64", () => {
    expect(generatorError(g({ lower: false, upper: false, digit: false, symbol: false }))).not.toBeNull();
    expect(generatorError(g({ length: 11 }))).not.toBeNull();
    expect(generatorError(g({ length: 11, symbol: false }))).toBeNull();
    expect(generatorError(g({ length: 4, symbol: false }))).toBeNull();
    expect(generatorError(g({ length: 3, symbol: false }))).not.toBeNull();
    expect(generatorError(g({ length: 65 }))).not.toBeNull();
  });

  it("everything the UI accepts is accepted by the wire schema", () => {
    for (const kind of ["chars", "pin", "words"] as const)
      for (const lower of [true, false])
        for (const symbol of [true, false])
          for (const length of [4, 11, 12, 20, 64]) {
            const s = g({ kind, lower, symbol, length, pinLength: Math.min(length, 12), words: 6 });
            if (generatorError(s)) continue;
            expect(AddEntryParams.safeParse({ ...wire, ...generatorParams(s) }).success, JSON.stringify(s)).toBe(true);
          }
  });

  it("describes the choice", () => {
    expect(describeGenerator(DEFAULT_GENERATOR)).toBe("20 belgi");
    expect(describeGenerator(g({ kind: "pin" }))).toBe("6 xonali PIN");
    expect(describeGenerator(g({ kind: "words" }))).toBe("6 ta so'z (passphrase)");
  });
});
