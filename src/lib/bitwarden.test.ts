import { describe, expect, it } from "vitest";
import { BitwardenFormatError, parseBitwardenExport } from "./bitwarden";

const login = (over: Record<string, unknown> = {}) => ({
  type: 1,
  name: "Example",
  login: { username: "ali", password: "p@ss", uris: [{ uri: "https://accounts.example.com/login" }] },
  ...over,
});
const doc = (items: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ encrypted: false, items, ...extra });

describe("parseBitwardenExport", () => {
  it("maps a login to site, origin, username, password and title", () => {
    const { items, skipped } = parseBitwardenExport(doc([login()]));
    expect(skipped).toEqual([]);
    expect(items).toEqual([
      { origin: "https://accounts.example.com", site: "example.com", username: "ali", password: "p@ss", title: "Example" },
    ]);
  });

  it("accepts a bare domain and uses the first usable uri", () => {
    const l = login({ login: { username: "u", password: "p", uris: [{ uri: "androidapp://x" }, { uri: "github.com" }] } });
    expect(parseBitwardenExport(doc([l])).items[0]).toMatchObject({ origin: "https://github.com", site: "github.com" });
  });

  it("ignores non-login items and skips unusable ones with a reason", () => {
    const { items, skipped } = parseBitwardenExport(
      doc([
        { type: 2, name: "note" },
        login({ name: "no-uri", login: { username: "u", password: "p", uris: [] } }),
        login({ name: "no-user", login: { username: "", password: "p", uris: [{ uri: "https://a.com" }] } }),
        login({ name: "no-pass", login: { username: "u", password: "", uris: [{ uri: "https://a.com" }] } }),
      ]),
    );
    expect(items).toHaveLength(0);
    expect(skipped.map((s) => s.name)).toEqual(["no-uri", "no-user", "no-pass"]);
  });

  it("drops duplicates of the same site and username", () => {
    const { items, skipped } = parseBitwardenExport(doc([login(), login({ name: "again" })]));
    expect(items).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/Takror/);
  });

  it("truncates the title to the firmware metadata budget (bytes)", () => {
    const { items } = parseBitwardenExport(doc([login({ name: "я".repeat(80) })]));
    const t = items[0]!.title!;
    expect(new TextEncoder().encode(t).length).toBeLessThanOrEqual(64);
    expect(new TextEncoder().encode(items[0]!.site + items[0]!.username + t).length).toBeLessThanOrEqual(160);
  });

  it("rejects encrypted exports and non-bitwarden JSON", () => {
    expect(() => parseBitwardenExport(doc([], { encrypted: true }))).toThrow(BitwardenFormatError);
    expect(() => parseBitwardenExport("{}")).toThrow(BitwardenFormatError);
    expect(() => parseBitwardenExport("nope")).toThrow(BitwardenFormatError);
  });
});
