# Kalit protocol v0.11 (delta over v0.10)

Maqsad: pairing kodini (4 xonali SAS) majburiy solishtirish. Oldin kod OLED va extension'da ko'rinardi, lekin tugma
bosish solishtirishni majburlamasdi: solishtirmasdan bosgan foydalanuvchida MITM host kaliti qurilmada pin bo'lib qolardi.
Endi tanlov extension'da, qabul qurilmada; tugma tanlovdan oldin qabul qila olmaydi.

## PAIR_VERIFY

| Buyruq | Params | Result | Confirm |
|---|---|---|---|
| `PAIR_VERIFY` | `{match: bool}` | `{}` | ha (`PAIR_HOST` tasdig'i doirasida) |

Konstantalar (`protocol.ts`): `PAIR_VERIFY_TIMEOUT_MS = 30_000`, `PAIR_CODE_RE = /^\d{4}$/`.

## Oqim

1. Extension `PAIR_HOST` yuboradi. Qurilma OLED'da SAS'ni ko'rsatadi, tugma **o'chiq** ("Hostda tanlang").
   `CONFIRM_PENDING` hodisasi: `{action: "pair", code, phase: "verify", timeoutMs: 30000}`.
2. Extension 3 ta kodni aralashtirib ko'rsatadi: 1 haqiqiy (`pairingCode(handshakeHash)`), 2 ta `crypto.getRandomValues`
   decoy (hammasi har xil, haqiqiydan farqli, joylashuv tasodifiy) va alohida "Hech biri mos emas" tugmasi.
3. Tanlovdan keyin extension `PAIR_VERIFY {match}` yuboradi. `match = (tanlangan === haqiqiy)`; "hech biri" = `false`.
4. `match=false` (yoki verify taymeri tugasa): `PAIR_HOST` javobi `USER_REJECTED` (taymerda `TIMEOUT`), hech narsa pin
   qilinmaydi.
5. `match=true`: tugma yoqiladi ("Tasdiqlash uchun bosing"). Yangi `CONFIRM_PENDING` (`phase` yo'q, `timeoutMs: 10000`).
   Qisqa bosish = qabul, uzoq = rad.

`PAIR_VERIFY` javobi (`{}`) tanlov qabul qilinganini bildiradi; **`PAIR_HOST` javobi `PAIR_VERIFY`'dan keyin keladi**
(qabul/rad/timeout bilan). Shuning uchun klient `PAIR_HOST` so'rovini ochiq ushlab turib, shu orada `PAIR_VERIFY` yuboradi.

## CONFIRM_PENDING.d.phase

`ConfirmInfo.phase?: "verify"`. Faqat `action: "pair"` uchun: `"verify"` = kod solishtirish bosqichi (tugma o'chiq).
Yo'q = odatiy tugma bosqichi (eski xatti-harakat). Boshqa qiymatlar sxema bo'yicha rad etiladi.

## Taymerlar

| Bosqich | Muddat |
|---|---|
| Verify (kod tanlash) | 30 s (`PAIR_VERIFY_TIMEOUT_MS`) |
| Tugma bosqichi (`match=true`dan keyin) | 10 s (`CONFIRM_TIMEOUT_MS`) |

## Xatolar

| Holat | `PAIR_VERIFY` javobi | `PAIR_HOST` javobi |
|---|---|---|
| `match=true`, keyin tugma qabul | `{}` | `{}` (host pin qilinadi) |
| `match=true`, keyin tugma rad | `{}` | `USER_REJECTED` |
| `match=true`, tugma taymeri | `{}` | `TIMEOUT` |
| `match=false` ("hech biri" ham) | `{}` | `USER_REJECTED`, pin yo'q |
| Verify taymeri tugadi | `INVALID_STATE` (kech) | `TIMEOUT`, pin yo'q |
| `PAIR_HOST` kutilmayotganda | `INVALID_STATE` | — |
| Ikkinchi `PAIR_VERIFY` (bir martalik) | `INVALID_STATE` | o'zgarmaydi |

## Cheklov

SAS uzunligi (4 xona, ~13 bit) o'zgarmadi; uni oshirish alohida o'zgarish sifatida tavsiya etiladi.
