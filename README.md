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
Side panel (hub) ──── DeviceClient ──── Transport ──── ESP32-S3
 React UI + zustand    zod validatsiya   USB (Web Serial) | Mock | (BLE keyin)
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

## Firmware uchun protokol (PoC v0.1)

USB CDC, 115200, NDJSON — har bir qator bitta JSON:

```jsonc
→ {"id":1,"cmd":"GET_STATUS","params":{"hostId":"..."}}
← {"id":1,"ok":true,"result":{"state":"LOCKED","firmware":"0.1.0","hostTrusted":true,"attemptsLeft":10}}
← {"event":"CONFIRM_PENDING","data":{"action":"fill","site":"github.com","username":"ali","timeoutMs":10000}}
← {"event":"CONFIRM_DONE"}
← {"id":7,"ok":false,"error":"USER_REJECTED"}
```

Buyruqlar va sxemalar: `src/device/protocol.ts`. `{` bilan boshlanmagan qatorlar (ESP log) e'tiborsiz qoldiriladi.

## Keyingi qadamlar (v0.2)

- [ ] Noise_XX secure channel + CBOR (hozir ochiq JSON — faqat development)
- [ ] Parol o'zgarganini aniqlash → "Yangilansinmi?" oqimi
- [ ] Multi-step login (email → keyingi sahifada parol)
- [ ] BLE transport (Web Bluetooth / native host)
- [ ] Production build'da demo rejimni o'chirish
