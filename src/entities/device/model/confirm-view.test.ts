import { describe, expect, it } from "vitest";
import { confirmView } from "./confirm-view";

const base = { timeoutMs: 10_000, expiresAt: 0 };

describe("confirmView", () => {
  it("hides the overlay when nothing is pending", () => {
    expect(confirmView(null)).toBeNull();
  });
  it("never shows a pair confirmation (the pair flow has its own UI), with or without a code", () => {
    expect(confirmView({ ...base, action: "pair", code: "12" })).toBeNull();
    expect(confirmView({ ...base, action: "pair" })).toBeNull();
  });
  it("shows site/username for other actions and never exposes a device-supplied code", () => {
    const v = confirmView({ ...base, action: "fill", site: "a.com", username: "u", code: "12" });
    expect(v).toEqual({ action: "fill", site: "a.com", username: "u", timeoutMs: 10_000, expiresAt: 0 });
    expect(v).not.toHaveProperty("code");
  });
});
