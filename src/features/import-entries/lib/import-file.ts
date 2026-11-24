import { BitwardenFormatError, parseBitwardenExport, type ParsedExport } from "./bitwarden";
import { parseCsvExport } from "./csv-import";

/** Formatni kengaytma emas, mazmun bo'yicha aniqlaydi: `{` bilan boshlansa Bitwarden JSON, aks holda CSV. */
export function parseImportFile(text: string): ParsedExport {
  const head = text.replace(/^﻿/, "").trimStart();
  if (head.startsWith("{")) return parseBitwardenExport(text);
  if (head.startsWith("[")) throw new BitwardenFormatError("Qo'llab-quvvatlanmaydigan JSON (Bitwarden eksporti emas)");
  return parseCsvExport(text);
}
