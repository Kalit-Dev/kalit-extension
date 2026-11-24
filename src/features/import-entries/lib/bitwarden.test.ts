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
    expect(skipped.map((s) => s.name)).toEqual(["no-user", "no-pass"]);
  });

  it("returns url-less records as noUrl, guessing the url only from domain-like names", () => {
    const nu = (name: string, o: Record<string, unknown> = {}) =>
      login({ name, login: { username: "u", password: "p", uris: [], ...o } });
    const { items, noUrl, skipped } = parseBitwardenExport(
      doc([nu("github.com"), nu("www.npmjs.com"), nu("GitHub"), nu("Wi-Fi uy"), nu("wifi", { username: "" }), nu("empty", { password: "" })]),
    );
    expect(items).toHaveLength(0);
    expect(skipped).toEqual([{ name: "empty", reason: "Parol bo'sh" }]);
    expect(noUrl).toEqual([
      { name: "github.com", username: "u", password: "p", guessedUrl: "https://github.com" },
      { name: "www.npmjs.com", username: "u", password: "p", guessedUrl: "https://www.npmjs.com" },
      { name: "GitHub", username: "u", password: "p" },
      { name: "Wi-Fi uy", username: "u", password: "p" },
      { name: "wifi", username: "", password: "p" },
    ]);
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

describe("parseBitwardenExport: login.totp", () => {
  const B32 = "JBSWY3DPEHPK3PXP";
  const withTotp = (totp: string, name = "Example", user = "ali") =>
    login({ name, login: { username: user, password: "p", uris: [{ uri: "https://example.com" }], totp } });

  it("maps base32 and otpauth totp to a base64 seed", () => {
    const a = parseBitwardenExport(doc([withTotp(B32)]));
    const b = parseBitwardenExport(doc([withTotp(`otpauth://totp/Example:ali?secret=${B32}&issuer=Example&digits=6&period=30`)]));
    expect(a.items[0]!.totp).toBe("SGVsbG8h3q2+7w=="); // base32 JBSWY3DPEHPK3PXP = "Hello!\xde\xad\xbe\xef"
    expect(b.items[0]!.totp).toBe(a.items[0]!.totp);
    expect(a.totpDropped).toBeUndefined();
  });

  it("imports unsupported totp (SHA256 / 8 digits / 60 s / steam / garbage) without it and counts them", () => {
    const r = parseBitwardenExport(
      doc([
        withTotp(`otpauth://totp/x?secret=${B32}&algorithm=SHA256`, "a", "u1"),
        withTotp(`otpauth://totp/x?secret=${B32}&digits=8`, "b", "u2"),
        withTotp(`otpauth://totp/x?secret=${B32}&period=60`, "c", "u3"),
        withTotp(`steam://${B32}`, "d", "u4"),
        withTotp("!!!", "e", "u5"),
        withTotp(B32, "ok", "u6"),
      ]),
    );
    expect(r.items).toHaveLength(6);
    expect(r.items.filter((i) => i.totp)).toHaveLength(1);
    expect(r.totpDropped).toBe(5);
  });
});
