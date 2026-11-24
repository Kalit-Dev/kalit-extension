import { describe, expect, it } from "vitest";
import { hostMatchesSite, originHost, siteValid } from "./site-rules";

describe("site rules (qurilma PSL'siz tekshiradi)", () => {
  it("originHost extracts the hostname from an http(s) origin", () => {
    expect(originHost("https://accounts.google.com")).toBe("accounts.google.com");
    expect(originHost("http://localhost:3000")).toBe("localhost");
    expect(originHost("ftp://example.com")).toBeNull();
    expect(originHost("nonsense")).toBeNull();
    expect(originHost("https://evil.com@good.com")).toBeNull(); // userinfo rad etiladi
  });

  it("siteValid needs 2+ labels and the site must be a suffix of the origin host", () => {
    expect(siteValid("google.com", "accounts.google.com")).toBe(true);
    expect(siteValid("google.com", "google.com")).toBe(true);
    expect(siteValid("com", "google.com")).toBe(false); // bitta label
    expect(siteValid("evil.com", "google.com")).toBe(false);
    expect(siteValid("oogle.com", "google.com")).toBe(false); // nuqtasiz suffiks
  });

  it("hostMatchesSite matches the host itself or its subdomains only", () => {
    expect(hostMatchesSite("google.com", "google.com")).toBe(true);
    expect(hostMatchesSite("mail.google.com", "google.com")).toBe(true);
    expect(hostMatchesSite("notgoogle.com", "google.com")).toBe(false);
    expect(hostMatchesSite("google.com.evil.io", "google.com")).toBe(false);
  });
});

/** Firmware mirror: kalit-firmware/test/test_codec (kOriginCases, kMatchCases, kSiteCases). Keep tables in sync. */
const ORIGIN_CASES: [string, string | null][] = [
  ["https://example.com", "example.com"],
  ["HTTPS://EXAMPLE.COM", "example.com"],
  ["http://example.com", "example.com"],
  ["https://example.com:443", "example.com"],
  ["https://example.com:8080/path?q=1#f", "example.com"],
  ["https://example.com/", "example.com"],
  ["https://example.com?x=1", "example.com"],
  ["https://example.com#frag", "example.com"],
  ["https://a.b.example.com", "a.b.example.com"],
  ["http://localhost:3000", "localhost"],
  ["https://1.2.3.4", "1.2.3.4"],
  ["https://xn--pple-43d.com", "xn--pple-43d.com"],
  ["https://example.com@evil.com", null],
  ["https://evil.com@example.com", null],
  ["https://example.com:443@evil.com", null],
  ["https://example.com:x@evil.com", null],
  ["https://example.com:@evil.com", null],
  ["https://user:pw@example.com", null],
  ["https://example.com:80:80", null],
  ["https://example.com:", null],
  ["https://example.com:abc", null],
  ["https://example.com:123456", null],
  ["https://example.com:80evil.com", null],
  ["https://example.com\\@evil.com", null],
  ["https://example.com\\evil.com", null],
  ["https://example.com%2f@evil.com", null],
  ["https://example.com%00.evil.com", null],
  ["https://exa mple.com", null],
  ["https://example.com\t.evil.com", null],
  ["https://example.com\n.evil.com", null],
  ["https://[::1]", null],
  ["https://[::1]:8080", null],
  ["https://example.com.", null],
  ["https://example.com.:443", null],
  ["https://.example.com", null],
  ["https://a..example.com", null],
  ["https://.", null],
  ["https://..", null],
  ["https://\u0430pple.com", null],
  ["https://ex\u00e4mple.com", null],
  ["https://example\u3002com", null],
  ["https://example\uff0ecom", null],
  ["ftp://example.com", null],
  ["file://example.com", null],
  ["javascript://example.com", null],
  ["data:text/html,example.com", null],
  ["chrome-extension://example.com", null],
  ["https:/example.com", null],
  ["https:example.com", null],
  ["//example.com", null],
  ["example.com", null],
  [" https://example.com", null],
  ["xhttps://example.com", null],
  ["https//example.com", null],
  ["", null],
  ["https://", null],
  ["https:///example.com", null],
  ["https://?example.com", null],
  ["https://#example.com", null],
  ["https://:443", null],
  ["https://example.com\n", null],
];

const MATCH_CASES: [host: string, site: string, match: boolean][] = [
  ["example.com", "example.com", true],
  ["www.example.com", "example.com", true],
  ["a.b.c.example.com", "example.com", true],
  ["a.b.example.com", "b.example.com", true],
  ["example.com", "www.example.com", false],
  ["notexample.com", "example.com", false],
  ["example.com.evil.com", "example.com", false],
  ["evil-example.com", "example.com", false],
  ["example.com-evil.com", "example.com", false],
  ["example.co", "example.com", false],
  ["xample.com", "example.com", false],
  ["example.com", "", false],
  ["", "example.com", false],
  ["", "", false],
  ["example.com.", "example.com", false],
  ["example.com", "example.com.", false],
  ["example.com", "Example.com", false],
  ["localhost", "localhost", true],
  ["app.localhost", "localhost", true],
  ["1.2.3.4", "1.2.3.4", true],
  ["1.2.3.4", "2.3.4", false],
  ["1.2.3.4", "3.4", false],
  ["9.9.3.4", "3.4", false],
  ["evil.3.4", "3.4", false],
  ["1.2.3.4", "1.2.3", false],
  ["11.2.3.4", "1.2.3.4", false],
  ["xn--pple-43d.com", "apple.com", false],
  ["apple.com", "xn--pple-43d.com", false],
];

const SITE_CASES: [site: string, host: string, valid: boolean][] = [
  ["example.com", "example.com", true],
  ["example.com", "login.example.com", true],
  ["login.example.com", "login.example.com", true],
  ["com", "example.com", false],
  ["localhost", "localhost", false],
  ["", "example.com", false],
  [".", "example.com", false],
  [".com", "example.com", false],
  ["example.", "example.", false],
  ["example.com.", "example.com.", false],
  ["example..com", "example..com", false],
  ["..", "..", false],
  ["evil.com", "example.com", false],
  ["example.com:8080", "example.com", false],
  ["example.com/path", "example.com", false],
  ["https://example.com", "example.com", false],
  ["user@example.com", "example.com", false],
  ["Example.com", "example.com", false],
  ["EXAMPLE.COM", "example.com", false],
  ["1.2.3.4", "1.2.3.4", true],
  ["3.4", "1.2.3.4", false],
  ["2.3.4", "1.2.3.4", false],
  ["xn--pple-43d.com", "xn--pple-43d.com", true],
  ["apple.com", "xn--pple-43d.com", false],
  ["pple.com", "xn--pple-43d.com", false],
];

describe("site rules: hostile tables (must equal firmware domain.cpp)", () => {
  it.each(ORIGIN_CASES)("originHost(%j) -> %j", (origin, host) => {
    expect(originHost(origin)).toBe(host);
  });
  it.each(MATCH_CASES)("hostMatchesSite(%j, %j) -> %s", (host, site, match) => {
    expect(hostMatchesSite(host, site)).toBe(match);
  });
  it.each(SITE_CASES)("siteValid(%j, %j) -> %s", (site, host, valid) => {
    expect(siteValid(site, host)).toBe(valid);
  });
  it("never lets a trailing newline smuggle a different host past the anchor", () => {
    expect(originHost("https://evil.com\nexample.com")).toBeNull();
  });
});
