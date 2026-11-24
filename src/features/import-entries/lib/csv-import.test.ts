import { describe, expect, it } from "vitest";
import { BitwardenFormatError } from "./bitwarden";
import { parseCsv, parseCsvExport } from "./csv-import";
import { parseImportFile } from "./import-file";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded newlines, CRLF and BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"line1\nline2",z\r\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["line1\nline2", "z"]]);
  });
  it("detects semicolon delimiter", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseCsvExport", () => {
  it("imports Chrome format (name,url,username,password)", () => {
    const csv = "name,url,username,password\nExample,https://accounts.example.com/login,ali,p@ss\n";
    expect(parseCsvExport(csv).items).toEqual([
      { origin: "https://accounts.example.com", site: "example.com", username: "ali", password: "p@ss", title: "Example" },
    ]);
  });

  it("imports Bitwarden CSV, skipping non-login types and keeping the first usable uri", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ',0,login,GH,,,0,"androidapp://x\ngithub.com",bob,"pw,1",',
      ",0,note,secret,text,,0,,,,",
    ].join("\n");
    const { items, skipped } = parseCsvExport(csv);
    expect(skipped).toEqual([]);
    expect(items).toEqual([{ origin: "https://github.com", site: "github.com", username: "bob", password: "pw,1", title: "GH" }]);
  });

  it("imports LastPass-like columns (url,username,password,...,name)", () => {
    const csv = "url,username,password,totp,extra,name,grouping,fav\nhttps://a.com,u,p,,,Site A,,0\n";
    expect(parseCsvExport(csv).items[0]).toMatchObject({ site: "a.com", username: "u", title: "Site A" });
  });

  it("skips rows with a reason and rejects CSV without required columns", () => {
    const csv = "name,url,username,password\nA,,u,p\nB,https://b.com,,p\n";
    const r = parseCsvExport(csv);
    expect(r.skipped.map((s) => s.name)).toEqual(["B"]);
    expect(r.noUrl).toEqual([{ name: "A", username: "u", password: "p" }]);
    expect(() => parseCsvExport("name,username\nx,y")).toThrow(BitwardenFormatError);
    expect(() => parseCsvExport("name")).toThrow(BitwardenFormatError);
  });
});

describe("parseImportFile", () => {
  it("routes JSON and CSV by content", () => {
    const json = JSON.stringify({ encrypted: false, items: [{ type: 1, name: "n", login: { username: "u", password: "p", uris: [{ uri: "https://a.com" }] } }] });
    expect(parseImportFile(json).items).toHaveLength(1);
    expect(parseImportFile("name,url,username,password\nn,https://a.com,u,p").items).toHaveLength(1);
    expect(() => parseImportFile("[1,2]")).toThrow(BitwardenFormatError);
  });
});
