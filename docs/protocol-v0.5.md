# Kalit protocol v0.5 (delta over v0.4)

Firmware >= 0.4.0. Maqsad: ommaviy import uchun BITTA qurilma tasdig'i.

## Yangi buyruqlar

| Buyruq | Params | Result | Confirm |
|---|---|---|---|
| `IMPORT_BEGIN` | `{count: int 1..32}` | `{}` | ha |
| `IMPORT_END` | `{}` | `{added: int}` | yo'q |

`ConfirmAction` ga `"import"` qo'shildi. `ConfirmInfo.site = "${count} ta yozuv"`, `username` yo'q.

## IMPORT_BEGIN

- Vault ochiq (`LOCKED` aks holda) va host ishonchli bo'lishi kerak.
- Sessiya allaqachon faol bo'lsa yoki `count` bo'sh slotlardan ko'p bo'lsa: `INVALID_STATE`.
- Qurilma bitta tasdiq ko'rsatadi. Rad etilsa `USER_REJECTED`, vaqt tugasa `TIMEOUT`; sessiya ochilmaydi.
- Qabul qilinsa import sessiyasi ochiladi.

## Sessiya

- `ADD_ENTRY` (web yoki secret, parametrlar o'zgarmagan) har chaqiruvda tugma so'ramaydi (`CONFIRM_PENDING` yo'q), `count` martagacha.
- Faqat `ADD_ENTRY` ta'sirlanadi: `GET_CREDENTIAL`, `DELETE_ENTRY`, `UPDATE_ENTRY`, `REVEAL_SECRET`, `CHANGE_MASTER`, `REVOKE_HOST` avvalgidek tugma talab qiladi (`CHANGE_MASTER` sessiyani tugatmaydi).
- Yozuv bo'yicha xatolar (`INVALID_STATE`, `ORIGIN_MISMATCH`, ...) sessiyani tugatmaydi va hisobni sarflamaydi.
- Sessiya tugaydi: `count` ta muvaffaqiyatli qo'shilganda, qabul qilinganidan 120 s o'tganda, `IMPORT_END`, `LOCK`, ulanish yopilishi/reset, wipe.
- Tugagandan keyingi `ADD_ENTRY` oddiy (tasdiqli) rejimga qaytadi.

## IMPORT_END

Sessiyani tasdiqsiz tugatadi va sessiyada qo'shilganlar sonini qaytaradi. Idempotent: sessiya bo'lmasa `{added: 0}` (xato emas).

## Host

- `Commands.IMPORT_BEGIN` timeout: confirm oynasi (12 s); `IMPORT_END`: 8 s.
- Eski firmware `IMPORT_BEGIN` ga `INTERNAL` qaytaradi; Import sahifasi buni "Firmware yangilanishi kerak (0.4.0+)" deb ko'rsatadi.
- Engine/store: `importBegin(count): Promise<void>`, `importEnd(): Promise<number>`.
