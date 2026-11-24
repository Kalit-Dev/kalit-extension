# Kalit protocol v0.9 (delta over v0.8)

Firmware: TOTP kiritilgan keyingi release (versiya raqami release vaqtida beriladi; `kFirmware` hali ko'tarilmagan). Maqsad: 2FA kodlarini parol bilan bitta qurilmada saqlash va hisoblash. Seed vault yozuvi ichida
(boshqa maxfiy maydonlar bilan bir xil ChaChaPoly kaliti bilan) shifrlangan holda turadi; kodni qurilma hisoblaydi va faqat
6 raqamli kod qurilmadan chiqadi. Seed qurilmadan hech qachon chiqmaydi (yagona istisno: shifrlangan zaxira bloblari).

## Yozuvga seed biriktirish

Seed login yozuviga (web ham, secret ham) biriktiriladi; alohida yozuv turi yo'q.

| Buyruq | Yangi param | Izoh |
|---|---|---|
| `ADD_ENTRY` | `totp?: bytes` (10..64 bayt) | Uzunlik tasdiqdan OLDIN tekshiriladi, noto'g'ri bo'lsa `INVALID_STATE`. Bo'sh bytes yaroqsiz. IMPORT sessiyasi ichida ham ishlaydi |
| `UPDATE_ENTRY` | `totp?: bytes` | 10..64 bayt = o'rnatish/almashtirish; **bo'sh bytes = o'chirish**. "kamida bitta maydon" qoidasiga `totp` ham kiradi. Tugma tasdig'i avvalgidek |

`EntryMeta` ga `hasTotp: true` qo'shildi (faqat seed bor bo'lsa; `hasNote` kabi). Seed `LIST`da yo'q.

Seed host tomonida base32 (RFC 4648) yoki `otpauth://totp/...?secret=` ko'rinishida beriladi; extension uni xom baytlarga o'giradi.
Qurilma faqat **SHA-1, 6 raqam, 30 s** ni qo'llaydi (servislarning katta qismi). Boshqa parametrli `otpauth://` URI extension'da rad etiladi.

## `GET_TOTP`

| Buyruq | Params | Result | Confirm |
|---|---|---|---|
| `GET_TOTP` | `{id: string, origin?: string, now: uint}` | `{code: string(6 raqam), validFor: uint 1..30, period: 30}` | ha (`"totp"`, OLED sarlavhasi `2FA KODI`) |

- `now` — host vaqti, unix soniya. Extension uni `DeviceClient.call` ichida avtomatik qo'shadi (`Math.floor(Date.now()/1000)`).
- `origin` berilsa va yozuv web bo'lsa, qurilma domenni o'zi tekshiradi (`GET_CREDENTIAL` bilan bir xil qoida), mos kelmasa `ORIGIN_MISMATCH`.
  `origin` berilmasa (manager'da "kodni ko'rsatish") tekshiruv yo'q: baribir tugma tasdig'i kerak. Secret yozuvda `origin` e'tiborsiz.
- Tasdiq ekrani: sarlavha `2FA KODI`, sayt (secret: nom) va `"<login> HH:MMZ"` qatori: **host bergan vaqt UTC'da ko'rinadi**.
  Foydalanuvchi vaqt noto'g'ri bo'lsa uzoq bosib rad etadi.
- Har kod alohida tugma bosishini talab qiladi. Qurilma kodni keshlamaydi.

Xatolar: `NOT_TRUSTED`, `LOCKED`, `NOT_FOUND`, `ORIGIN_MISMATCH`, `INVALID_STATE` (yozuvda seed yo'q; `now` yo'q, mantiqsiz yoki orqaga ketgan),
`USER_REJECTED`, `TIMEOUT`. Eski firmware noma'lum buyruqqa `INTERNAL` qaytaradi.

## Vaqt (RTC yo'q) va tahdid modeli

Qurilmada soat yo'q, shuning uchun vaqtni host beradi. Buzilgan host noto'g'ri vaqt yuborib kelajakdagi kodlarni so'rashi mumkin.
Himoya qatlamlari:

1. **Tugma** har kod uchun; host tugmani bosa olmaydi.
2. **Vaqt ekranda** (`HH:MMZ`): kelajak/o'tmish vaqt foydalanuvchiga ko'rinadi, rad etilsa hech narsa o'zgarmaydi.
3. **Orqaga ketmaydi:** qurilma ko'rgan eng katta *tasdiqlangan* vaqtdan (pog'ona) kichik `now` rad etiladi. Pog'ona RAMda har tasdiqda,
   flash'da (`tfl`) soatiga bir marta yangilanadi (NVS eskirishi). Reboot'dan keyin pog'ona <= 1 soat orqada bo'lishi mumkin.
4. **Mantiqiy pastki chegara:** `now < 1700000000` (2023-11-14) rad etiladi.
5. Rad etilgan yoki vaqt tugagan so'rov pog'onani ko'tarmaydi: soxta kelajak vaqt bilan qurilmani "bloklab" bo'lmaydi.

Qolgan xavf (RTC'siz hal bo'lmaydi): tasdiqlangan kelajak vaqt (masalan, foydalanuvchi ekranga qaramasdan bossa) pog'onani oldinga suradi;
shu pog'onadan keyin haqiqiy vaqt "orqaga" hisoblanib rad etiladi. Davo: factory reset yoki RTC'li apparat. `validFor` host UI uchun,
qurilma tomonida kod faqat shu `now` qadamiga tegishli.

Kod host'ga ochiq matnda yetkaziladi (Noise kanali ichida); buzilgan host tugma bosilgan kodni ko'radi. Bu parol (`GET_CREDENTIAL`) bilan bir xil ishonch chegarasi.
Seed host'ga qaytmaydi: host seedni faqat o'zi yuborgan paytda biladi (foydalanuvchi QR/matn kiritgan paytda).

## Zaxira va import

- Zaxira yozuvi (ochilgan CBOR) ixtiyoriy `"o"` kalitini oladi: seed (bytes, 10..64). Endi 5..7 kalit (`s,u,p,t,k` majburiy; `n` va `o` ixtiyoriy).
  Eng katta ochiq yozuv +68 bayt (`kBackupPlainMax`), blob chegarasi 2224 bayt. Eski zaxiralar (`o`siz) o'zgarishsiz tiklanadi;
  yangi zaxira eski firmware'da tiklanmaydi (yaroqsiz yozuv).
- Zaxira fayli (JSON) formati o'zgarmadi: seed baribir faqat shifrlangan blob ichida.
- Master parol almashtirish seedlarni boshqa maydonlar bilan birga qayta shifrlaydi.
- Bitwarden importi `login.totp` ni o'qiydi (SHA1/6/30 bo'lmaganlari seedsiz import qilinadi va ogohlantiriladi).

## Saqlash formati (firmware ichki)

Yozuv ochiq matni: `... kind | [u16 note_len, note] | [u8 seed_len, seed]`. Eslatma yo'q, lekin seed bor bo'lsa `note_len = 0` yoziladi.
Eski yozuvlar (seedsiz) bit-bit bir xil o'qiladi; seedli yozuvni eski firmware o'qiy olmaydi (downgrade qo'llab-quvvatlanmaydi).
