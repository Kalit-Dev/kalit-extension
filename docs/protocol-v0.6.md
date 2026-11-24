# Kalit protocol v0.6 (delta over v0.5)

Firmware >= 0.5.0. Maqsad: shifrlangan zaxira nusxa (EXPORT) va tiklash (RESTORE). Kripto to'liq qurilmada
(PBKDF2-HMAC-SHA256, ChaCha20-Poly1305, AAD = count + index). Extension hech qachon ochiq matn parolni ko'rmaydi: u faqat
shaffof (opaque) blob'larni qurilmadan faylga va fayldan qurilmaga tashiydi. Extension shifrni yechishga urinmaydi.

Barcha buyruqlar ishonchli host talab qiladi; `*_END` dan boshqalari ochiq (unlocked) vault talab qiladi.
Bayt maydonlari CBOR byte string.

## Buyruqlar

| Buyruq | Params | Result | Confirm |
|---|---|---|---|
| `EXPORT_BEGIN` | `{passphrase: string, 10..128 UTF-8 bayt}` | `{count: uint, salt: bytes(16), iter: uint}` | ha (`"export"`, site `"<count> ta yozuv"`) |
| `EXPORT_GET` | `{index: uint}` | `{blob: bytes}` | yo'q |
| `EXPORT_END` | `{}` | `{}` | yo'q (istalgan paytda xavfsiz) |
| `RESTORE_BEGIN` | `{passphrase: string 10..128, salt: bytes(16), iter: uint 100000..1000000, count: uint 1..32}` | `{}` | ha (`"restore"`, site `"<count> ta yozuv"`) |
| `RESTORE_ENTRY` | `{index: uint, blob: bytes}` | `{result: "added" \| "duplicate"}` | yo'q |
| `RESTORE_END` | `{}` | `{added: uint, skipped: uint}` | yo'q |

`ConfirmAction` ga `"export"` va `"restore"` qo'shildi.

Xatolar: `NOT_TRUSTED`, `LOCKED`, `INVALID_STATE` (parol uzunligi, bo'sh vault, faol sessiya, noto'g'ri index, yaroqsiz yozuv,
vault to'la), `USER_REJECTED`, `TIMEOUT`, `BAD_PASSWORD` (`RESTORE_ENTRY`: noto'g'ri parol YOKI buzilgan/almashtirilgan fayl;
sessiyani tugatadi).

## Sessiya

- Tasdiqdan keyin 120 s davom etadi; bitta tasdiq butun sessiya uchun.
- Tugaydi: `*_END`, 120 s, `LOCK`, ulanish yopilishi, wipe, `BAD_PASSWORD`.
- `EXPORT_GET`: sessiya yo'q yoki `index >= count` bo'lsa `INVALID_STATE`.
- Dublikat: web yozuvlar `kind + site + username`, secret (site bo'sh) `kind + username + title` bo'yicha; dublikat `"duplicate"` bo'lib o'tkazib yuboriladi.
- Oxirgi `RESTORE_ENTRY` (qayta ishlangan soni == `count`) sessiyani qurilma o'zi yopadi; keyingi `RESTORE_END` `{added:0, skipped:0}` qaytaradi.
  Extension jami hisobni yozuv natijalaridan (`added`/`duplicate`) o'zi yig'adi, `RESTORE_END` faqat `finally`dagi tozalash.
- Tiklash atomik emas: xato (masalan buzilgan 2-yozuv) oldingi yozuvlarni qaytarmaydi.
- Eksport sessiyasi faol paytda `ADD_ENTRY`/`UPDATE_ENTRY`/`DELETE_ENTRY`/`CHANGE_MASTER` -> `BUSY`.
- Bitta blob <= 1127 bayt.
- `*_BEGIN` tasdiqdan keyin qurilma PBKDF2 hisoblaydi (~1-3 s). Extension timeout'i: confirm 10 s + 30 s KDF.

## Zaxira fayli (extension egasi)

Nomi `kalit-backup-YYYY-MM-DD.kalit`, JSON:

```json
{"format":"kalit-backup","version":1,"kdf":"pbkdf2-hmac-sha256","iter":200000,
 "salt":"<base64, 16 bayt>","count":3,"records":["<base64>","..."],"createdAt":"<ISO>"}
```

Import vaqtida qurilmaga hech narsa yuborilmasdan oldin zod bilan tekshiriladi: `format`/`version`/`kdf`, `iter` 100000..1000000,
`salt` aniq 16 bayt, `count` 1..32 va `records.length` ga teng, har yozuv qat'iy base64 (<= 4096 belgi), fayl <= 256 KB,
noma'lum maydonlar rad etiladi. Faylda sarlavha/sayt/login ochiq matn ko'rinishida yo'q.

## Xavfsizlik va tahdidlar

- Faylning yagona himoyasi zaxira parolining kuchi. Parol tiklanmaydi (master paroldan alohida, qurilmada saqlanmaydi).
- Fayl qo'lga tushsa oflayn brute-force mumkin; uni PBKDF2 `iter` (qurilma: 200 000) cheklaydi, kuchli parol zarur.
  `iter` fayldan o'qiladi: hujumchi uni kamaytirsa ham qurilma 100 000 dan pastini rad etadi, va AEAD tag'i parametrlarni bog'laydi.
- AAD `count+index`: yozuvlarni almashtirish, takrorlash, qirqish yoki sonini o'zgartirish `BAD_PASSWORD` beradi.
- Parol faqat chaqiruv davomida xotirada (engine'ga `chrome.runtime` orqali uzatiladi), hech qayerda saqlanmaydi, log'lanmaydi
  va xato matnlariga tushmaydi. Forma submit'dan keyin tozalanadi.
- Fayl yuklab olinadi (Blob + `<a download>`); uni xavfsiz joyda saqlash foydalanuvchi mas'uliyati.
- Tiklash mavjud yozuvlarni o'chirmaydi va ustiga yozmaydi.
