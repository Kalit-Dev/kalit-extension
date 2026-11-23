# Secure channel (Noise_XX + CBOR) va kalit-firmware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extension ↔ qurilma kanalini Noise_XX + CBOR + COBS ga o'tkazish va PlatformIO'da ishlaydigan `kalit-firmware` (ESP32 DevKit) yozish; ikkala tomon avtomatik interop testi bilan isbotlanadi.

**Architecture:** `SecureTransport` dekorator `Transport` (bayt kadrlari) ustida Noise XX handshake va AEAD qiladi, `DeviceClient`/zod sxemalar saqlanadi. Firmware: HAL'dan mustaqil `kalit_core` (cobs, noise_xx, cbor, vault, dispatcher) + `kalit_esp32` / `kalit_native` HAL'lar; native binar stdin/stdout orqali interop testida ishlaydi.

**Tech Stack:** TS, vitest, `@noble/curves|ciphers|hashes`, `cborg`; C++17, PlatformIO (Arduino, Unity), mbedtls.

**Spec:** `docs/superpowers/specs/2026-11-23-secure-channel-and-firmware-design.md`

## Global Constraints

- Shifr to'plami `Noise_XX_25519_ChaChaPoly_SHA256`, prologue `"kalit/0.2"`; handshake payload msg2 `{v:1,fw,name}`, msg3 `{v:1,name}`.
- Kadr = `COBS(payload)` + `0x00`; maks. dekodlangan kadr 8 KiB. Log qatorlari (ASCII) e'tiborsiz qoldiriladi.
- Xabarlar CBOR map: so'rov `{i,c,p}`, javob `{i,ok,r|e}`, hodisa `{ev,d?}`. Buyruq/xato nomlari `protocol.ts` bilan bir xil.
- SAS pairing kodi: `SHA-256(h || "kalit/pair")` dan 4 xonali (mod 10⁴); qurilma uni serial log'ga `PAIR CODE ####` yozadi.
- Qurilma ≤4 host pin qiladi; wipe = vault + pin'lar + qurilma kaliti o'chadi. Vault ≤32 yozuv; `site`/`username` ≤256, `title` ≤64.
- 10 urinish (tekshiruvdan OLDIN kamayadi, NVS'ga yoziladi), 10 s tasdiq, 500 ms guard; BOOT (GPIO0): qisqa = qabul, uzoq = rad.
- Host maxfiy kaliti `chrome.storage.local`'da; qurilma kaliti o'zgarsa `DEVICE_KEY_CHANGED` va ulanish bloklanadi.
- Serial VID filtri: `0x303a`, `0x10C4`, `0x1A86`. Firmware flash qilmaymiz — faqat kod, kompilyatsiya, native testlar.
- **Plan qarori (spetsifikatsiyadan kichik chetlanish):** qurilmada PSL yo'q, shuning uchun `AddEntryParams` ga `site: string` qo'shiladi (extension `tldts` bilan hisoblaydi); qurilma `site` ≥2 label va origin host'ning suffiksi ekanini tekshiradi, `GET_CREDENTIAL` da `host == site || host.endsWith("."+site)`.
- `pnpm-workspace.yaml` dagi `esbuild: set this to true or false` placeholder'i `true` qilib tuzatiladi.

## Review Focus

- Log qatori / yarim kadr / buzilgan COBS kelganda kanal buzilmasligi (Task 1, 9).
- Handshake'dan oldin yoki noto'g'ri tartibda buyruq kelishi → rad, crash yo'q (Task 3, 9).
- Nonce / AEAD xatosi (o'zgartirilgan bayt, takroriy kadr) → kanal yopiladi, ochiq javob qaytmaydi (Task 2, 3).
- Port ochilganda DevKit auto-reset: birinchi handshake yo'qolsa qayta urinish (Task 4).
- Wipe'dan keyin eski host kaliti bilan ulanish `DEVICE_KEY_CHANGED`/`NOT_TRUSTED` beradi, vault ma'lumoti chiqmaydi (Task 6, 8).

---

### Task 0: Muhit

**Files:** Modify `pnpm-workspace.yaml`, `package.json`; Create `vitest.config.ts`

- [ ] **Step 1:** `esbuild: true` qiling; `pnpm add @noble/curves @noble/ciphers @noble/hashes cborg` va `pnpm add -D vitest`; skript `"test": "vitest run"`.
- [ ] **Step 2:** PlatformIO CLI mavjudligini tekshiring (`pio --version`). Yo'q bo'lsa — o'rnatish uchun foydalanuvchidan ruxsat so'rang; ruxsatsiz Task 7–11 dagi `pio` buyruqlari o'rniga faqat kodni yozing va "tekshirilmadi" deb hisobotda ayting.
- [ ] **Step 3:** Commit `chore: add vitest, crypto and cbor deps`.

### Task 1: COBS (TS)

**Files:** Create `src/device/cobs.ts`, `src/device/cobs.test.ts`

**Interfaces — Produces:** `cobsEncode(data: Uint8Array): Uint8Array` (nolsiz `0x00` ajratgichsiz), `cobsDecode(data: Uint8Array): Uint8Array | null` (`null` = buzilgan), `class FrameReader { constructor(maxFrame = 8192); push(chunk: Uint8Array): Uint8Array[] }` — `0x00` bo'yicha kadrlarga bo'ladi, dekodlaydi, buzilgan/oversize kadrni jim tashlaydi.

- [ ] **Step 1: Failing test:** `cobs.test.ts`: round-trip `[]`, `[0]`, `[1,2,0,3]`, 254/255/300 baytli tasodifiy; `FrameReader` ASCII log qatori (`"I (123) boot\n"`) + kadr aralashmasidan faqat kadrni chiqaradi; kadr ikki `push` ga bo'lingan holda ham to'liq chiqadi; 8193 baytli kadr tashlanadi.
- [ ] **Step 2:** `pnpm test cobs` — FAIL.
- [ ] **Step 3:** Implement. Log qatorlari `0x00` ichermagani uchun ular bufferga yig'ilib keyingi kadr bilan birga dekodlanadi va **buzilgan** deb tashlanishi kerak — FrameReader `\n` ni ko'rsa buferni tozalaydi.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(device): COBS framing`.

### Task 2: Noise XX (TS)

**Files:** Create `src/device/noise.ts`, `src/device/noise.test.ts`

**Interfaces — Produces:**
```ts
export interface KeyPair { priv: Uint8Array; pub: Uint8Array }
export function generateKeyPair(): KeyPair
export class NoiseSession {            // holat mashinasi, ikkala rol
  static initiator(s: KeyPair, e?: KeyPair): NoiseSession
  static responder(s: KeyPair, e?: KeyPair): NoiseSession
  writeMessage(payload: Uint8Array): Uint8Array
  readMessage(msg: Uint8Array): Uint8Array        // payload; xatoda Error
  readonly complete: boolean
  readonly remoteStatic: Uint8Array | null
  readonly handshakeHash: Uint8Array
  split(): { send: CipherState; recv: CipherState }
}
export class CipherState { encrypt(pt: Uint8Array): Uint8Array; decrypt(ct: Uint8Array): Uint8Array }
export function pairingCode(h: Uint8Array): string   // "0000".."9999"
```
Prologue `"kalit/0.2"`, e argumenti faqat testlar uchun (deterministik).

- [ ] **Step 1: Failing tests:** (a) rasmiy Noise vektor `Noise_XX_25519_ChaChaPoly_SHA256` (cacophony/snow `noise-c-basic.txt` dan, prologue mos) — har xabar hex'i va transport payload'lari aynan mos; (b) initiator↔responder round-trip, `remoteStatic` ikkala tomonda mos, `handshakeHash` teng; (c) `pairingCode` ikki tomonda teng va 4 belgi; (d) o'zgartirilgan bitta bayt `decrypt`/`readMessage` da throw; (e) `decrypt` ketma-ketlikni buzsa (kadr qayta yuborilsa) throw.
- [ ] **Step 2:** FAIL. **Step 3:** `@noble/*` bilan implement (X25519, ChaCha20-Poly1305 IETF, SHA-256, HKDF). Vektor fayli `src/device/__vectors__/` ga manbasi izohi bilan.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(device): Noise_XX_25519_ChaChaPoly_SHA256`.

### Task 3: CBOR + SecureTransport (TS)

**Files:** Create `src/device/cbor.ts`, `src/device/secure-transport.ts`, `src/device/secure-transport.test.ts`; Modify `src/device/transport.ts`

**Interfaces:**
- Produces `transport.ts`: `Transport` endi `send(frame: Uint8Array)`/`onFrame((f: Uint8Array)=>void)` (bayt kadr; `kind` saqlanadi).
- Produces `cbor.ts`: `encode(v: unknown): Uint8Array`, `decode(b: Uint8Array): unknown` (`cborg` o'rami).
- Produces `secure-transport.ts`: `class SecureTransport { constructor(inner: Transport, identity: KeyPair, deps: { pinnedDeviceKey(): Promise<Uint8Array|null>; pinDeviceKey(k: Uint8Array): Promise<void>; hostName: string }); readonly kind; open(): Promise<void>` (handshake, `DEVICE_KEY_CHANGED` bilan reject); `send(frame: unknown)`/`onFrame((f: unknown)=>void)` obyektlar bilan (shu `DeviceClient` kutadi); `readonly pairingCode: string | null`; `readonly deviceInfo: {fw:string;name:string}|null` }`.
- Consumes: `NoiseSession`, `FrameReader`, `cobsEncode`.
- So'rov/javob xaritasi: `{id,cmd,params}`⇄`{i,c,p}`, `{id,ok,result|error}`⇄`{i,ok,r|e}`, `{event,data}`⇄`{ev,d}`.

- [ ] **Step 1: Failing tests** (jozli in-memory `Transport` + `NoiseSession.responder` bilan): handshake'dan keyin `send({id:1,cmd:"GET_STATUS",params:{}})` responder tomonida shifrlangan; ochiq matn simda ko'rinmaydi; javob `onFrame` da `{id:1,ok:true,result:...}` bo'lib chiqadi; noto'g'ri qurilma kaliti pin qilinganda `open()` `Error("DEVICE_KEY_CHANGED")`; handshake'dan oldin kelgan transport kadri tashlanadi; msg2 `v!==1` bo'lsa `open()` `Error("PROTOCOL")`; o'zgartirilgan AEAD kadr kanalni yopadi (`onClose`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; birinchi urinish 1.5 s ichida javob bermasa handshake'ni 1 marta qayta boshlaydi (DevKit auto-reset).
- [ ] **Step 4:** PASS (`pnpm test`; `tsc --noEmit`). **Step 5:** Commit `feat(device): SecureTransport over COBS+CBOR`.

### Task 4: SerialTransport baytli kadr + VID

**Files:** Modify `src/device/serial-transport.ts`

- [ ] **Step 1:** `ESPRESSIF_VID` o'rniga `SUPPORTED_VIDS = [0x303a, 0x10c4, 0x1a86]`, `requestPort` filtrlari ularning hammasi; `fromGranted` ham shu ro'yxatdan.
- [ ] **Step 2:** NDJSON o'rniga `FrameReader` va `send(frame: Uint8Array)` (`cobsEncode`+`0x00`); `open()` dan keyin 300 ms kutadi (DTR reset).
- [ ] **Step 3:** `tsc --noEmit` o'tadi. Commit `feat(device): COBS frames and DevKit USB-UART VIDs`.

### Task 5: Protokol sxemasi, kalitlar, mock, store

**Files:** Modify `src/device/protocol.ts`, `src/device/mock-transport.ts`, `src/lib/storage.ts`, `src/store/device-store.ts`, `src/sidepanel/hub.ts`, `src/sidepanel/routes/pair.tsx`, `src/sidepanel/routes/connect.tsx`, `src/lib/errors.ts`; Create `src/device/keys.ts`, `src/device/mock-transport.test.ts`

**Interfaces:**
- `protocol.ts`: `GET_STATUS.params` `Empty`; `PAIR_HOST.params` `Empty`; `AddEntryParams` + `site: z.string().min(3).max(256)`; `ErrorCode` + `"DEVICE_KEY_CHANGED"`; `hostId` hamma joyda olib tashlanadi.
- `keys.ts`: `getHostKeyPair(): Promise<KeyPair>`, `getPinnedDeviceKey(): Promise<Uint8Array|null>`, `pinDeviceKey(k)`, `forgetDevice()` — `chrome.storage.local`, hex.
- `mock-transport.ts`: Noise **responder**; `kind="mock"`; xulq o'zgarmagan (urinishlar, wipe, tasdiq, domen); `trusted` = host static key to'plami (≤4); noma'lum kalit faqat `GET_STATUS`/`PAIR_HOST`; wipe pin'larni ham tozalaydi va qurilma kalitini qayta yaratadi.
- `device-store.ts`: SecureTransport yaratadi; `phase` `"pairing"` da `pairingCode` ko'rsatiladi; `DEVICE_KEY_CHANGED` uchun UI matn va "Qurilmani unutish" tugmasi (`forgetDevice()`).

- [ ] **Step 1: Failing test** (`mock-transport.test.ts`, `SecureTransport` orqali): noma'lum host `LIST` → `NOT_TRUSTED`; `PAIR_HOST` + `press("short")` dan keyin `ONBOARD`→`UNLOCK`→`ADD_ENTRY`→`GET_CREDENTIAL` o'tadi; `GET_CREDENTIAL` noto'g'ri origin → `ORIGIN_MISMATCH`; 10 ta noto'g'ri parol → `WIPED`, keyin eski kalit bilan `GET_STATUS` `hostTrusted:false` va yangi qurilma kaliti (pin'langan kalit bilan `open()` → `DEVICE_KEY_CHANGED`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. `tsc --noEmit` toza, `pnpm build` o'tadi.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat: Noise-secured mock device and host key pinning`.

### Task 6: `docs/protocol-v0.2.md`

**Files:** Create `docs/protocol-v0.2.md`; Modify `README.md` (protokol bo'limi, v0.2 ro'yxatida Noise bandini belgilash, USB VID eslatmasi)

- [ ] **Step 1:** Hujjat: framing, handshake xabarlari/payload'lar, SAS formulasi, CBOR kalit jadvali, buyruq va xato kodlari, trust/wipe qoidalari, `AddEntryParams.site` qoidasi; kamida bitta to'liq hex handshake transkripti (Task 2 vektoridan).
- [ ] **Step 2:** Commit `docs: protocol v0.2`.

### Task 7: Firmware scaffold + COBS (C++)

**Files (repo `/Users/anonym/Projects/kalit-firmware`, `git init -b main`):** Create `platformio.ini`, `.gitignore`, `README.md`, `lib/kalit_hal/hal.h`, `lib/kalit_core/cobs.{h,cpp}`, `test/test_cobs/test_cobs.cpp`

**Interfaces — Produces:**
```cpp
namespace kalit {
size_t cobs_encode(const uint8_t* in, size_t n, uint8_t* out, size_t cap);  // 0 = sig'maydi
bool   cobs_decode(const uint8_t* in, size_t n, uint8_t* out, size_t cap, size_t* outLen);
struct Link   { virtual size_t read(uint8_t* b, size_t cap)=0; virtual void write(const uint8_t* b, size_t n)=0; virtual ~Link()=default; };
struct Rng    { virtual void fill(uint8_t* b, size_t n)=0; virtual ~Rng()=default; };
struct Store  { virtual bool get(const char* k, uint8_t* b, size_t cap, size_t* n)=0; virtual bool put(const char* k, const uint8_t* b, size_t n)=0; virtual void erase(const char* k)=0; virtual void eraseAll()=0; virtual ~Store()=default; };
enum class Press { None, Short, Long };
struct Button { virtual Press poll()=0; virtual ~Button()=default; };
struct Clock  { virtual uint32_t ms()=0; virtual ~Clock()=default; };
struct Led    { virtual void set(bool on)=0; virtual ~Led()=default; };
class FrameAssembler { public: size_t push(const uint8_t* b, size_t n, void(*onFrame)(const uint8_t*,size_t,void*), void* ctx); };
}
```
`platformio.ini`: `[env:esp32dev]` (espressif32, arduino, `monitor_speed=115200`), `[env:native]` (platform `native`, `test_framework=unity`, `build_flags=-std=gnu++17`), `[env:esp32s3]` izohda. `FrameAssembler` TS `FrameReader` bilan bir xil qoidalar (8 KiB, `\n` bilan buferni tozalash).

- [ ] **Step 1: Failing test:** TS testidagi xuddi shu COBS vektorlari + log qatori aralash kadrlar.
- [ ] **Step 2:** `pio test -e native` — FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: scaffold, HAL interfaces, COBS`.

### Task 8: Noise XX (C++, mbedtls)

**Files:** Create `lib/kalit_core/noise_xx.{h,cpp}`, `test/test_noise/test_noise.cpp`; Modify `platformio.ini` (native `lib_deps` mbedtls; registry'da yo'q bo'lsa libsodium va sababini README'ga yozing)

**Interfaces — Produces:** TS `NoiseSession` bilan bir xil ma'noda `class NoiseSession { static NoiseSession responder(const KeyPair& s, Rng&, const KeyPair* e=nullptr); bool readMessage(const uint8_t*, size_t, uint8_t* payload, size_t cap, size_t* n); size_t writeMessage(const uint8_t* payload, size_t n, uint8_t* out, size_t cap); bool complete() const; const uint8_t* remoteStatic() const; const uint8_t* handshakeHash() const; bool split(CipherState& send, CipherState& recv); }`, `CipherState::encrypt/decrypt` (64-bit nonce, xatoda `false`), `void pairing_code(const uint8_t h[32], char out[5])`. Faqat responder kerak.

- [ ] **Step 1: Failing tests:** Task 2 dagi **xuddi shu rasmiy vektor** (responder tomoni) va SAS kodi TS bilan bir xil qiymat (vektor hash'idan; TS testi shu qiymatni `expect` qiladi); o'zgartirilgan bayt → `false`; nonce takrori → `false`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (X25519, ChaChaPoly IETF, SHA-256, HMAC/HKDF mbedtls bilan; xotira `static`, heap'siz).
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat: Noise_XX responder`.

### Task 9: CBOR, vault, dispatcher (C++)

**Files:** Create `lib/kalit_core/cbor.{h,cpp}`, `lib/kalit_core/vault.{h,cpp}`, `lib/kalit_core/domain.{h,cpp}`, `lib/kalit_core/confirm.{h,cpp}`, `lib/kalit_core/device.{h,cpp}`, `test/test_vault/`, `test/test_device/`

**Interfaces — Produces:**
- `cbor.h`: kichik subset (map, array, text, uint, bool, bytes, null) yozuvchi/o'quvchi; TinyCBOR registry'da bo'lsa shuni ishlatish ham mumkin (qaror README'da).
- `domain.h`: `bool site_valid(const char* site, const char* originHost)`, `bool host_matches(const char* host, const char* site)`, `bool origin_host(const char* origin, char* out, size_t cap)`.
- `vault.h`: `class Vault { Vault(Store&, Rng&); State state() const; int attemptsLeft() const; ErrorCode onboard(pw); ErrorCode unlock(pw); void lock(); size_t list(EntryMeta* out, size_t cap); ErrorCode add(...); ErrorCode getCredential(id, host, Credential&); ErrorCode remove(id); void wipe(); }` — PBKDF2-HMAC-SHA256 (iteratsiya `KALIT_KDF_ITER` build flag, native 1000, esp32 sozlanadi), yozuvlar ChaChaPoly bilan `Store`'ga, urinish hisoblagichi tekshiruvdan OLDIN kamayadi va yoziladi; parol generatsiyasi mock alifbosi, modulo-bias'siz.
- `confirm.h`: `class Confirm { ConfirmResult wait(info, Button&, Clock&, Led&) }` — 10 s timeout, 500 ms guard; qisqa=Accept, uzoq=Reject.
- `device.h`: `class Device { Device(Link&, Rng&, Store&, Button&, Clock&, Led&, ConfirmMode mode); void loop(); }` — handshake, host pin (≤4), SAS log, buyruq dispatcher (hamma 9 ta buyruq), hodisalar.

- [ ] **Step 1: Failing tests:** vault: 10-urinishdan keyin `WIPED` va `Store` bo'sh; hisoblagich `unlock` o'rtasida "elektr o'chishi" (Store'ga yozilgan holat) bilan kamaygan; 33-yozuv rad; `ORIGIN_MISMATCH`; shifrlangan yozuv `Store`'da ochiq parolni o'z ichiga olmaydi (bayt qidiruv). device: handshake'siz buyruq e'tiborsiz; noma'lum host `LIST` → `NOT_TRUSTED`; `PAIR_HOST` tasdiqsiz (timeout) → `TIMEOUT`; 5-host pin → `INVALID_STATE`; wipe'dan keyin pin'lar bo'sh.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `pio test -e native` PASS.
- [ ] **Step 5:** Commit `feat: vault, dispatcher, confirm`.

### Task 10: Native HAL va interop binari

**Files:** Create `lib/kalit_native/native_hal.{h,cpp}`, `src/main_native.cpp`; Modify `platformio.ini` (`[env:native_app]` `build_src_filter` main_native, `-DKALIT_KDF_ITER=1000`)

- [ ] **Step 1:** `NativeLink` (stdin/stdout, bloklamaydigan), `FileStore` (`--state <dir>`), `ArgButton` (`--auto-confirm=accept|reject`), `OsRng`/`SystemClock`.
- [ ] **Step 2:** `pio run -e native_app` binar chiqadi (`.pio/build/native_app/program`); qo'lda: `printf` bilan bo'sh kadr yuborilsa crash yo'q.
- [ ] **Step 3:** Commit `feat: native app for interop`.

### Task 11: Interop testi (extension repo)

**Files:** Create `src/device/interop.test.ts`

- [ ] **Step 1: Test:** `KALIT_FIRMWARE_DIR` (default `../kalit-firmware`) dagi `.pio/build/native_app/program` topilmasa `describe.skipIf`. Aks holda binarni `--auto-confirm=accept --state <tmp>` bilan child process sifatida ishga tushiradi, stdin/stdout'ni `Transport` ga o'raydi, `SecureTransport` orqali: `GET_STATUS` → `PAIR_HOST` → `ONBOARD` → `ADD_ENTRY(site,origin)` → `LOCK` → `UNLOCK` → `GET_CREDENTIAL` parol qaytaradi; noto'g'ri origin → `ORIGIN_MISMATCH`; SAS kodi ikki tomonda (`PAIR CODE ####` stderr) mos.
- [ ] **Step 2:** Binar bilan `pnpm test interop` PASS; binarsiz SKIP (yashil).
- [ ] **Step 3:** Commit `test: Noise interop against native firmware`.

### Task 12: ESP32 HAL va main.cpp

**Files (firmware repo):** Create `lib/kalit_esp32/esp32_hal.{h,cpp}`, `src/main.cpp`, `include/pins.h`

- [ ] **Step 1:** `UartLink` (Serial, 115200; log `Serial.printf` faqat ASCII), `EspRng` (`esp_fill_random`), `NvsStore` (Preferences/NVS), `BootButton` (GPIO0, debounce, long ≥800 ms), `Led` (GPIO2), `Clock` (`millis`).
- [ ] **Step 2:** `main.cpp`: HAL'larni yaratib `Device::loop()` ni `loop()` da chaqiradi; `KALIT_KDF_ITER` build flag (~1 s maqsad, README'da yozilgan).
- [ ] **Step 3:** `pio run -e esp32dev` kompilyatsiyadan o'tadi; RAM/Flash hajmini hisobotga yozing.
- [ ] **Step 4:** Commit `feat: ESP32 DevKit HAL and entrypoint`.

### Task 13: Hujjatlar va yakun

- [ ] **Step 1:** `kalit-firmware/README.md`: ulash (BOOT=tasdiq, LED), `pio run -t upload` (foydalanuvchi o'zi flash qiladi), `pio test -e native`, S3 ga o'tish bo'yicha eslatma, dev-grade cheklovlar (flash encryption/secure boot yo'q).
- [ ] **Step 2:** Extension `pnpm test && pnpm build`; firmware `pio test -e native`. Natijani hisobotga yozing; haqiqiy DevKit'da tekshirilmaganini aniq ayting.
- [ ] **Step 3:** Ikkala repo'da commit (extension: `docs: v0.2 secure channel`).

---

## Self-review

- Spec qamrovi: kanal (T1–3), VID/reset (T4), trust/mock (T5), protokol hujjati (T6), firmware core/vault/wipe/SAS (T7–9), interop (T10–11), ESP32 (T12), hujjat (T13). `esbuild` placeholder T0. Bo'shliq yo'q.
- Tur muvofiqligi: `NoiseSession`, `FrameReader`, `SecureTransport`, `Device` nomlari vazifalar bo'ylab mos.
- Spetsifikatsiyadan chetlanish: `AddEntryParams.site` (PSL yo'q) — Global Constraints'da.
