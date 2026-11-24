# Kalit protocol v0.7 (delta over v0.6)

Firmware >= 1.1.0. Maqsad: sig'imni 32 dan 256 ga oshirish (sahifalangan `LIST`), yozuvning oxirgi o'zgargan vaqtini (`updatedAt`)
saqlash va qurilmaning o'zi harakatsizlikdan keyin qulflanishi.

## Sig'im: kMaxEntries = 256

- `IMPORT_BEGIN` `count: 1..256`, `RESTORE_BEGIN` `count: 1..256` (v0.5/v0.6 da 1..32).
- Zaxira fayli (`kalit-backup`, version 1): `count` 1..256, `records.length` shunga teng; fayl <= 512 KB (256 yozuv x ~1.5 KB base64).
- Sig'im web va secret yozuvlar uchun umumiy. To'lgan vaultda `ADD_ENTRY` / `RESTORE_ENTRY` -> `INVALID_STATE`.

## `LIST` sahifalash

| Buyruq | Params | Result |
|---|---|---|
| `LIST` | `{cursor?: uint}` (default 0) | `{entries: EntryMeta[], next?: uint}` |

- Qurilma bir sahifada ko'pi bilan 16 yozuv qaytaradi (kamroq ham bo'lishi mumkin: 8 KiB kadr chegarasi).
- `cursor` — slot indeksi. `next` bor bo'lsa yana sahifa bor: uni keyingi so'rovda `cursor` qilib bering. `next` yo'q — oxirgi sahifa.
- Extension (`DeviceClient.listAll()`) `next` yo'qolguncha aylanadi. Himoya: ko'pi bilan 64 sahifa; `next` oldingi `cursor`dan katta
  bo'lishi shart, aks holda `PROTOCOL` xatosi (cheksiz sikl yo'q).
- Sahifalar orasida yozuv qo'shilsa/o'chirilsa natija nomuvofiq bo'lishi mumkin; extension vaultni o'zgartirishdan keyin `LIST` ni qayta o'qiydi.
- Public client/store API o'zgarmadi: `useDevice.entries` to'liq ro'yxat.

## `updatedAt` (`now`)

Yozuvni yaratuvchi/o'zgartiruvchi so'rovlarga ixtiyoriy `now: uint` (joriy unix vaqt, soniya, butun son = `Math.floor(Date.now()/1000)`)
qo'shiladi. Extension buni `DeviceClient.call` ichida avtomatik qo'shadi (chaqiruvchilar bilmaydi):

| Buyruq | Qurilma xatti-harakati |
|---|---|
| `ADD_ENTRY` (IMPORT sessiyasidagilar ham) | `updatedAt = now` |
| `UPDATE_ENTRY` | `now` berilgan bo'lsa `updatedAt = now`, aks holda o'zgarmaydi |
| `RESTORE_ENTRY` | qo'shilgan yozuv uchun `updatedAt = now` (zaxiradagi vaqt tiklanmaydi) |

`now` yo'q bo'lsa `ADD`/`RESTORE` da `updatedAt = 0`. `updatedAt == 0` — "noma'lum" (UI: "noma'lum", eskirish eslatmasi yo'q).
`EntryMeta.updatedAt` endi unix soniya (simulyatorda avval millisekund edi).

UI: yozuv tafsilotida "Oxirgi o'zgargan"; web/secret yozuv `updatedAt > 0` va 365 kundan eski bo'lsa ro'yxatda soat belgisi va
tafsilotda "bu parol 1 yildan eski" eslatmasi (`entities/entry/model/age.ts`).

## Qurilma auto-lock

Qurilma harakatsizlikdan keyin o'zi qulflanadi va mavjud `LOCKED` hodisasini yuboradi (`{event: "LOCKED"}`; wire: `{ev: "LOCKED"}`).
Faol import/eksport/tiklash sessiyalari tugaydi. Extension: store `phase = "locked"`, `status.state = "LOCKED"`, `entries = []`,
`pending = null` (qo'lda `LOCK` bilan bir xil) va ochish formasi ko'rsatiladi. Yangi buyruq yo'q.
Simulyator: `MockTransport.triggerAutoLock()` (test hook).

## Extension tomoni (protokolga aloqasiz)

- Saqlash taklifi: shu sayt+login uchun yozuv bor bo'lsa "Yangilansinmi?" -> `UPDATE_ENTRY {id, password}` (qurilmada tugma bilan tasdiq).
  Kalit o'zi to'ldirgan o'sha parol qayta yuborilsa taklif qilinmaydi (SHA-256, faqat RAM).
- Ko'p bosqichli login: login-only formada yuborilgan login tab + domen bo'yicha faqat RAM'da ~10 daqiqa eslab qolinadi
  (tab yopilsa yoki boshqa domenga o'tilsa unutiladi, parol bilan birga hech qachon saqlanmaydi, diskka yozilmaydi).
