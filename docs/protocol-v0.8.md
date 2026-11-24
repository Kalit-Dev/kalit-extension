# Kalit protocol v0.8 (delta over v0.7)

Firmware >= 1.2.0. Maqsad: har bir yozuvga (web ham, secret ham) uzunroq **maxfiy eslatma** (tiklash kodlari, PIN, xavfsizlik
savollari). Eslatma parol kabi himoyalanadi: qurilmada shifrlangan slot ichida saqlanadi, `LIST`da matni yo'q, o'qish uchun
tugma tasdig'i kerak.

## Maydon

- `note`: UTF-8 matn, **0..1024 bayt** (belgi emas, bayt). Bo'sh = eslatma yo'q. NUL bayt rad etiladi.
- Metadata byudjeti (`site+username+title <= 160`) eslatmaga tegishli emas.
- `EntryMeta.hasNote?: bool` — eslatma bor bo'lsa `true`, yo'q bo'lsa maydon umuman yuborilmaydi. Matn hech qachon `LIST`,
  `ADD_ENTRY`/`UPDATE_ENTRY` javobi yoki `GET_CREDENTIAL`/`REVEAL_SECRET` natijasida qaytmaydi.

## Buyruqlar

| Buyruq | O'zgarish |
|---|---|
| `ADD_ENTRY` | ixtiyoriy `note: string` (web va secret). Yozuv yaratilgan zahoti saqlanadi; qo'shimcha tasdiq yo'q (mavjud "save" tasdig'i). IMPORT sessiyasida ham ishlaydi. |
| `UPDATE_ENTRY` | ixtiyoriy `note: string`. Berilmasa o'zgarmaydi; `""` = eslatmani o'chirish. Endi "kamida bitta maydon" qoidasi `title`/`username`/`password`/`note` bo'yicha. |
| `GET_NOTE` | `{id}` -> `{note: string}`. **Tasdiq: `"reveal"`** (parolni ko'rsatish bilan bir xil ekran: nom/sayt + login). |

`GET_NOTE` xatolari: `NOT_FOUND` (noma'lum id), `LOCKED`, `NOT_TRUSTED`, `INVALID_STATE` (yozuvda eslatma yo'q — **tasdiqsiz**,
ya'ni `hasNote` ni tekshirib chaqiring), `USER_REJECTED`, `TIMEOUT`.
`ADD_ENTRY`/`UPDATE_ENTRY`da 1024 baytdan uzun eslatma -> `INVALID_STATE` (tasdiqdan oldin, ekran ochilmaydi).
Yangi `ConfirmAction` yo'q.

Eksport sessiyasi faol paytda `UPDATE_ENTRY` avvalgidek `BUSY`; `GET_NOTE` o'qish bo'lgani uchun bloklanmaydi.

## Saqlash (flash)

Slot ochiq matni (shifrlashdan oldin): `id | updated_at | site | username | title | password | kind` dan keyin **ixtiyoriy**
`u16 LE uzunlik | eslatma baytlari`. Eslatma bo'sh bo'lsa baytlar yozilmaydi, shuning uchun v0.7 yozuvlari o'zgarishsiz o'qiladi
(orqaga moslik) va eslatmasiz yangi yozuvlar eskisi bilan bir xil. Pastga (downgrade) o'tilsa eski firmware eslatma baytlarini
e'tiborsiz qoldiradi (yozuv o'qiladi), lekin yozuv o'zgartirilsa (`UPDATE_ENTRY`, `CHANGE_MASTER`) eslatma **yo'qoladi**.
`CHANGE_MASTER` eslatmalarni ham yangi kalit bilan qayta shifrlaydi.

## Zaxira (backup) — format o'zgardi

Zaxira yozuvi CBOR map'iga ixtiyoriy `"n": text` (eslatma) qo'shildi: `{s,u,p,t,k}` yoki `{s,u,p,t,k,n}` (5 yoki 6 kalit;
qolgan har qanday tarkib rad etiladi). Eslatmasiz yozuvlar v0.6/v0.7 bilan bayt-bayt bir xil, shuning uchun eski zaxira fayllari
tiklanadi (`version: 1` saqlanadi).

- Bitta blob eng ko'pi **2156 bayt** (v0.6: 1127). Extension: yozuv <= 4096 base64 belgi (o'zgarmadi), fayl <= **1 MB**
  (256 yozuv x ~2.9 KB; v0.7: 512 KB).
- `RESTORE_ENTRY` eslatmani `ADD_ENTRY` qoidalari bilan qo'shadi (>1024 bayt yoki NUL -> `INVALID_STATE`, sessiya ochiq qoladi).
- Dublikat qoidasi o'zgarmadi: eslatma kalitga kirmaydi (bir xil yozuv eslatmasi boshqacha bo'lsa ham `duplicate`).
- Eski firmware (<1.2.0) eslatmali zaxirani tiklay olmaydi (`INVALID_STATE`); eslatmasiz zaxira ishlaydi.

## Extension

- Forma: "Maxfiy eslatma" (textarea, bayt hisoblagichi). Tahrirlashda joriy matn ko'rinmaydi (u qurilmada): maydon bo'sh qolsa
  eslatma o'zgarmaydi; "Qurilmadan yuklash" (tugma tasdig'i bilan) uni formaga olib keladi; "Eslatmani o'chirish" `note: ""` yuboradi.
- Tafsilot dialogi: `hasNote` bo'lsa "Eslatmani ko'rsatish" -> `GET_NOTE` (qurilmada tugma). Matn 60 soniyadan keyin yoki
  dialog yopilganda state'dan o'chadi; hech qayerda saqlanmaydi.
- Engine op: `getNote(id)`; store: `useDevice.getNote(id)`; `updateEntry` patch'iga `note`.
- Simulyator (`MockTransport`) shu kontraktga mos (`GET_NOTE`, `hasNote`, zaxira `note`).

## Xavfsizlik

- Eslatma ochiq matn holida faqat qurilma RAM'ida (ishlov berish paytida, so'ngra nollanadi) va tasdiqdan keyin host'da
  qisqa muddat bo'ladi. Flash'da va zaxira faylida u shifrlangan.
- Autofill (`GET_CREDENTIAL`) hech qachon eslatma bermaydi: kontent skript va sahifalar eslatmaga yetmaydi.
- Qurilma ekranidagi tasdiq (`reveal`) eslatma matnini ko'rsatmaydi; foydalanuvchi faqat qaysi yozuv ochilayotganini ko'radi.
- Eslatma buferi (1 KiB) vault ichki sathida statik; `Params`/zaxira scratch'lari har so'rovdan keyin nollanadi.
