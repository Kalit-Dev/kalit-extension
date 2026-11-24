import { describe, expect, it } from "vitest";
import { pairView } from "./pair-view";

const CHOICES = ["11", "22", "33"];

describe("pairView", () => {
  it("is idle when the engine is idle", () => {
    expect(pairView({ pairState: "idle", choices: null, picked: false })).toBe("idle");
  });
  it("is choosing while the engine offers choices", () => {
    expect(pairView({ pairState: "choosing", choices: CHOICES, picked: false })).toBe("choosing");
  });
  it("stays choosing (tiles disabled by the UI) right after a pick until the engine answers", () => {
    expect(pairView({ pairState: "choosing", choices: CHOICES, picked: true })).toBe("choosing");
  });
  it("is idle if 'choosing' arrives without choices (nothing to show)", () => {
    expect(pairView({ pairState: "choosing", choices: null, picked: false })).toBe("idle");
  });
  it("is connecting after a pick once the engine accepted it as the LOCAL code (idle, no warning)", () => {
    expect(pairView({ pairState: "idle", choices: null, picked: true })).toBe("connecting");
  });
  it("is mismatch after a wrong pick or 'none', even while picked", () => {
    expect(pairView({ pairState: "mismatch", choices: null, picked: false })).toBe("mismatch");
    expect(pairView({ pairState: "mismatch", choices: null, picked: true })).toBe("mismatch");
  });
});

describe("pairView engine state priority", () => {
  it("stale choices do not override mismatch", () => {
    expect(pairView({ pairState: "mismatch", choices: CHOICES, picked: false })).toBe("mismatch");
  });
  it("stale choices without an engine 'choosing' state are not shown", () => {
    expect(pairView({ pairState: "idle", choices: CHOICES, picked: false })).toBe("idle");
  });
});
