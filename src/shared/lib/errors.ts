const MESSAGES: Record<string, string> = {
  USER_REJECTED: "Qurilmada rad etildi",
  TIMEOUT: "Vaqt tugadi — qayta urinib ko'ring",
  BUSY: "Qurilma band — oldingi so'rovni yakunlang",
  LOCKED: "Qurilma qulflangan",
  BAD_PASSWORD: "Master parol noto'g'ri",
  WIPED: "Juda ko'p xato urinish — qurilma tozalandi",
  NOT_FOUND: "Yozuv topilmadi",
  ORIGIN_MISMATCH: "Bu yozuv ushbu saytga tegishli emas (yoki u veb-saytga bog'lanmagan sir)",
  RATE_LIMITED: "Juda ko'p so'rov — biroz kuting",
  NOT_TRUSTED: "Bu kompyuter qurilmaga ulanmagan",
  INVALID_STATE: "Qurilma bu amalga tayyor emas",
  DEVICE_KEY_CHANGED: "Qurilma kaliti o'zgargan — boshqa qurilma yoki zavod holati. Ishonsangiz, qurilmani unuting va qayta ulang",
  DISCONNECTED: "Qurilma uzildi",
  PROTOCOL: "Qurilmadan noto'g'ri javob keldi",
  FIRMWARE_OUTDATED: "Qurilma firmware'i eski. Pairing uchun firmware'ni 1.3.0 yoki yangiroq versiyaga yangilang.",
  NO_PORT: "USB qurilmaga ruxsat berilmagan",
  PORT_BUSY: "Port ochilmadi: boshqa dastur band qilgan (serial monitor, pio, boshqa tab) yoki kabelni qayta ulang",
  NO_PANEL: "Kalit paneli yopiq",
  NO_PAGE: "Bu sahifani to'ldirib bo'lmaydi",
  INTERNAL: "Kutilmagan xato",
};

export function errorCode(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "INTERNAL";
}

export function describeError(error: unknown): string {
  const code = errorCode(error);
  const text = MESSAGES[code] ?? MESSAGES.INTERNAL!;
  // Kutilmagan xatoda haqiqiy sabab ko'rsatiladi (aks holda tashxis qo'yib bo'lmaydi).
  const detail = error && typeof error === "object" && "detail" in error ? error.detail : undefined;
  return (code === "INTERNAL" || code === "PORT_BUSY") && typeof detail === "string" && detail ? `${text}: ${detail}` : text;
}

/** Zaxira/tiklash kontekstida BAD_PASSWORD master emas, zaxira parolini bildiradi. */
export function describeBackupError(error: unknown): string {
  switch (errorCode(error)) {
    case "BAD_PASSWORD":
      return "Zaxira paroli noto'g'ri yoki fayl buzilgan";
    case "INVALID_STATE":
      return "Qurilma bu amalga tayyor emas: vault bo'sh, to'lib ketgan, boshqa sessiya ochiq yoki zaxira yozuvi yaroqsiz";
    case "INTERNAL":
      // Eski firmware v0.6 buyruqlarini bilmaydi.
      return "Firmware zaxira buyruqlarini qo'llamaydi — yangilang (0.5.0+)";
    default:
      return describeError(error);
  }
}
