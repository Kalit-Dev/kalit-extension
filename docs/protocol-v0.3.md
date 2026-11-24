# Kalit protocol v0.3 (v0.2 ustiga qo'shimcha)

Transport, framing, handshake, trust va domen qoidalari o'zgarmagan: `docs/protocol-v0.2.md`. Handshake prologue va `v` ham o'zgarmaydi (qo'shimcha buyruqlar orqaga mos). Sxemalar: `src/device/protocol.ts`. Rollar yo'q: har bir ishonchli host barcha buyruqlarni bajaradi. Hamma buyruq `UNLOCKED` holatni talab qiladi (aks holda `LOCKED`).

`CONFIRM_PENDING.action` yangi qiymatlari: `master`, `update`, `revoke`.

| Buyruq | Params | Result | Tugma |
|---|---|---|---|
| `CHANGE_MASTER` | `{oldPassword: str 1..128, newPassword: str 12..128}` | `{}` | ha (`master`) |
| `UPDATE_ENTRY` | `{id: str, title?: str<=64, username?: str 1..256, password?: str 1..512}` (kamida bitta maydon) | `{entry: EntryMeta}` | ha (`update`, site+username) |
| `LIST_HOSTS` | `{}` | `{hosts: [{slot: 0..3, fp: 16 hex, current: bool}]}` | yo'q |
| `REVOKE_HOST` | `{slot: 0..3}` | `{}` | ha (`revoke`, username = fp) |

## CHANGE_MASTER
- `oldPassword` `UNLOCK` bilan bir xil hisoblanadi: urinishlar hisoblagichi tekshiruvdan OLDIN kamayadi; noto'g'ri bo'lsa `BAD_PASSWORD`, 10-urinishda `WIPED` (qurilma sessiyani yopadi, host pin'ni unutadi). To'g'ri bo'lsa hisoblagich tiklanadi.
- Tugma tasdig'idan keyin vault yangi parol bilan qayta shifrlanadi (re-key). Eski parol endi ishlamaydi. KDF tufayli host timeout'i: tasdiq oynasi + 2 x 30 s.

## UPDATE_ENTRY
- `site` o'zgarmas (parametrda yo'q). `id` topilmasa `NOT_FOUND`. `site`+`username`+`title` <= 160 bayt qoidasi saqlanadi (aks holda `INVALID_STATE`). Natija yangilangan `EntryMeta`.
- Parol javobda qaytmaydi va extension holatida saqlanmaydi.

## LIST_HOSTS / REVOKE_HOST
- `fp` = host Noise static key'ining SHA-256'sidan birinchi 8 bayt (hex). `current` = so'rov yuborgan host.
- `REVOKE_HOST` bo'sh slotga `NOT_FOUND`. Joriy hostni bekor qilsa qurilma avval javob beradi, so'ng `CLOSED` hodisasini yuborib kanalni yopadi; host qayta ulanganda `NOT_TRUSTED` oladi va qayta juftlashi kerak.

Yangi xato kodlari yo'q.
