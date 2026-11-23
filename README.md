# Kalit — Chrome Extension (MV3)

ESP32-S3 hardware password manager uchun Chrome extension.
React 19 · TypeScript · Tailwind v4 · shadcn/ui · React Router 7 · Zod 4 · React Hook Form · Zustand.

## Ishga tushirish

```bash
npm install
npm run build        # yoki: npm run dev (watch rejimi)
```

Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → `dist/` papkasi.
Toolbar'dagi Kalit ikonkasi side panel'ni ochadi. Qurilma bo'lmasa — **demo rejim**.

## Arxitektura

```
Sayt sahifasi
 ├─ content.js            login formalarni topadi, submit'ni ushlaydi, formani to'ldiradi
 └─ <iframe overlay.html> inline menu / "saqlansinmi?" (yopiq Shadow DOM, extension origin)
          │  chrome.runtime.sendMessage
          ▼
Side panel (hub) ──── DeviceClient ──── SecureTransport ──── RawTransport ──── ESP32
 React UI + zustand    zod validatsiya   Noise_XX + CBOR        COBS kadrlar: USB (Web Serial) | Mock | (BLE keyin)
```

- **Side panel — qurilma ulanishining egasi.** Web Serial MV3 service worker'da ishonchli emas.
- **Parollar faqat lahzada.** Extension'da faqat metadata (sayt, login) RAM'da turadi.
- **Origin `sender.tab.url` dan olinadi**, payload'dan emas. Qurilma ham domenni o'zi tekshiradi.
- **Har bir parol / saqlash / o'chirish / pairing — qurilmada tugma bilan tasdiq** (10 s, keyin reject).

## Papkalar

```
src/
  device/      protocol.ts (zod kontrakt), client.ts, serial-transport.ts, mock-transport.ts
  store/       device-store.ts — holat mashinasi (disconnected → pairing → factory/locked → unlocked)
  sidepanel/   hub.ts, router.tsx, routes/*, components/*
  overlay/     inline-menu.tsx, save-prompt.tsx (sayt ichidagi iframe)
  content/     forms.ts, overlay.ts, index.ts
  components/  ui/* (shadcn), field, password-input, brand
  lib/         domain (tldts), messages, storage, errors
```

Yangi shadcn komponent: `npx shadcn@latest add dialog`.

## Protokol (v0.2)

USB CDC, 115200. Kadr: `0x00 | COBS(data‖CRC16) | 0x00`. Kanal: `Noise_XX_25519_ChaChaPoly_SHA256`, xabarlar CBOR.
Host Noise static public key orqali aniqlanadi (`hostId` yo'q); qurilma 4 tagacha hostni pin qiladi, host qurilma kalitini pin qiladi.
To'liq spetsifikatsiya va test transkripti: [`docs/protocol-v0.2.md`](docs/protocol-v0.2.md). Mantiqiy buyruqlar va sxemalar: `src/device/protocol.ts`.
Firmware: [kalit-firmware](https://github.com/Kalit-Dev/kalit-firmware). Klassik ESP32 DevKit (CP210x/CH340) ham qo'llab-quvvatlanadi.

Testlar: `pnpm test` (vitest).

## Keyingi qadamlar (v0.2)

- [x] Noise_XX secure channel + CBOR
- [ ] Parol o'zgarganini aniqlash → "Yangilansinmi?" oqimi
- [ ] Multi-step login (email → keyingi sahifada parol)
- [ ] BLE transport (Web Bluetooth / native host)
- [ ] Production build'da demo rejimni o'chirish
