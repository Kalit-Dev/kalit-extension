# Kalit protocol v0.10 (delta over v0.9)

Maqsad: parol sog'lig'i auditi (qurilma ichida) va sozlanadigan parol generatori. Ikkala tomonda: firmware
(`vault.cpp`, `generator.cpp`, `strength.cpp`, `device.cpp`) va `MockTransport` bir xil qoidalarni qo'llaydi.
Eski host/firmware kombinatsiyalari ishlaydi: yangi maydonlar ixtiyoriy, `generateLength` yo'li o'zgarmagan.

## AUDIT_PASSWORDS

| Buyruq | Params | Result | Confirm |
|---|---|---|---|
| `AUDIT_PASSWORDS` | `{cursor?: uint}` | `{total, duplicates, weak: uint, items: [{id, duplicate: bool, weak: bool}], next?: uint}` | yo'q |

Ochiq (unlocked) vault va ishonchli host talab qiladi (`LOCKED`, `NOT_TRUSTED`). `LIST` kabi tasdiqsiz.

- Qurilma barcha yozuvlarni (web va secret) o'zi shifrdan yechadi. **Ochiq parol ham, xesh ham hostga chiqmaydi**: faqat
  sonlar va yozuv `id` bayroqlari.
- **Takror** = parollar bir xil. Solishtirish har chaqiruv uchun tasodifiy kalitli HMAC-SHA256 (8 bayt) bo'yicha; kalit va
  xeshlar chaqiruvdan keyin nollanadi, flash'ga yozilmaydi.
- **Zaif** = `strength.cpp` baholagichi < 60 bit: sinflar hovuzi (a-z 26, A-Z 26, 0-9 10, belgi 33, ASCII'dan tashqari 64) x
  "samarali uzunlik". Arifmetik ketma-ketlik (`aaa`, `123`, `cba`) 3-belgidan hisobga olinmaydi; samarali uzunlik <= 3 x noyob
  belgilar; tipik parollar (`password`, `qwerty`, `12345...`, `parol...`) = 0 bit.
- `total/duplicates/weak` — butun vault bo'yicha (har sahifada bir xil). `duplicates` = takroriy guruhlardagi yozuvlar soni
  (3 yozuv bir xil parolda = 3). `items` faqat bayroqlangan yozuvlar.
- Sahifalash: javobda <= 64 ta `item`; `next` bor bo'lsa uni `cursor` qilib yuboring (`DeviceClient.auditAll`). Har sahifa
  hisobni qayta bajaradi (vault 256 yozuvgacha). Sahifalar orasida vault o'zgarsa, natija taxminiy.
- Xatolar: `LOCKED`, `NOT_TRUSTED`, `INTERNAL` (yozuv o'qilmadi: to'liq bo'lmagan natija "toza" deb qaytarilmaydi).

### Cheklovlar (ataylab)

- Baholagich lug'at bilmaydi: `correcthorsebattery` kabi so'z kombinatsiyalarini ortiqcha baholaydi (xavfsiz tomonga emas).
  Diceware passphrase'lar noto'g'ri "zaif" bo'lmaydi.
- Generatordan chiqqan PIN (4-12 raqam) har doim "zaif" bo'ladi: bu to'g'ri baho. UI buni ogohlantiradi.
- Audit tasdiq so'ramaydi: ishonchli host, qaysi yozuvlar bir xil parolga ega ekanini bilib oladi (parolning o'zini emas).

## ADD_ENTRY: generator parametrlari

Yangi ixtiyoriy maydonlar (web va secret uchun). `password` berilsa generator e'tiborsiz.

| Maydon | Tur | Ma'no |
|---|---|---|
| `charset` | uint 1..15 | bayroqlar: 1 = a-z, 2 = A-Z, 4 = 0-9, 8 = `!@#$%^&*-_=+`. Yo'q = 15 (hammasi) |
| `generateLength` | uint | belgilar soni; yo'q = 20 |
| `words` | uint 4..10 | diceware passphrase: EFF large ro'yxatidan N ta so'z, `-` bilan ajratilgan |

Qoidalar (qurilma tasdiqdan **oldin** tekshiradi, buzilsa `INVALID_STATE`):

- `charset == 15`: `generateLength` 12..64 (eski qoida). Boshqa to'plamlar (PIN, simvolsiz...): 4..64.
- `words` bilan `charset`/`generateLength` birga kelmaydi.
- `charset` = 0 yoki 15 dan katta bit = `INVALID_STATE`.
- Secret yozuvda parol, `generateLength`, `charset` yoki `words` dan biri majburiy (host sxemasi).

Generator:

- Faqat HW RNG, modulo bias'siz (rejection sampling).
- Aralash to'plamlarda o'xshash belgilar (`0 O 1 l I`) chiqarilmaydi. Yagona raqam sinfi (`charset = 4`, PIN) = `0123456789`.
- Bir necha sinf tanlangan bo'lsa, har sinfdan kamida bitta belgi kafolatlanadi (o'rinlar tasodifiy).
- Passphrase: `kWordlist` (7776 so'z, ~12.92 bit/so'z, 80 KB flash). 6 so'z ≈ 77 bit.

## Fayllar

- `kalit-firmware/scripts/gen_wordlist.py` — EFF ro'yxatidan `wordlist.cpp` (firmware) va `wordlist.ts` (faqat mock) yaratadi.
  Ro'yxat: EFF Large Wordlist, © Electronic Frontier Foundation, CC BY 3.0 US (https://www.eff.org/dice).
