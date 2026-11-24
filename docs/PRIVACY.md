# Kalit — Maxfiylik siyosati

Oxirgi yangilanish: 2026-11-24

Kalit — parollarni ESP32 qurilmasida saqlaydigan brauzer extension'i. Quyida u qanday ma'lumot bilan ishlashi aniq yozilgan.

## Qisqacha

- Kalit **o'zining serveriga ulanmaydi** va hech qanday ma'lumot yubormaydi. Yagona tarmoq so'rovi: siz **"Yangilanishni tekshirish"** tugmasini bosganingizda firmware fayllarini `github.com/Kalit-Dev/kalit-firmware` release'idan yuklab olish (faqat GET; hech qanday ma'lumot, cookie yoki identifikator yuborilmaydi). GitHub bu so'rovni o'z siyosatiga ko'ra (IP manzil) qayd etishi mumkin. Tugma bosilmaguncha tarmoq so'rovi yo'q.
- **Analitika, telemetriya, reklama, kuzatuv yo'q.**
- Hech qanday ma'lumot kompyuteringizdan tashqariga chiqmaydi. Dasturchilar sizning ma'lumotlaringizni ko'rmaydi va ololmaydi.

## Parollar qayerda saqlanadi

Parollar, loginlar va yozuvlar **Kalit qurilmasida** saqlanadi, brauzerda emas. Extension ularni diskka yozmaydi.
Qurilma bilan aloqa USB orqali, Noise_XX shifrlangan kanal bilan o'tadi. Parolni olish, qo'shish, o'zgartirish yoki
o'chirishning har biri qurilmadagi tugma bilan tasdiqlanadi. Ro'yxatda faqat sayt va login (metadata) ko'rsatiladi va u
faqat xotirada (RAM) turadi.

## Extension lokal nimani saqlaydi (`chrome.storage.local`)

Faqat quyidagi to'rt qiymat, faqat shu kompyuterning brauzer profilida:

| Kalit | Nima | Nega |
|---|---|---|
| `hostPriv` | Bu kompyuterning Noise maxfiy kaliti | Qurilma bu kompyuterni tanishi uchun. Kalit parollarni ochmaydi; har bir amal baribir qurilmada tasdiqlanadi |
| `deviceKey` | Ulangan qurilmaning ochiq kaliti | Qurilmani tanib, soxta qurilmadan himoya qilish uchun |
| `neverSave` | "Saqlash taklif qilinmasin" deb belgilangan saytlar ro'yxati | Sizning tanlovingizni eslab qolish |
| `autoConnect` | Avto-ulanish yoqilgan/o'chirilgani | Brauzer qayta ochilganda qurilmaga o'zi ulanish uchun |

Master parol, parollar va yozuvlar `chrome.storage` ga yozilmaydi. Extension'ni olib tashlash bu qiymatlarni o'chiradi.

## Ruxsatlar nima uchun kerak

Batafsil: [PERMISSIONS.md](PERMISSIONS.md). Qisqacha:

- **storage** — yuqoridagi to'rt sozlamani saqlash.
- **idle** — kompyuter ekrani qulflanganda qurilmani ham qulflash.
- **offscreen** — popup yopiq bo'lsa ham USB ulanishini tirik tutish.
- **favicon** — ro'yxatdagi saytlar yonida ularning ikonkasini ko'rsatish (Chrome'ning lokal favicon keshidan).
- **Sayt ruxsatlari (`https://*/*`, `localhost`)** — har qanday sayt login formasini topib, siz tasdiqlaganingizda
  to'ldirish va "Saqlansinmi?" taklifini ko'rsatish uchun. Sahifa ma'lumoti (forma, URL) faqat shu kompyuterda,
  qurilmaga so'rov shakllantirish uchun ishlatiladi va hech qayerga yuborilmaydi.

## Zaxira nusxalar

Zaxira siz so'raganingizda, qurilmada alohida zaxira paroli bilan shifrlanib, sizning kompyuteringizdagi `.kalit` faylga
yoziladi. Faylni qayerda saqlash, kimga berish — to'liq sizning qo'lingizda. Zaxira paroli hech qayerda saqlanmaydi va tiklanmaydi.
Bitwarden importida siz tanlagan fayl faqat brauzerda o'qiladi va qurilmaga yoziladi; hech qayerga yuklanmaydi.

## Uchinchi tomonlar

Hech kimga ma'lumot berilmaydi, sotilmaydi va ulashilmaydi, chunki ma'lumot bizga umuman yetib kelmaydi.

## O'zgarishlar va aloqa

Siyosat o'zgarsa, shu fayl yangilanadi va sana almashadi. Savollar uchun: https://github.com/Kalit-Dev (issue oching).
