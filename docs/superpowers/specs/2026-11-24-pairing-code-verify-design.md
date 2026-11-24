# Pairing kodini majburiy solishtirish (protokol v0.11) — qisqa dizayn

Hajm: S (kichik o'zgarish). Extension + firmware.

## Maqsad va sabab
Hozir pairing kodi (4 xonali SAS) OLED va extension'da ko'rinadi, lekin tugma bosish solishtirishni majburlamaydi. Foydalanuvchi solishtirmasdan bossa, MITM host kaliti qurilmada pin bo'lib qoladi. Maqsad: kodni solishtirmaslik imkonsiz bo'lsin.

## Goal / non-goal
- Goal: tanlov extension'da, qabul qurilmada; noto'g'ri tanlov yoki "hech biri" = hech narsa pin qilinmaydi.
- Non-goal: SAS uzunligini oshirish (4 xona ~13 bit; alohida o'zgarish sifatida tavsiya etiladi).
- Anti-goal: tugma tanlovdan oldin qabul qila olishi.

## Yondashuvlar
1. Faqat extension (3 kod UI) — oddiy, lekin tugma tanlovdan oldin bosilishi mumkin; majburlamaydi.
2. **Tanlangan:** extension 3 kod + yangi `PAIR_VERIFY` buyrug'i, qurilma tugmani faqat `match=true`dan keyin yoqadi.

## Dizayn
Oqim:
1. Extension `PAIR_HOST` yuboradi. Qurilma OLED'da SAS'ni ko'rsatadi, tugma o'chiq ("Hostda tanlang"). `CONFIRM_PENDING` (action `pair`) hodisasi `code` bilan, `phase: "verify"` bilan ketadi.
2. Extension 3 kodni aralashtirib ko'rsatadi: 1 haqiqiy (`pairingCode(handshakeHash)`), 2 ta `crypto.getRandomValues`'dan, hammasi har xil, haqiqiydan farqli; joylashuv tasodifiy. Alohida "Hech biri mos emas" tugmasi.
3. Tanlovdan keyin `PAIR_VERIFY {match: bool}`. `match = (tanlangan === haqiqiy)`; "hech biri" = false.
4. Qurilma: `match=false` yoki taymer tugasa → `PAIR_HOST` javobi `USER_REJECTED`/`TIMEOUT`, hech narsa pin qilinmaydi. `match=true` → tugma yoqiladi ("Tasdiqlash uchun bosing"), qisqa = qabul, uzoq = rad.
5. `PAIR_VERIFY` faqat `PAIR_HOST` kutayotganda ruxsat; aks holda `INVALID_STATE`. Bir marta ishlatiladi.

Taymerlar (mening qarorim): verify bosqichi 30 s, undan keyingi tugma bosqichi 10 s (hozirgi `kConfirmTimeoutMs`).

Qismlar:
- `src/shared/api/device/protocol.ts`: `PAIR_VERIFY` sxemasi; `docs/protocol-v0.11.md`.
- `secure-transport` / `mock-transport` / client: `pairVerify(match)`; `device-store.pair()` oqimi o'zgaradi (kod tanlash promise'i).
- `features/pair-device/ui/pair-device.tsx`: 3 variantli UI + "hech biri".
- Firmware: `device.cpp` PAIR_HOST/PAIR_VERIFY holati, `confirm.cpp`'ga ikki bosqichli kutish, OLED matnlari.
- Testlar: noto'g'ri tanlov/hech biri → pin yo'q; tugma verify'dan oldin e'tiborsiz; interop testi (native binar) yangilanadi.

## Builderga qoldirilgan
Decoy generatsiyasi, aniq OLED matnlari va UI uslubi (mavjud komponentlar bo'yicha).
