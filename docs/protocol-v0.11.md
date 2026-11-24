# Kalit protocol v0.11 (delta over v0.10)

Maqsad: pairing kodini (2 xonali SAS) majburiy solishtirish. Oldin kod OLED va extension'da ko'rinardi, lekin tugma
bosish solishtirishni majburlamasdi: solishtirmasdan bosgan foydalanuvchi tekshirilmagan pairing'ni bexosdan qabul qilardi.
Endi tanlov extension'da, va to'g'ri tanlovdan keyin **qurilmada tugma bosilmaydi** (egasining qarori): qurilma
hostning `match:true` xabari bilan darhol pin qiladi. Bu (a) tekshirilmagan pairing'ni **tasodifan** qabul qilishdan
himoya qiladi va (b) extension'ga MITM'ni **aniqlash** imkonini beradi (uchta variant orasida OLED'dagi kod yo'q).
Qurilma foydalanuvchi tanlovini o'zi tekshira olmaydi — qarang: [Cheklov](#cheklov).

## PAIR_VERIFY

| Buyruq | Params | Result | Confirm |
|---|---|---|---|
| `PAIR_VERIFY` | `{match: bool}` | `{}` | yo'q (tanlov kompyuterda; tugma bosqichi yo'q) |

Konstantalar (`protocol.ts`): `PAIR_VERIFY_TIMEOUT_MS = 30_000`, `PAIR_CODE_RE = /^\d{2}$/`,
`PAIR_VERIFY_MIN_FIRMWARE = 1.3.0`. Extension `PAIR_HOST` yuborishdan oldin `GET_STATUS.firmware` ni tekshiradi
(`/(\d+)\.(\d+)\.(\d+)/`); < 1.3.0 yoki o'qib bo'lmasa `FIRMWARE_OUTDATED` (eski firmware verify bosqichisiz,
faqat tugma bilan pin qiladi). Boshqa buyruqlar (GET_STATUS va h.k.) eski firmware bilan ham o'zgarmaydi.

## Pairing kodi (SAS)

2 xonali o'nlik kod, nol bilan to'ldiriladi (`"07"`). `d = SHA-256(handshakeHash || "kalit/pair")` (32 + 10 bayt,
ASCII), `v = (d[0]<<24 | d[1]<<16 | d[2]<<8 | d[3])` (big-endian uint32, ishorasiz) `% 100`, kod = `v` 2 xonada.
Test vektorlari (`handshakeHash` hex → kod):

| handshakeHash | Kod |
|---|---|
| `c8e5f64e846193be2a834104c2a009868d6c9f3bd3c186299888b488b2f1f58e` | `62` |
| `4761aa086afe2281699a25bc64f24056f64f15a23e11517d7505e6ec3ced6c8d` (TS transkript) | `28` |
| `0d` × 32 | `05` |

**Ogohlantirish:** 2 xona (~6.6 bit, 100 variant) zaif. Himoya butunlay foydalanuvchining OLED'dagi kodni
kompyuterdagi variantlar bilan solishtirishiga tayanadi; MITM kodi 1/100 ehtimol bilan tasodifan mos keladi.

## Oqim

1. Extension `PAIR_HOST` yuboradi. Qurilma OLED'da SAS'ni ko'rsatadi ("KODNI TANLANG", pastda "Kompyuterda tanlang",
   30 s taymer), tugma **o'qilmaydi**. `CONFIRM_PENDING` hodisasi: `{action: "pair", code, phase: "verify", timeoutMs: 30000}`.
2. Extension 3 ta kodni aralashtirib ko'rsatadi: 1 haqiqiy (`pairingCode(handshakeHash)`), 2 ta `crypto.getRandomValues`
   decoy (hammasi har xil, haqiqiydan farqli, joylashuv tasodifiy) va alohida "Hech biri mos emas" tugmasi.
3. Tanlovdan keyin extension `PAIR_VERIFY {match}` yuboradi. `match = (tanlangan === haqiqiy)`; "hech biri" = `false`.
4. `match=false` (yoki verify taymeri tugasa): `PAIR_HOST` javobi `USER_REJECTED` (taymerda `TIMEOUT`), hech narsa pin
   qilinmaydi, OLED'da "Rad etildi" ("Vaqt tugadi"). Extension `match=false` ni yuborgach `PAIR_HOST` javobini kutmaydi:
   darhol `USER_REJECTED` qaytaradi va ogohlantirish ko'rsatadi ("Kod mos kelmadi"). `PAIR_HOST`ning keyingi natijasi yutiladi.
5. `match=true`: tugma bosqichi **yo'q**. Qurilma hostni darhol pin qiladi (4 ta host to'lgan bo'lsa eng eskisi
   chiqariladi; faqat `PAIR_HOST` yuborilgan o'sha Noise kanalining kaliti), OLED'da qisqa "Ulandi" xabari, keyin bosh ekran.
   Ikkinchi `CONFIRM_PENDING` yuborilmaydi.

Qurilmadan chiqadigan kadrlar ketma-ketligi (`PAIR_VERIFY`ga javoban, ikkala holatda bir xil tartib):

| `match` | 1 | 2 | 3 |
|---|---|---|---|
| `true` | `CONFIRM_DONE` | `PAIR_VERIFY` → `{}` | `PAIR_HOST` → `{}` |
| `false` | `CONFIRM_DONE` | `PAIR_VERIFY` → `{}` | `PAIR_HOST` → `USER_REJECTED` |

Verify taymeri tugasa: `CONFIRM_DONE`, keyin `PAIR_HOST` → `TIMEOUT`.

Pairing kutilayotganda (verify bosqichi) `GET_STATUS` va `PAIR_VERIFY` dan boshqa buyruqlar `BUSY` oladi. Yangi Noise
handshake (qayta ulanish) kutilayotgan pairing'ni javobsiz bekor qiladi (hech narsa pin qilinmaydi; keyingi
`PAIR_VERIFY` = `INVALID_STATE`). Verify paytidagi tugma bosishlari hech narsaga ta'sir qilmaydi.

`PAIR_VERIFY` javobi (`{}`) tanlov qabul qilinganini bildiradi; **`PAIR_HOST` javobi `PAIR_VERIFY`'dan keyin keladi**.
Shuning uchun klient `PAIR_HOST` so'rovini ochiq ushlab turib, shu orada `PAIR_VERIFY` yuboradi. Qurilma `PAIR_VERIFY`
javobini ushlab turmaydi (bloklovchi bosqich yo'q): ikkala javob darhol keladi. `PAIR_HOST` allaqachon tugagan bo'lsa
klient kech `PAIR_VERIFY` yubormaydi.

## CONFIRM_PENDING.d.phase

`ConfirmInfo.phase?: "verify"`. Faqat `action: "pair"` uchun: `"verify"` = kod solishtirish bosqichi (tugma o'qilmaydi).
1.3.0 firmware pairing uchun faqat `phase: "verify"` yuboradi. Boshqa qiymatlar sxema bo'yicha rad etiladi.

## Taymerlar

| Bosqich | Muddat |
|---|---|
| Verify (kod tanlash) | 30 s (`PAIR_VERIFY_TIMEOUT_MS`) |
| Tugma bosqichi | yo'q (`match=true` darhol pin qiladi) |

## Xatolar

| Holat | `PAIR_VERIFY` javobi | `PAIR_HOST` javobi |
|---|---|---|
| `match=true` | `{}` | `{}` (host darhol pin qilinadi) |
| `match=false` ("hech biri" ham) | `{}` | `USER_REJECTED`, pin yo'q |
| Verify taymeri tugadi | `INVALID_STATE` (kech) | `TIMEOUT`, pin yo'q |
| `PAIR_HOST` kutilmayotganda (ishonchli host ham) | `INVALID_STATE` | — |
| `match` kaliti yo'q | `INVALID_STATE` | kutish davom etadi |
| Ikkinchi `PAIR_VERIFY` (bir martalik) | `INVALID_STATE` | o'zgarmaydi |
| Qayta ulanishdan keyin | `INVALID_STATE` | javobsiz bekor qilingan, pin yo'q |

## Cheklov

- **`match` ni qurilma bilan Noise sessiyasini kim tutsa, o'sha yuboradi, va undan keyin tugma yo'q.** Extension va
  qurilma orasidagi faol MITM (masalan, zararli USB vositachi yoki kompyuterdagi boshqa dastur) yoki buzilgan host
  qurilmaga `PAIR_VERIFY {match:true}` ni o'zi yuborib, **jismoniy ishtiroksiz** o'zini pin qila oladi — qurilma
  foydalanuvchi extension'da nimani tanlaganini tekshira olmaydi. Bu egasining ongli qarori (xavf haqida ogohlantirilgan).
  Dizayn beradigani: (a) solishtirmasdan tasodifan qabul qilishdan himoya; (b) MITM'ni aniqlash — uchta variant orasida
  OLED'dagi kod bo'lmaydi.
- Pin qilingan host ham vault'ni master parolsiz ocha olmaydi; har fill/save/delete (va boshqa tasdiqli buyruqlar)
  baribir qurilmada tugma bosishni talab qiladi.
- Extension "Kod mos kelmadi" degan bo'lsa-yu, OLED'da "Ulandi" chiqsa — bu MITM belgisi: begona hostni
  `LIST_HOSTS` / `REVOKE_HOST` bilan olib tashlang.
- SAS 2 xona (~6.6 bit): zaif, faqat foydalanuvchi solishtirishiga tayanadi (yuqoriga qarang).
- Tanlovni qurilmaning o'zida qilish (kuchliroq variant) bu versiyada yo'q.
