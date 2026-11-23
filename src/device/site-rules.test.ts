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
