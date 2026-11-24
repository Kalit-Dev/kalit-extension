import { describe, expect, it } from "vitest";
import { pickByUsername, UsernameMemory, USERNAME_TTL_MS } from "./username-memory";

describe("UsernameMemory", () => {
  it("returns the username for the same tab and site within the TTL", () => {
    const m = new UsernameMemory();
    m.remember(1, "google.com", "  ali@gmail.com ", 1000);
    expect(m.get(1, "google.com", 1000 + USERNAME_TTL_MS)).toBe("ali@gmail.com");
  });

  it("expires after the TTL", () => {
    const m = new UsernameMemory();
    m.remember(1, "google.com", "ali", 0);
    expect(m.get(1, "google.com", USERNAME_TTL_MS + 1)).toBeNull();
    expect(m.get(1, "google.com", 1)).toBeNull(); // gone for good
  });

  it("is keyed by tab and forgets when the registrable domain changes", () => {
    const m = new UsernameMemory();
    m.remember(1, "google.com", "ali", 0);
    expect(m.get(2, "google.com", 1)).toBeNull();
    expect(m.get(1, "evil.com", 1)).toBeNull();
    expect(m.get(1, "google.com", 2)).toBeNull(); // cleared by the cross-domain read
  });

  it("forget() clears and empty usernames are ignored", () => {
    const m = new UsernameMemory();
    m.remember(1, "a.com", "ali", 0);
    m.forget(1);
    expect(m.get(1, "a.com", 1)).toBeNull();
    m.remember(1, "a.com", "   ", 0);
    expect(m.get(1, "a.com", 1)).toBeNull();
  });
});

describe("pickByUsername", () => {
  const entries = [{ username: "ali" }, { username: "Vali@x.com" }];
  it("keeps all without a remembered username or without a match", () => {
    expect(pickByUsername(entries, null)).toHaveLength(2);
    expect(pickByUsername(entries, "zed")).toHaveLength(2);
  });
  it("narrows to the case-insensitive match", () => {
    expect(pickByUsername(entries, "vali@X.com")).toEqual([{ username: "Vali@x.com" }]);
  });
});
