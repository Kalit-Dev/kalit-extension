# Kalit protocol v0.2

Yagona manba (extension va firmware shu hujjatga mos). Mantiqiy xabar sxemalari: `src/device/protocol.ts` (zod).
Kod: `cobs.ts`, `noise.ts`, `secure-transport.ts`, `site-rules.ts`; firmware: `kalit-firmware/lib/kalit_core`.

## 1. Qatlamlar

```
mantiqiy xabar (zod)  ->  CBOR  ->  Noise transport (ChaChaPoly)  ->  CRC16 + COBS  ->  USB CDC (115200)
```

## 2. Kadr (framing)

`0x00 | COBS(data || CRC16) | 0x00`

- COBS tanasida `0x00` bo'lmaydi, shuning uchun `0x00` kadr chegarasi.
- **Oldingi `0x00` majburiy:** ESP log qatorlaridan keyin qabul qiluvchi qayta sinxronlanadi.
- CRC16: CCITT-FALSE (poly `0x1021`, init `0xFFFF`), big-endian, `data` ustidan. Check: `"123456789"` -> `0x29B1`.
- Qabul qiluvchi quyidagilarni **jim tashlaydi**: bo'sh kadr, noto'g'ri COBS, CRC xato, `data` > 8192 bayt. Noise/AEAD xatosi esa kanalni yopadi, shuning uchun axlat AEAD'ga yetib bormasligi kerak.
- ESP log'lari (ASCII, `0x00`siz) shu portdan chiqishi mumkin; ular CRC bilan filtrlanadi.

## 3. Handshake

`Noise_XX_25519_ChaChaPoly_SHA256`, prologue = ASCII `kalit/0.2`. Host = initiator, qurilma = responder.

| Xabar | Yo'nalish | Noise tokenlari | Payload (CBOR) |
|---|---|---|---|
| msg1 | host -> qurilma | `e` | bo'sh |
| msg2 | qurilma -> host | `e, ee, s, es` | `{v:1, fw:str, name:str}` |
| msg3 | host -> qurilma | `s, se` | `{v:1, name:str}` |

- `v != 1` yoki payload noto'g'ri -> `PROTOCOL`, kanal yopiladi.
- Host msg2'dan keyin qurilma static key'ini **pin** qiladi (birinchi ulanishda). Keyin boshqa kalit chiqsa `DEVICE_KEY_CHANGED` va ulanish bloklanadi (foydalanuvchi "qurilmani unut" qilmaguncha).
- msg1 1.5 s ichida javobsiz qolsa host handshake'ni bir marta qayta boshlaydi (DevKit port ochilganda auto-reset bo'ladi).
- Handshake tugagach `Split()`: initiator `c1` bilan yuboradi, `c2` bilan oladi; responder teskari. Nonce 64-bit hisoblagich (4 nol bayt + 8 bayt little-endian), `2^64-1` zahiralangan, takrorlanmaydi.

### SAS pairing kodi

`code = (BE_uint32(SHA256(h || "kalit/pair")[0..4]) mod 10000)`, 4 xonaga nol bilan to'ldirilgan; `h` = handshake hash.
Ikkala tomon bir xil hisoblaydi. Host UI'da ko'rsatadi; qurilma serial log'ga `PAIR CODE ####` yozadi (ekranli qurilmada displeyda). DevKit'da tugma bosish kodni majburan tekshirmaydi (to'liq himoya ekranli S3 bosqichida).

## 4. Transport xabarlari (CBOR map, Noise bilan shifrlangan)

| Tur | CBOR | Mantiqiy xabar |
|---|---|---|
| so'rov | `{i:uint, c:str, p:map}` | `{id, cmd, params}` |
| muvaffaqiyatli javob | `{i, ok:true, r:any}` | `{id, ok:true, result}` |
| xato javob | `{i, ok:false, e:str}` | `{id, ok:false, error}` |
| hodisa | `{ev:str, d?:map}` | `{event, data}` |

Map kalit tartibiga tayanmang (cborg deterministik tartib beradi, firmware boshqacha yozishi mumkin).

### Buyruqlar

`GET_STATUS`, `PAIR_HOST` (tugma), `ONBOARD`, `UNLOCK`, `LOCK`, `LIST`, `GET_CREDENTIAL` (tugma), `ADD_ENTRY` (tugma), `DELETE_ENTRY` (tugma). Parametrlar: `src/device/protocol.ts`.
Hodisalar: `CONFIRM_PENDING {action, site?, username?, code?, timeoutMs}`, `CONFIRM_DONE`, `LOCKED`.
Xatolar: `USER_REJECTED TIMEOUT BUSY LOCKED BAD_PASSWORD WIPED NOT_FOUND ORIGIN_MISMATCH RATE_LIMITED NOT_TRUSTED INVALID_STATE DEVICE_KEY_CHANGED INTERNAL`.

## 5. Trust qoidalari (qurilma)

- Noma'lum host static key faqat `GET_STATUS` va `PAIR_HOST` ni bajaradi; qolganiga `NOT_TRUSTED`.
- `PAIR_HOST` tugma bilan tasdiqlanadi va host kaliti saqlanadi. Ko'pi bilan **4** host; to'lsa `INVALID_STATE`.
- Tasdiq: 10 s timeout (`TIMEOUT`), 500 ms guard (undan oldingi bosish e'tiborsiz), qisqa bosish = qabul, uzoq bosish = rad (`USER_REJECTED`).
- **10 noto'g'ri master parol** -> `WIPED`: vault, pin qilingan hostlar va qurilma kaliti o'chadi, yangi kalit yaratiladi (zavod holati). Hisoblagich tekshiruvdan OLDIN kamayadi va doimiy xotiraga yoziladi.
- Vault <= 32 yozuv; `site`/`username` <= 256, `title` <= 64 bayt, **va `site`+`username`+`title` yig'indisi <= 160 bayt** (LIST javobi 8 KiB kadrga sig'sin; oshsa `INVALID_STATE`). Qurilma `updatedAt` ni 0 qaytaradi (RTC yo'q).
- Qurilma host nomini (msg3 `name`) <= 64 bayt deb tekshiradi. Origin host faqat `[a-z0-9.-]` bo'lishi mumkin (userinfo `@` rad etiladi).

## 6. Domen qoidalari (`ADD_ENTRY.site`)

Qurilmada Public Suffix List yo'q. Extension `site` ni (eTLD+1, `tldts`) hisoblab yuboradi, qurilma tekshiradi:

- `site` kamida 2 ta label, bo'sh label yo'q;
- origin host `site` ga teng yoki `.site` bilan tugaydi;
- `GET_CREDENTIAL`: `host == site || host.endsWith("." + site)`.

Qoidalar bajarilmasa `ORIGIN_MISMATCH`. Cheklov: buzilgan extension `site="evil.com"`ni o'z originiga mos holda yuborishi mumkin, lekin tugma ekranida foydalanuvchi sayt nomini ko'radi.

## 7. Test transkripti

Kalitlar: `s_i=0x01*32, e_i=0x02*32, s_r=0x03*32, e_r=0x04*32` (har bayt shu qiymat), prologue `kalit/0.2`.
msg2 payload `{v:1,fw:"0.1.0",name:"Kalit"}`, msg3 payload `{v:1,name:"Chrome"}`.

```
msg1  ce8d3ad1ccb633ec7b70c17814a5c76ecd029685050d344745ba05870e587d59
msg2  ac01b2209e86354fb853237b5de0f4fab13c7fcbf433a61c019369617fecf10bb719b14d19eaf5ca91c89748c5ce8668e6864f05ee2367682b3e0c2fd086f0b49394a4276820c382880a58d0b4c919f70968dd63ee1fea701ca3c5a595daaff97a2766fa783b642ce863c1fbc52eab871c68b1d78695022a
msg3  539a5cf3ae8a0a9134b32bfa775a1522db3558a1351ed4101989b8b88aa6a6f05799a853ab4c63239ca7a47863d08f30e503c22ac5f9bce50ffdc97d5f99fa9db34686c3dbf6ebeb7e762bcf605b75f8
h     4761aa086afe2281699a25bc64f24056f64f15a23e11517d7505e6ec3ced6c8d
SAS   7228
CBOR  {i:1,c:"GET_STATUS",p:{}} = a361636a4745545f5354415455536169016170a0
req   (host c1, nonce 0)  3eccf2ca863ef8d5207926016a5eabd08bcf846d1bcc2b368628b9c24b0f271fd26e9b3c
frame 00273eccf2ca863ef8d5207926016a5eabd08bcf846d1bcc2b368628b9c24b0f271fd26e9b3ce51600
```

Noise qatlamining rasmiy tekshiruvi: cacophony vektori (`src/device/__vectors__/noise-xx.json`), prologue `John Galt`.
