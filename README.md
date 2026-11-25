# Kalit — brauzer extension'i

**Kalit** — parollaringizni brauzerda emas, o'zingizning **ESP32 qurilmangizda** saqlaydigan apparat parol menejeri.
Bu repo uning Chrome/Brave (Manifest V3) extension'i: qurilma bilan USB orqali gaplashadi, login formalarni to'ldiradi
va to'liq boshqaruv sahifasini beradi. Qurilma dasturi: [kalit-firmware](https://github.com/Kalit-Dev/kalit-firmware).

> **Holat:** versiya 1.1.0. Loyiha hali dev-grade: qurilma oqimi (juftlash, ochish, to'ldirish, zaxira) to'liq apparatda
> sinab bo'linmagan. **Haqiqiy, muhim parollar uchun ishlatmang.** Aloqa faqat USB orqali; Bluetooth ko'zda tutilmagan.

## Mundarija

- [Nima qiladi](#nima-qiladi)
- [Tezkor boshlash](#tezkor-boshlash)
- [Xavfsizlik modeli](#xavfsizlik-modeli)
- [Interfeyslar](#interfeyslar)
- [Arxitektura](#arxitektura)
- [Protokol](#protokol)
- [Loyiha tuzilmasi](#loyiha-tuzilmasi)
- [Dasturchi uchun](#dasturchi-uchun)
- [Qo'lda tekshirish (QA)](#qolda-tekshirish-qa)
- [Yo'l xaritasi](#yol-xaritasi)
- [Hujjatlar](#hujjatlar)

## Nima qiladi

| Imkoniyat | Tavsif |
|---|---|
| **Parollar qurilmada** | Parollar, loginlar va yozuvlar faqat Kalit qurilmasida shifrlangan holda turadi. Extension ularni diskka yozmaydi. |
| **Avto-to'ldirish** | Login formalarni topadi, kirish maydonida taklif chiqaradi va qurilmada tugma bosilgach to'ldiradi. |
| **Saqlash taklifi** | Yangi login yuborilganda "Saqlansinmi?" so'raydi. Saqlamaslik kerak bo'lgan saytlarni belgilash mumkin. |
| **Yozuv turlari** | Veb parollar, maxfiy yozuvlar (Wi-Fi, SSH kaliti kabi saytga bog'lanmagan sirlar), 2FA (TOTP) kodlari va maxfiy eslatmalar. |
| **Qurilmada yaratish** | Parol, PIN yoki so'zlardan iborat parol qurilmaning o'zida yaratiladi va kompyuterga chiqmaydi. |
| **Parol tekshiruvi** | Qurilmada hisoblanadi; ro'yxatda faqat "Zaif" va "Takroriy" belgilari ko'rinadi. |
| **Import** | Bitwarden (JSON) va CSV fayllardan, qurilmada bitta tasdiq bilan. |
| **Shifrlangan zaxira** | Alohida zaxira paroli bilan `.kalit` fayliga olinadi va undan tiklanadi. 30 kundan ortiq zaxirasiz qolsa, eslatma chiqadi. |
| **Hostlar** | Qurilma 4 tagacha kompyuterni tanib qoladi; Sozlamalardan istalganini bekor qilish mumkin. |
| **Firmware yangilash** | Imzosi tekshirilgan release'ni brauzerdan to'g'ridan-to'g'ri qurilmaga yozadi (vault saqlanib qoladi). |

## Tezkor boshlash

### Foydalanuvchi uchun

Talablar: Chrome yoki Chromium asosidagi brauzer (116+, Web Serial bilan), data USB kabel va Kalit qurilmasi
(firmware **1.3.0 yoki yangi**).

1. [Releases](https://github.com/Kalit-Dev/kalit-extension/releases) sahifasidan `kalit-extension-vX.Y.Z.zip` ni yuklab,
   doimiy papkaga chiqaring (papkani keyin o'chirmang).
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → chiqarilgan papka.
3. Kalit ikonkasini toolbar'ga mahkamlang, ustiga bosing va **USB orqali ulash** ni tanlang.
4. Qurilmani ulang, kompyuterda OLED'dagi 2 xonali kodga mos variantni tanlang (juftlash), master parol o'rnating.

Batafsil: [docs/INSTALL.md](docs/INSTALL.md).

### Manbadan yig'ish

```bash
pnpm install
pnpm run build      # dist/ ga yig'adi (tsc + vite)
```

So'ng `chrome://extensions` → **Load unpacked** → `dist/` papkasi.

## Xavfsizlik modeli

- **Parollar kompyuterda saqlanmaydi.** Extension'da faqat metadata (sayt, login, nom) xotirada turadi. Parol, eslatma va
  2FA kodi faqat kerak bo'lgan lahzada olinadi va state bilan birga o'chadi.
- **Har bir sezgir amal qurilmada tugma bilan tasdiqlanadi** (parolni olish, saqlash, o'chirish, yangilash, 2FA kodi).
  Tasdiq 10 soniya kutadi, so'ng rad etiladi.
- **Shifrlangan kanal.** Extension va qurilma orasida `Noise_XX_25519_ChaChaPoly_SHA256`; xabarlar CBOR.
- **Origin extension tomonidan aniqlanadi** (`sender.tab.url`), sahifa yuborgan ma'lumotdan emas. Qurilma domenni
  yana o'zi tekshiradi.
- **Juftlash kodi.** Yangi kompyuter ulanganda qurilma OLED'da 2 xonali kod ko'rsatadi; extension uchta variant (bittasi
  haqiqiy) va "Hech biri mos emas" tugmasini chiqaradi. Tugma bosilmaydi: to'g'ri kod tanlansa, ulanish darhol yakunlanadi.
- **Tarmoq so'rovi yo'q.** Extension o'z serveriga ulanmaydi, telemetriyasi yo'q. Yagona istisno: siz "Yangilanishni
  tekshirish" ni bosganingizda GitHub'dan firmware yuklab olinadi. [Maxfiylik siyosati](docs/PRIVACY.md).

**Cheklovlar (ongli qarorlar):**

- Juftlash kodi atigi 2 xonali (~6.6 bit) va tanlov natijasini qurilma tekshira olmaydi. Shuning uchun extension va
  qurilma orasidagi faol MITM yoki buzilgan kompyuter o'zini jismoniy ishtiroksiz pin qila oladi. Pin qilingan host
  baribir vault'ni **master parolsiz** ocha olmaydi va har amal tugma talab qiladi.
- "Kod mos kelmadi" chiqqan bo'lsa-yu, OLED'da "Ulandi" ko'rinsa, bu begona ulanish belgisi: hostni
  **Sozlamalar → Hostlar** bo'limida bekor qiling.
- Zaxira paroli tiklanmaydi: yo'qolsa, zaxira fayli ochilmaydi.
- Firmware < 1.3.0 bilan juftlash boshlanmaydi; extension firmware'ni yangilashni so'raydi.

## Interfeyslar

**Popup** (toolbar ikonkasi) — minimal: ulanish va qulf holati, qidiruv, login nusxalash, to'ldirish.
To'liq boshqaruv uchun **"Boshqaruvni ochish"**.

**Manager** (`manager.html`) — to'liq sahifa:

- **Parollar** — yon paneldagi ochiladigan guruh: Hammasi / Veb / Maxfiy / 2FA / Eslatma toifalari (sonlari bilan).
  Qidiruv, ro'yxat turlar bo'yicha guruhlangan. "Yangi yozuv" va "Tahrirlash" ro'yxat ustida ochiladigan dialogda.
- **Sozlamalar** — Umumiy (qurilma ma'lumoti, "saqlanmasin" saytlari, firmware yangilash), Hostlar, Import, Xavfsizlik
  (master parolni o'zgartirish), Zaxira.

Qurilmada tugma kutilayotganda markazda tasdiq oynasi chiqadi. Engine faqat extension'ning o'z sahifalaridan RPC qabul
qiladi; content script va overlay rad etiladi.

## Arxitektura

```
Sayt sahifasi
 ├─ content.js            login formalarni topadi, submit'ni ushlaydi, formani to'ldiradi
 └─ <iframe overlay.html> inline menu va "saqlansinmi?" (yopiq Shadow DOM, extension origin)
          │  chrome.runtime.sendMessage
          ▼
Engine (offscreen) ──── DeviceClient ──── SecureTransport ──── RawTransport ──── ESP32
 holat mashinasi + hub   zod validatsiya   Noise_XX + CBOR      COBS kadrlar, USB (Web Serial)
```

- **Engine (offscreen hujjat) qurilma ulanishining egasi.** Brauzer ochiq ekan doim yashaydi, shuning uchun popup yopiq
  bo'lsa ham taklif va avto-to'ldirish ishlaydi. Web Serial MV3 service worker'da ishonchli emas (~30 s da to'xtatiladi).
- **Popup va manager — faqat UI.** Engine holatining ko'zgusi (`useDevice`, zustand); amallar engine'ga RPC bilan boradi.
- **Background** engine'ni yaratadi va offscreen'da yo'q API'larni (`chrome.storage`, `chrome.tabs`, `chrome.idle`) bajaradi.
- **USB ruxsati** manager sahifasida "USB orqali ulash" bosilganda Chrome tanlash oynasi bilan beriladi (popup va
  offscreen'da oyna ochilmaydi). Ruxsat bir marta beriladi; kabel qayta ulansa, engine o'zi ulanadi. "Uzish" avto-ulanishni
  o'chiradi (firmware yuklash uchun port bo'shaydi).
- **Firmware yangilash** (Sozlamalar → Umumiy → Firmware): release GitHub'dan yuklanadi va **qurilmaga tegmasdan**
  Ed25519 imzosi hamda har fayl SHA-256'i tekshiriladi. Keyin engine portni bo'shatadi, esptool-js chip nomini solishtiradi
  va vault bo'limiga tegmay yozadi (qurilmada MD5 tekshiruvi bilan). Eski versiyaga qaytarish rad etiladi. Imzo kaliti
  `src/shared/api/firmware/signing-key.ts` da; u sozlanmaguncha tugma o'chiq (fail-closed).

## Protokol

USB CDC, 115200. Kadr: `0x00 | COBS(data‖CRC16) | 0x00`. Kanal: `Noise_XX_25519_ChaChaPoly_SHA256`, xabarlar CBOR.
Host Noise static public key orqali aniqlanadi; qurilma 4 tagacha hostni pin qiladi, host qurilma kalitini pin qiladi.

| Versiya | Nima qo'shdi | Firmware |
|---|---|---|
| [v0.2](docs/protocol-v0.2.md) | Asos: kanal, juftlash, ro'yxat, parol olish, saqlash | asos |
| [v0.3](docs/protocol-v0.3.md) | `CHANGE_MASTER`, `UPDATE_ENTRY`, `LIST_HOSTS`, `REVOKE_HOST` | 0.2.0+ |
| [v0.5](docs/protocol-v0.5.md) | Ommaviy import (`IMPORT_BEGIN`/`IMPORT_END`), bitta tasdiq | 0.4.0+ |
| [v0.6](docs/protocol-v0.6.md) | Shifrlangan zaxira `EXPORT_*` / `RESTORE_*` | 0.5.0+ |
| [v0.7](docs/protocol-v0.7.md) | 256 yozuv, sahifalangan `LIST`, `updatedAt`, auto-lock | 1.1.0+ |
| [v0.8](docs/protocol-v0.8.md) | Maxfiy eslatma | 1.2.0+ |
| [v0.9](docs/protocol-v0.9.md) | TOTP / 2FA kodlari (`GET_TOTP`) | 1.3.0 (hozirgi) |
| [v0.10](docs/protocol-v0.10.md) | Qurilmada parol yaratish va tekshirish sozlamalari | 1.3.0 (hozirgi) |
| [v0.11](docs/protocol-v0.11.md) | Juftlash kodini tasdiqlash (`PAIR_VERIFY`) | 1.3.0+ |

Mantiqiy buyruqlar va sxemalar: `src/shared/api/device/protocol.ts`. v0.4 ham `docs/` papkasida.

## Loyiha tuzilmasi

Arxitektura **Feature-Sliced Design**: qatlamlar yuqoridan pastga `app > pages > widgets > features > entities > shared`.
Qatlam faqat o'zidan pastdagini import qiladi; bir qatlamdagi slice'lar bir-birini bilmaydi; slice'ga faqat `index.ts`
orqali murojaat qilinadi. Qoidalar `src/fsd.test.ts` da tekshiriladi.

```
src/
  app/        Entry'lar (har biri alohida bundle): manager, popup, overlay, background, content,
              engine (offscreen), styles/globals.css
  pages/      Marshrut sahifalari: vault, entry-form, settings, connect, pair, setup, unlock, popup-*
  widgets/    Katta bloklar: manager-shell, popup-shell, entry-details-dialog, overlay-inline-menu, overlay-save-prompt
  features/   Foydalanuvchi amallari: entry-form, import-entries, backup, change-master-password, manage-hosts,
              unlock-device, setup-device, pair-device, connect-device, update-firmware, password-audit, ...
  entities/   Biznes obyektlari: device (store, holat, tasdiq UI), entry (toifalar, avatar, qidiruv)
  shared/     ui/ (shadcn/ui), lib/ (utils, domain, kv, errors), api/ (qurilma protokoli, transportlar, engine xabarlari)
```

**Texnologiyalar:** React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), React Router 7, React Hook Form, Zod 4, Zustand,
Vitest. UI komponentlari shadcn'dan olinadi: `npx shadcn@latest add <komponent>`.

## Dasturchi uchun

```bash
pnpm install
pnpm run dev         # watch rejimida yig'ish
pnpm run build       # dist/ (tsc + vite)
pnpm test            # vitest
npx tsc --noEmit     # tip tekshiruvi
pnpm run icons       # ikonkalarni qayta yaratish (public/icons/)
pnpm package         # tsc + test + build, so'ng release/kalit-extension-v<versiya>.zip
```

- Versiya `package.json` va `public/manifest.json` da **bir xil** bo'lishi shart (`pnpm package` farq bo'lsa to'xtaydi).
- `src/shared/api/device/interop.test.ts` haqiqiy firmware binari (`../kalit-firmware`, `pio run -e native_app` yoki
  `$KALIT_FIRMWARE_DIR`) topilsa ishlaydi; topilmasa o'tkazib yuboriladi.
- CI (`.github/workflows/ci.yml`): `tsc`, testlar, build va zip artifact.
- Release tartibi: [docs/RELEASING.md](docs/RELEASING.md).

## Qo'lda tekshirish (QA)

1. `chrome://extensions` da Kalit'ni **Remove** qiling va `dist/` ni qayta **Load unpacked** qiling.
2. Serial monitor yoki `pio` ochiq bo'lmasin; qurilmani ulang.
3. Popup → **USB orqali ulash** → qurilmani tanlang. Master parol bilan oching.
4. Popup'ni yoping va login formali sahifaga o'ting: maydonga fokus berilganda taklif chiqishi kerak.
5. Kabelni chiqarib qayta ulang: engine o'zi qayta ulanishi kerak.
6. Manager'da yozuv qo'shing, tahrirlang, master parolni almashtiring, qulflab qayta oching.
7. Brauzerni to'liq yopib qayta oching: popup ochilmasdan ham ulanish tiklanishi kerak.
8. Nosozlik bo'lsa: `chrome://extensions` → Kalit → **Inspect views: offscreen.html** → Console
   (`[kalit-engine]`, `[kalit-device]`).

## Yo'l xaritasi

- [x] Noise_XX kanali, boshqaruv buyruqlari, to'liq manager sahifasi
- [x] Import, shifrlangan zaxira, TOTP, maxfiy yozuvlar, imzolangan firmware yangilash
- [ ] Parol o'zgarganini aniqlash va "Yangilansinmi?" oqimi
- [ ] Ko'p bosqichli login (email, keyingi sahifada parol)
- [ ] Chrome'da qo'lda tekshirish: yorug'/qorong'i mavzu, tor ekran, offscreen'da Web Serial
- [ ] Firmware: flash encryption (apparatda sinalmagan, hozircha kechiktirilgan)

## Hujjatlar

[O'rnatish](docs/INSTALL.md) · [Maxfiylik siyosati](docs/PRIVACY.md) · [Ruxsatlar](docs/PERMISSIONS.md) ·
[Store tavsifi](docs/store-listing.md) · [Release tartibi](docs/RELEASING.md) · [Protokol v0.2](docs/protocol-v0.2.md)
