# Chrome Web Store listing draft

Category: Productivity. Language: Uzbek (add English if desired).

## Name
Kalit — Hardware Password Manager

## Short description (max 132 characters)
Parollaringiz qurilmada qoladi. Har bir kirish — qurilmada tugma bilan tasdiq. (Kalit qurilmasi kerak)

## Long description
Kalit — parollarni brauzerda emas, o'zingizning ESP32 qurilmangizda saqlaydigan parol menejeri. Bu extension qurilma bilan USB orqali ishlaydi.

Imkoniyatlar
• Login formalarni avtomatik topadi va qurilmadagi tugma bilan tasdiqlaganingizdan keyin to'ldiradi.
• Yangi login kiritsangiz, qurilmaga saqlashni taklif qiladi ("Saqlansinmi?"); ayrim saytlarda taklifni o'chirib qo'yish mumkin.
• Parollarni qidirish, qo'shish, tahrirlash va o'chirish uchun to'liq boshqaruv sahifasi.
• Bitwarden (JSON/CSV) dan import.
• Qurilmada shifrlanadigan zaxira nusxa (.kalit fayl) va undan tiklash.
• Ekran qulflansa, qurilma ham qulflanadi.
• Bir nechta kompyuterni ulash (4 tagacha); qurilma kompyuterni tanishi uchun bir martalik tasdiq.

Xavfsizlik va maxfiylik
• Parollar faqat qurilmada saqlanadi; extension ularni diskka yozmaydi.
• Qurilma bilan aloqa Noise_XX shifrlangan kanal orqali.
• Parolni olish, saqlash, o'chirish — har biri qurilmada tugma bilan tasdiqlanadi.
• Serverlar, analitika, kuzatuv yo'q. Hech qanday ma'lumot kompyuteringizdan chiqmaydi.

Talablar: Kalit qurilmasi (ESP32), USB kabel, Chrome 116+. Firmware: github.com/Kalit-Dev/kalit-firmware

## English listing (optional second language)
Name: Kalit — Hardware Password Manager
Short description (max 132): Your passwords stay on your own device. Every sign-in is confirmed with a button press. (Kalit device required)
Long description: Kalit keeps your passwords on an ESP32 hardware device instead of in the browser. The extension talks to it over USB (Web Serial) through an encrypted Noise_XX channel. Autofill, saving, deleting, revealing a secret, import and backup each need a physical button press on the device. Encrypted backups are created on the device. No servers, no analytics, no tracking. Requires a Kalit device, a USB cable and Chrome 116+. Firmware: github.com/Kalit-Dev/kalit-firmware

## Assets (all in docs/store/, sources in docs/store/src/)
- Icon 128x128: public/icons/icon-128.png
- Screenshots 1280x800: screenshot-1-connect.png, -2-confirm, -3-vault, -4-autofill, -5-backup (designed mockups with sample data, not real captures)
- Small promo tile 440x280: promo-small-440x280.png
- Marquee 1400x560 (optional): promo-marquee-1400x560.png
- Still needed: privacy policy URL, support URL
