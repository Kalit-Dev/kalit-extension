import { z } from "zod";
import { NOTE_MAX_BYTES } from "@/shared/api/device/protocol";

export const noteBytes = (s: string) => new TextEncoder().encode(s).length;

export const schema = z.object({
  url: z.string().trim(),
  kind: z.enum(["web", "secret"]),
  username: z.string().trim().max(256),
  title: z.string().trim().max(64, "Ko'pi bilan 64 ta belgi"),
  mode: z.enum(["generate", "manual"]),
  password: z.string().max(512),
  note: z.string().refine((s) => noteBytes(s) <= NOTE_MAX_BYTES, `Eslatma ${NOTE_MAX_BYTES} baytdan oshmasin`),
  clearNote: z.boolean(),
  /** v0.9: base32 kalit yoki otpauth:// havola (qurilmaga xom baytlar bo'lib ketadi; formada saqlanmaydi). */
  totp: z.string(),
  clearTotp: z.boolean(),
});
export type Values = z.infer<typeof schema>;
