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
