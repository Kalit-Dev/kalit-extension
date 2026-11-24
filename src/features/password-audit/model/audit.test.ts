import { describe, expect, it } from "vitest";
import { entriesSignature, flagsById } from "./audit";

const report = {
  total: 5,
  duplicates: 3,
  weak: 2,
  items: [
    { id: "a", duplicate: true, weak: false },
    { id: "b", duplicate: true, weak: true },
  ],
};

describe("password audit model", () => {
  it("maps flags by id", () => {
    const m = flagsById(report);
    expect(m.get("a")).toEqual({ duplicate: true, weak: false });
    expect(m.get("b")).toEqual({ duplicate: true, weak: true });
    expect(m.get("c")).toBeUndefined();
    expect(flagsById(null).size).toBe(0);
  });

  it("signature changes when entries are added, removed or re-stamped", () => {
    const base = [{ id: "a", updatedAt: 1 }];
    expect(entriesSignature(base)).toBe(entriesSignature([{ id: "a", updatedAt: 1 }]));
    expect(entriesSignature(base)).not.toBe(entriesSignature([...base, { id: "b", updatedAt: 1 }]));
    expect(entriesSignature(base)).not.toBe(entriesSignature([{ id: "a", updatedAt: 2 }]));
  });
});
