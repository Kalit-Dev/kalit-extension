import { describe, expect, it } from "vitest";
import { formatUpdatedAt, isStalePassword } from "./age";

const NOW = 1_800_000_000;
const DAY = 86_400;

describe("isStalePassword", () => {
  it("is false for unknown (0) updatedAt", () => {
    expect(isStalePassword({ updatedAt: 0 }, NOW)).toBe(false);
  });
  it("is false up to and including 365 days, true after", () => {
    expect(isStalePassword({ updatedAt: NOW - 364 * DAY }, NOW)).toBe(false);
    expect(isStalePassword({ updatedAt: NOW - 365 * DAY }, NOW)).toBe(false);
    expect(isStalePassword({ updatedAt: NOW - 365 * DAY - 1 }, NOW)).toBe(true);
    expect(isStalePassword({ updatedAt: NOW - 800 * DAY }, NOW)).toBe(true);
  });
  it("is false for timestamps in the future (clock skew)", () => {
    expect(isStalePassword({ updatedAt: NOW + 10 * DAY }, NOW)).toBe(false);
  });
});

describe("formatUpdatedAt", () => {
  it("returns noma'lum for 0", () => {
    expect(formatUpdatedAt(0)).toBe("noma'lum");
  });
  it("formats dd.mm.yyyy", () => {
    const d = new Date(2025, 2, 7, 12, 0, 0);
    expect(formatUpdatedAt(Math.floor(d.getTime() / 1000))).toBe("07.03.2025");
  });
});
