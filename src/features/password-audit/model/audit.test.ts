import { describe, expect, it } from "vitest";
import { auditSummary, entriesSignature, flagsById } from "./audit";

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
  it("summarises like the spec: counts only", () => {
    expect(auditSummary(report)).toBe("3 ta takroriy · 2 ta zaif");
    expect(auditSummary({ ...report, duplicates: 0 })).toBe("2 ta zaif");
    expect(auditSummary({ ...report, weak: 0 })).toBe("3 ta takroriy");
    expect(auditSummary({ total: 4, duplicates: 0, weak: 0, items: [] })).toBeNull();
  });

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
