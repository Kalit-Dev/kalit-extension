# Kalit — Chrome Extension (MV3)

ESP32-S3 hardware password manager uchun Chrome extension.
React 19 · TypeScript · Tailwind v4 · shadcn/ui · React Router 7 · Zod 4 · React Hook Form · Zustand.

## Ishga tushirish

```bash
npm install
npm run build        # yoki: npm run dev (watch rejimi)
```

Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → `dist/` papkasi.
Toolbar'dagi Kalit ikonkasi side panel'ni ochadi (holat, tez ro'yxat, fill). To'liq boshqaruv uchun panelda **"Boshqaruvni ochish"** (`manager.html`, oddiy tab). Qurilma bo'lmasa — **demo rejim**.

## Interfeyslar

- **Side panel** — minimal: ulanish/qulf holati, qidiruv, login nusxalash, fill.
- **Manager (`manager.html`)** — to'liq sahifa: **Parollar** (qidiruv, qo'shish, tahrirlash, o'chirish), **Hostlar** (pin qilingan kompyuterlar, bekor qilish), **Xavfsizlik** (master parolni o'zgartirish), **Sozlamalar** (qurilma ma'lumoti, "saqlanmasin" saytlari). Qurilmada tugma kutilganda markazda tasdiq modal'i chiqadi.
- Engine faqat tab'siz extension sahifalaridan va aynan `manager.html` tab'idan RPC qabul qiladi; content script/overlay/grant rad etiladi.

## Arxitektura

```
Sayt sahifasi
 ├─ content.js            login formalarni topadi, submit'ni ushlaydi, formani to'ldiradi
 └─ <iframe overlay.html> inline menu / "saqlansinmi?" (yopiq Shadow DOM, extension origin)
          │  chrome.runtime.sendMessage
          ▼
Engine / offscreen (hub) ──── DeviceClient ──── SecureTransport ──── RawTransport ──── ESP32
 React UI + zustand    zod validatsiya   Noise_XX + CBOR        COBS kadrlar: USB (Web Serial) | Mock | (BLE keyin)
```

- **Engine (offscreen hujjat) — qurilma ulanishining egasi.** U brauzer ochiq ekan doim yashaydi, shuning uchun side panel
  yopiq bo'lsa ham inline taklif va avto-to'ldirish ishlaydi. Web Serial MV3 service worker'da ishonchli emas (u ~30 s da
  to'xtatiladi), side panel esa yopilganda ulanishni yo'qotardi.
- **Side panel — faqat UI.** Engine holatining ko'zgusi (`store/device-store.ts`), amallar engine'ga RPC bilan boradi.
- **Background** — engine'ni yaratadi va offscreen'da yo'q API'larni (`chrome.storage`, `chrome.tabs`, `chrome.idle`) bajaradi.
- **USB ruxsati** `grant.html` (oddiy tab) orqali olinadi: tanlash oynasi side panel/offscreen'da ochilmaydi. Ruxsatdan keyin
  engine o'zi ulanadi; kabel qayta ulansa — qayta ulanadi. "Uzish" bosilsa avto-ulanish o'chadi (firmware yuklash uchun port bo'shaydi).
- **Parollar faqat lahzada.** Extension'da faqat metadata (sayt, login) RAM'da turadi.
- **Origin `sender.tab.url` dan olinadi**, payload'dan emas. Qurilma ham domenni o'zi tekshiradi.
- **Har bir parol / saqlash / o'chirish / pairing — qurilmada tugma bilan tasdiq** (10 s, keyin reject).

## Papkalar

```
src/
  device/      protocol.ts (zod kontrakt), client.ts, serial-transport.ts, mock-transport.ts
  store/       device-store.ts — side panel ko'zgusi (holat mashinasi: engine/device-store.ts)
  engine/      main.ts (offscreen entry, RPC), device-store.ts (holat mashinasi), hub.ts (content/overlay xabarlari), protocol.ts
  sidepanel/   router.tsx, routes/*, components/* (minimal panel: holat + tez ro'yxat)
  manager/     main.tsx, router.tsx, shell.tsx, pages/* (to'liq boshqaruv sahifasi)
  background/  engine'ni tirik tutadi, storage/tabs/idle ko'prigi
  overlay/     inline-menu.tsx, save-prompt.tsx (sayt ichidagi iframe)
  content/     forms.ts, overlay.ts, index.ts
  components/  ui/* (shadcn), field, password-input, brand
  lib/         domain (tldts), messages, storage, errors
```

Yangi shadcn komponent: `npx shadcn@latest add dialog`.

## Protokol (v0.2 + v0.3)

USB CDC, 115200. Kadr: `0x00 | COBS(data‖CRC16) | 0x00`. Kanal: `Noise_XX_25519_ChaChaPoly_SHA256`, xabarlar CBOR.
Host Noise static public key orqali aniqlanadi (`hostId` yo'q); qurilma 4 tagacha hostni pin qiladi, host qurilma kalitini pin qiladi.
To'liq spetsifikatsiya va test transkripti: [`docs/protocol-v0.2.md`](docs/protocol-v0.2.md). v0.3 boshqaruv buyruqlari (`CHANGE_MASTER`, `UPDATE_ENTRY`, `LIST_HOSTS`, `REVOKE_HOST`; rollarsiz): [`docs/protocol-v0.3.md`](docs/protocol-v0.3.md), firmware ≥ 0.2.0. Mantiqiy buyruqlar va sxemalar: `src/device/protocol.ts`.
Firmware: [kalit-firmware](https://github.com/Kalit-Dev/kalit-firmware). Klassik ESP32 DevKit (CP210x/CH340) ham qo'llab-quvvatlanadi.

Testlar: `pnpm test` (vitest).

## Keyingi qadamlar (v0.2)

- [x] Noise_XX secure channel + CBOR
- [ ] Parol o'zgarganini aniqlash → "Yangilansinmi?" oqimi
- [ ] Multi-step login (email → keyingi sahifada parol)
- [x] Boshqaruv buyruqlari v0.3 + to'liq sahifali manager
- [ ] Chrome'da qo'lda tekshirish: manager ko'rinishi (yorug'/qorong'i, tor ekran), tab'dan USB ulanish, offscreen'da Web Serial
- [ ] BLE transport (Web Bluetooth / native host)
- [ ] Production build'da demo rejimni o'chirish

## Ulanishni toza tekshirish (QA)

1. Brauzerda `*://extensions` → Kalit → **Remove**, so'ng `dist/` ni **Load unpacked** bilan qayta yuklang.
2. Serial monitor/`pio` ochiq bo'lmasin. Qurilmani USB'ga ulang.
3. Panelni oching → **USB orqali ulash** → ochilgan tab'da qurilmani tanlang. Panel ulanishi kerak.
4. Master parol bilan oching. **Paneli yoping**, login formali sahifaga o'ting: maydonga fokus berganda taklif chiqishi kerak.
5. Kabelni chiqarib qayta ulang: engine o'zi qayta ulanishi kerak (panelni oching — "Qulflangan"/"Ochiq").
6. Manager'ni oching (panelda "Boshqaruvni ochish"): parol qo'shing, tahrirlang, master parolni almashtiring, qulflab qayta oching.
7. Brauzerni to'liq yoping va qayta oching: panel ochilmasdan ham ulanish tiklanishi kerak.
8. Nosozlik bo'lsa: `*://extensions` → Kalit → **Inspect views: offscreen.html** → Console (`[kalit-engine]`, `[kalit-device]`).
