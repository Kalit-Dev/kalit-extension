import { BitwardenFormatError, toImportItems, type ParsedExport, type RawLogin } from "./bitwarden";

/** RFC 4180: tirnoqli maydonlar, "" escape, maydon ichida yangi qator, CRLF/LF, BOM. Ajratgich — vergul yoki nuqtali vergul. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// Sarlavha nomlari (kichik harf): Bitwarden, Chrome/Edge/Brave, Firefox, LastPass, 1Password, Dashlane, KeePass.
const COLS = {
  uri: ["login_uri", "url", "website", "web site", "uri", "origin", "login url", "hostname", "address"],
  username: ["login_username", "username", "user name", "login", "user", "email", "login name", "login_email"],
  password: ["login_password", "password", "pass"],
  name: ["name", "title", "account", "item", "label", "grouping"],
  type: ["type"],
} as const;

const find = (header: string[], names: readonly string[]) => header.findIndex((h) => names.includes(h));

/** Umumiy CSV: kerakli ustunlar sarlavhadan topiladi. Parol yoki manzil ustuni bo'lmasa — BitwardenFormatError. */
export function parseCsvExport(text: string): ParsedExport {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new BitwardenFormatError("CSV bo'sh yoki sarlavhasi yo'q");
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const iUri = find(header, COLS.uri);
  const iPass = find(header, COLS.password);
  if (iUri < 0 || iPass < 0) {
    throw new BitwardenFormatError("CSV'da manzil (url) va parol (password) ustunlari topilmadi");
  }
  const iUser = find(header, COLS.username);
  const iName = find(header, COLS.name);
  const iType = find(header, COLS.type);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const records: RawLogin[] = [];
  for (const r of rows.slice(1)) {
    const type = cell(r, iType).toLowerCase();
    if (type && type !== "login") continue; // Bitwarden CSV: note/card/identity
    // Bitwarden CSV'da bir nechta URI yangi qator bilan ajratilgan
    const uris = cell(r, iUri).split(/\s*[\n\r]+\s*/).filter(Boolean);
    records.push({ name: cell(r, iName), uris, username: cell(r, iUser), password: r[iPass] ?? "" });
  }
  return toImportItems(records);
}
