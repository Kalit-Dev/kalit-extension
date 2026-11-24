import { FirmwareError } from "./verify";

/** Foydalanuvchiga ko'rsatiladigan matn. Texnik tafsilot (`detail`) faqat kerakli joylarda qo'shiladi. */
export function describeFirmwareError(e: unknown): string {
  if (!(e instanceof FirmwareError)) return `Kutilmagan xato: ${e instanceof Error ? e.message : String(e)}`;
  const detail = e.message.includes(": ") ? e.message.slice(e.message.indexOf(": ") + 2) : "";
  switch (e.code) {
    case "KEY_NOT_CONFIGURED":
      return "Bu extension versiyasida firmware imzo kaliti sozlanmagan, shuning uchun yangilash o'chirilgan.";
    case "NETWORK":
      return `Release yuklanmadi (internet yoki GitHub'ga kirish yo'q). ${detail}`.trim();
    case "BAD_SIGNATURE":
      return "Release imzosi yaroqsiz. Firmware yozilmadi — bu fayllarga ishonib bo'lmaydi.";
    case "BAD_HASH":
      return `Fayl SHA256 bilan mos emas${detail ? ` (${detail})` : ""}. Firmware yozilmadi.`;
    case "BAD_MANIFEST":
      return `Release tarkibi noto'g'ri${detail ? ` (${detail})` : ""}. Firmware yozilmadi.`;
    case "NO_BOARD":
      return `Bu chip (${detail}) uchun release'da firmware yo'q.`;
    case "DOWNGRADE":
      return "Release qurilmadagi versiyadan eski — eski versiyaga qaytarish rad etildi.";
    case "NO_SERIAL":
      return "Bu brauzer Web Serial'ni qo'llamaydi.";
    case "NO_PORT":
      return "USB qurilma tanlanmadi.";
    case "FLASH_FAILED":
      return `Yozish muvaffaqiyatsiz${detail ? `: ${detail}` : ""}. Kabelni tekshiring, qurilmani qayta ulang va yana urinib ko'ring (BOOT tugmasini bosib turib ulash ham yordam beradi).`;
  }
}
