# Kalit v0.2 — Secure channel (Noise_XX + CBOR) va kalit-firmware

Sana: 2026-11-23 · Holat: tasdiq kutilmoqda

## Maqsad va sabab

Hozir extension va qurilma USB orqali **ochiq JSON** almashadi: parollar va master parol kabeldan ochiq o'tadi, host faqat `hostId` (UUID) bilan aniqlanadi (soxtalash oson). Maqsad:

1. Extension ↔ qurilma o'rtasida shifrlangan, o'zaro autentifikatsiyalangan kanal (Noise_XX), xabarlar CBOR'da.
2. Haqiqiy firmware yozish (hozir yo'q): `kalit-firmware`, PlatformIO, avval klassik **ESP32 DevKit**, keyin **ESP32-S3** ga moslanadi.
3. Ikkala tomon bir-biri bilan **haqiqatan gaplashishi** isbotlanishi (qurilmasiz ham, avtomatik interop testi bilan).

## Goals / Non-goals / Anti-goals

Goals
- Noise_XX_25519_ChaChaPoly_SHA256 handshake, so'ng har xabar AEAD bilan shifrlangan.
- Host identifikatsiyasi = Noise static public key (`hostId` yo'qoladi). Qurilma host kalitini pin qiladi, host qurilma kalitini pin qiladi.
- Hozirgi buyruq to'plami (`GET_STATUS`, `PAIR_HOST`, `ONBOARD`, `UNLOCK`, `LOCK`, `LIST`, `GET_CREDENTIAL`, `ADD_ENTRY`, `DELETE_ENTRY`) va hodisalar (`CONFIRM_PENDING`, `CONFIRM_DONE`, `LOCKED`) **mazmunan o'zgarmaydi**; zod sxemalari saqlanadi.
- Firmware mock bilan bir xil xulq: PIN urinishlari (10, tekshiruvdan OLDIN kamayadi), wipe, 10 s tasdiq, 500 ms guard, qurilma domenni o'zi tekshiradi.
- Mantiq (Noise, COBS, CBOR, vault) apparatsiz `pio test -e native` da testlanadi.

Non-goals (bu bosqichda yo'q)
- ESP32-S3 port, native USB CDC, BLE, ekran/OLED, secure boot / flash encryption (S3 bosqichida).
- Parol o'zgarganini aniqlash, multi-step login (README v0.2 ro'yxatining boshqa bandlari).
- Eski ochiq JSON protokolga orqaga moslik (PoC edi; olib tashlanadi).

Anti-goals (texnik jihatdan ishlasa ham muvaffaqiyatsizlik)
- Master parol yoki parol ochiq matnda kabeldan o'tishi.
- Tasdiq tugmasisiz parol chiqishi.
- Firmware flash'ida master parol yoki ochiq parollar saqlanishi.

## Cheklovlar va topilmalar

- **USB VID:** `SerialTransport` faqat Espressif VID (`0x303a`, S3 native USB) bo'yicha filtrlaydi. Klassik DevKit'da USB-UART ko'prigi bor (CP210x `0x10C4`, CH340 `0x1A86`) — ular hozir **ko'rinmaydi**. Filtr kengaytiriladi.
- **DTR/RTS reset:** DevKit'da port ochilganda auto-reset bo'lishi mumkin; extension ochilgandan keyin qisqa kutadi va handshake'ni qayta urinadi.
- **Log aralashishi:** ESP log'lari shu portdan chiqadi. Framing log'dan chidamli bo'lishi shart → COBS (`0x00` ajratgich; ASCII log'da `0x00` yo'q).
- **Host maxfiy kaliti** `chrome.storage.local` da turadi (diskda). Qabul qilingan kelishuv: har parol harakati baribir qurilma tugmasi bilan tasdiqlanadi. Keyingi bosqich: non-extractable WebCrypto kalit.
- DevKit'da tugma/ekran yo'q: tasdiq = BOOT tugmasi (GPIO0), qisqa bosish = qabul, uzoq = rad (mock `press("short"|"long")` bilan bir xil). Pairing kodi hozircha faqat UI'da ko'rinadi; ekranli S3 qurilmada qurilmada ham ko'rsatiladi.

## Yondashuvlar

A. **`SecureTransport` dekorator** (tanlandi): `Transport`'ni o'raydi; `DeviceClient`/`protocol.ts`/UI deyarli o'zgarmaydi. Shifrlash bir joyda.
B. `DeviceClient` ichiga shifrlashni qo'yish: tezroq, lekin client va kripto aralashadi, mock'ni testlash qiyin.
C. Tayyor kutubxona (`noise-handshake` va sh.k.): kamroq kod, lekin eskirgan/qo'llab-quvvatlanmaydi, firmware tomonida baribir o'zimiz yozamiz.

Kripto: `@noble/*` + o'zimiz yozgan kichik Noise XX (~150 qator), rasmiy Noise test vektorlari bilan tekshiriladi. Firmware: **mbedtls** (ESP32 Arduino/IDF ichida bor; X25519, ChaChaPoly, SHA-256, HW RNG) + shu mantiqning C++ nusxasi. Platforma: **PlatformIO + Arduino framework** (minimal; S3 ga o'tish `platformio.ini` env qo'shish bilan). CBOR: `cborg` (TS), firmware'da TinyCBOR yoki mavjud bo'lmasa kichik subset kodek (reja bosqichida tekshiriladi).

## Dizayn

### Protokol (`docs/protocol-v0.2.md` — yagona manba, extension repo'da)

- **Kadr:** COBS(payload) + `0x00`. Maks. kadr 1 KiB. Noise bosqichlaridan oldingi/keyingi hamma narsa shu kadrda.
- **Handshake:** Noise_XX_25519_ChaChaPoly_SHA256, prologue = `"kalit/0.2"`. msg1: `e`; msg2: `e, ee, s, es` + payload; msg3: `s, se` + payload (host nomi, CBOR). Handshake tugagach ikki tomon `Split()` → ikkita CipherState (har yo'nalish uchun alohida, 64-bit nonce hisoblagich).
- **Transport:** har kadr = `ChaChaPoly(CBOR(xabar))`. Nonce takrorlanmaydi; autentifikatsiya xatosi → kanal yopiladi.
- **Xabarlar** (CBOR map): so'rov `{i, c, p}`, javob `{i, ok, r | e}`, hodisa `{ev, d?}`. Kalitlar qisqartirilgan, semantika `protocol.ts` bilan bir xil.
- **Trust:** msg3'dan keyin qurilma host static key'ni biladi. Noma'lum kalit → faqat `GET_STATUS` va `PAIR_HOST` ruxsat; qolganlari `NOT_TRUSTED`. `PAIR_HOST` tugma bilan tasdiqlanadi va kalit NVS'ga yoziladi. Host qurilma static key'ini birinchi ulanishda saqlaydi; keyin boshqa kalit chiqsa `DEVICE_KEY_CHANGED` ogohlantirishi, ulanish bloklanadi (foydalanuvchi qo'lda "unut" qilmaguncha).
- **hostId** `GET_STATUS` parametridan olib tashlanadi.

### Extension (`src/device/`)

- Yangi: `cobs.ts`, `noise.ts` (XX holat mashinasi), `secure-transport.ts`, `cbor.ts` (yupqa o'ram), `keys.ts` (host static key + pin qilingan qurilma kalitlari `chrome.storage.local`'da).
- `serial-transport.ts`: baytli kadrlar (COBS), VID filtri kengaytirilgan, port ochilgach qisqa kutish.
- `transport.ts` interfeysi bayt kadrlarini tashiydi; `DeviceClient` SecureTransport ustida ishlaydi.
- `mock-transport.ts` Noise **responder** sifatida qayta yoziladi: bir xil kod yo'li.
- `lib/storage.ts`: `getHostId` → `getHostKeypair`.
- Test: `vitest` (dev dep). Noise test vektorlari, COBS, CBOR round-trip, mock bilan to'liq oqim.

### Firmware (`/Users/anonym/Projects/kalit-firmware`, alohida git repo)

```
platformio.ini            envs: esp32dev (Arduino), native (Unity), esp32s3 (keyin, izohda)
src/main.cpp              HAL'ni yig'adi, event loop
lib/kalit_core/           HAL'ga bog'liq bo'lmagan mantiq (native'da testlanadi):
  cobs, noise_xx, cbor, protocol (buyruq dispatcher), vault, confirm (10 s/500 ms), domain
lib/kalit_hal/            interfeyslar: Link, Rng, Store, Button, Clock, Led
lib/kalit_esp32/          ESP32 amalga: UART link, esp_fill_random, NVS, BOOT tugma, LED
lib/kalit_native/         native amalga: stdin/stdout link, fayl Store (interop uchun)
test/                     Unity: COBS, Noise vektorlar, vault, wipe, dispatcher
```

- **Vault:** master parol → PBKDF2-HMAC-SHA256 (tuz NVS'da, iteratsiyalar sozlanadi) → kalit; yozuvlar ChaChaPoly bilan shifrlanib NVS'ga. Ochiq parol faqat RAM'da, `LOCK`da nollanadi.
- **Urinishlar hisoblagichi** tekshiruvdan oldin kamayadi va NVS'ga yoziladi (power-cut hujumiga qarshi); 10 dan keyin wipe.
- **Parol generatsiya:** `esp_fill_random` (HW RNG), modulo-bias'siz, mock bilan bir xil alifbo.
- **Domen tekshiruvi** qurilmada (`ORIGIN_MISMATCH`), mock bilan bir xil mantiq.
- **Tasdiq:** LED miltillaydi, BOOT qisqa = qabul, uzoq = rad, 10 s timeout, 500 ms guard.

### Interop testi (qurilmasiz isbot)

Firmware `native` env stdin/stdout orqali COBS kadrlarini gaplashadi. Extension'dagi vitest shu binarni child process sifatida ishga tushirib, haqiqiy Noise handshake + buyruqlar oqimini (pair → onboard → add → fill) o'tkazadi. Shu bilan TS va C++ nusxalari bir-biriga mos ekani avtomatik tekshiriladi.

## Nima tekshiriladi va nima tekshirilmaydi

- Tekshiriladi: `tsc`, `vitest`, `pio test -e native`, interop testi, `pio run -e esp32dev` (kompilyatsiya).
- **Tekshirilmaydi:** haqiqiy ESP32 DevKit'da ishlashi (men flash qila olmayman). Birinchi flash'dan keyin birga sinaymiz.
- Production uchun hali yetarli emas: flash encryption, secure boot, side-channel himoyasi yo'q (S3 bosqichi).

## Qo'shimcha qarorlar (builder tekshiruvidan keyin; muallifning chaqiruvlari)

- **Pairing kodi** = Noise handshake hash `h` dan hosil qilingan 4 xonali SAS (`SHA-256(h || "kalit/pair")` ning dastlabki baytlaridan mod 10⁴). Ikkala tomon bir xil hisoblaydi; MITM bo'lsa kodlar farq qiladi. UI'da ko'rsatiladi; DevKit'da ekran yo'q, shuning uchun qurilma uni serial log'ga `PAIR CODE ####` deb yozadi (dev solishtirishi uchun). Ekranli qurilmada displeyda ko'rsatiladi. DevKit bosqichida bu himoya **to'liq emas** (tugma bosish kodni tekshirishni majburlamaydi) — S3 bosqichida displey bilan to'liq bo'ladi.
- **Handshake payload'lari** (CBOR): msg2 `{v:1, fw, name}` (qurilma, shifrlangan, `es` dan keyin); msg3 `{v:1, name}` (host nomi). `v` mos kelmasa kanal yopiladi (`PROTOCOL`).
- **Trust hayot sikli:** qurilma ko'pi bilan 4 ta host pin qiladi (to'lsa `PAIR_HOST` `INVALID_STATE`). Qurilma static key'i birinchi yuklashda generatsiya qilinib NVS'da turadi. **Wipe = zavod holati:** vault, pin qilingan hostlar va qurilma kaliti o'chadi, yangi kalit yaratiladi; hostlar `DEVICE_KEY_CHANGED` ko'radi va "qurilmani unut" qilib qayta pair qiladi (bu to'g'ri xavfsizlik xulqi).
- **O'lcham:** maks. kadr 8 KiB (COBS dekodlangan). Vault ko'pi bilan 32 yozuv, `site`/`username` ≤256, `title` ≤64, shuning uchun `LIST` javobi kadrga sig'adi; sahifalash yo'q (PoC cheklovi, hujjatda yoziladi).
- **Kripto bir xilligi:** mbedtls **ikkala** muhitda ham ishlatiladi (native env `lib_deps` orqali mbedtls oladi; reja bosqichida registry mavjudligi tekshiriladi, bo'lmasa libsodium). Shunda interop testi ESP32 yo'li bilan bir xil kodni isbotlaydi.
- **Interop va tugma:** native binar `--auto-confirm=accept|reject` bayrog'ini oladi (faqat native HAL, protokolga tegmaydi). Real protokol oqimi tekshiriladi; tugma faqat HAL darajasida taqlid qilinadi.
- **Binar topilishi:** interop testi `KALIT_FIRMWARE_DIR` (default: `../kalit-firmware`) dan native binarni qidiradi; topilmasa test aniq belgilangan holda **skip** bo'ladi (fresh checkout/CI'da vitest yashil qoladi).
- Hujjat holati: spetsifikatsiya yozilgandek rejalashtiriladi; o'zgartirish so'ralsa, reja qayta ko'riladi.

## Bajaruvchiga qoldirilgan

Fayl ichki tuzilmasi, xato kodlarining aniq xaritasi (`DEVICE_KEY_CHANGED` UI matni), PBKDF2 iteratsiya soni (DevKit'da ~1 s maqsad), CBOR kutubxonasi (TinyCBOR yoki subset), `pnpm-workspace.yaml` placeholder'ini tuzatish.

## Tartib

1. `docs/protocol-v0.2.md` · 2. Extension kripto + testlar · 3. Firmware core + native testlar · 4. Interop testi · 5. ESP32 HAL + `pio run` · 6. README yangilash.
