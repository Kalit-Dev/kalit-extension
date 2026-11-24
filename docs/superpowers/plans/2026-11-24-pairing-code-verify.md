# Pairing kodini majburiy solishtirish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pairing paytida foydalanuvchi OLED kodini extension'dagi 3 variantdan tanlashi shart; tanlov tasdiqlanmaguncha qurilma tugmani qabul qilmaydi.

**Architecture:** Yangi `PAIR_VERIFY {match}` buyrug'i (protokol v0.11). `PAIR_HOST` javobi kechiktiriladi (qurilma bloklanmaydi): qurilma `pair_pending_` holatiga o'tadi va `loop()` kadrlarni o'qishda davom etadi. `PAIR_VERIFY match=true` kelganda qurilma tugma bosqichiga (mavjud `confirm("pair")`) o'tadi, `false` bo'lsa `PAIR_HOST`ni `USER_REJECTED` bilan yopadi. Extension tomonda `DeviceClient.pair(choose)` ikki buyruqni boshqaradi; engine 3 variant (1 haqiqiy + 2 tasodifiy) yasab UI'ga beradi.

**Tech Stack:** TypeScript/zod/vitest/React (kalit-extension), C++17/Unity/PlatformIO `native` env (kalit-firmware).

**Spec:** `kalit-extension/docs/superpowers/specs/2026-11-24-pairing-code-verify-design.md`

## Global Constraints

- Protokol versiyasi: **v0.11** (oxirgisi `docs/protocol-v0.10.md`); yangi hujjat `docs/protocol-v0.11.md`. Spec'dagi "v0.7" xato edi, tuzatilgan.
- SAS 4 xonali raqam qoladi (o'zgartirilmaydi).
- Verify bosqichi taymeri **30 s** (`PAIR_VERIFY_TIMEOUT_MS = 30_000` / `kPairVerifyTimeoutMs = 30000`), tugma bosqichi mavjud `kConfirmTimeoutMs` (10 s) va 500 ms guard.
- Variantlar: 3 ta, hammasi har xil, 4 xonali, nol bilan boshlanishi mumkin (`"0042"`); tasodifiylik `crypto.getRandomValues`; joylashuv aralashtirilgan.
- Xato kodlari mavjudlaridan: `USER_REJECTED`, `TIMEOUT`, `INVALID_STATE`, `BUSY`.
- Foydalanuvchi matnlari o'zbek tilida (loyiha uslubi). Firmware sharhlari ham o'zbekcha.
- Tekshiruv buyruqlari: extension `npx tsc --noEmit && pnpm test` (`kalit-extension/`); firmware `pio test -e native` (`kalit-firmware/`). Interop testlari native binarni ishlatadi (`src/shared/api/device/interop.test.ts` o'zi qanday yig'ilishini ko'rsatadi).
- FSD qatlam qoidalari `src/fsd.test.ts` bilan tekshiriladi: umumiy mantiq `shared/`da.

## Review Focus

1. Foydalanuvchi "Hech biri mos emas"ni bossa → pin yo'q, `PAIR_HOST` = `USER_REJECTED`.
2. Foydalanuvchi decoy'ni tanlasa (haqiqiy emas) → `match=false`; haqiqiy kod boshqa variantlarga tasodifan teng bo'lmaydi.
3. Tugma verify tugamasdan bosilsa (500 ms ichida ham, undan keyin ham) → e'tiborsiz, pin yo'q.
4. Verify bosqichida host jim qolsa (30 s) → `TIMEOUT`, OLED idle'ga qaytadi, hech narsa pin bo'lmaydi.
5. Verify bosqichida ulanish uzilsa / qayta handshake → holat tozalanadi; keyingi `PAIR_VERIFY` `INVALID_STATE`.
6. `PAIR_VERIFY` `PAIR_HOST`siz yoki ikkinchi marta → `INVALID_STATE`; verify paytida boshqa buyruqlar (GET_STATUS'dan tashqari) → `BUSY`.

---

### Task 1: Protokol sxemasi va hujjat (extension)

**Files:**
- Modify: `src/shared/api/device/protocol.ts` (`ConfirmInfo` ~89, `Commands` ~225, konstantalar)
- Create: `docs/protocol-v0.11.md`
- Test: `src/shared/api/device/protocol.test.ts` (yangi, agar yo'q bo'lsa)

**Interfaces:**
- Produces: `ConfirmInfo.phase?: "verify"`; `Commands.PAIR_VERIFY` = `{ params: z.object({ match: z.boolean() }), result: Empty, confirm: true }`; `export const PAIR_VERIFY_TIMEOUT_MS = 30_000`; `export const PAIR_CODE_RE = /^\d{4}$/`.

- [ ] **Step 1: Failing test** — `protocol.test.ts`: `"PAIR_VERIFY params accept {match:true} and reject {} and {match:'x'}"`; `"ConfirmInfo accepts phase 'verify' and rejects other phases"`.
- [ ] **Step 2:** `pnpm vitest run src/shared/api/device/protocol.test.ts` → FAIL.
- [ ] **Step 3:** Sxemalarni qo'shing (`phase` — `z.literal("verify").optional()`). `docs/protocol-v0.11.md`: oqim (spec'dagi 1-5 qadam), `CONFIRM_PENDING.d.phase="verify"`, xatolar jadvali, "PAIR_HOST javobi PAIR_VERIFY'dan keyin keladi" va taymerlar.
- [ ] **Step 4:** Test PASS; `npx tsc --noEmit` (boshqa joylar hali sinmaydi).
- [ ] **Step 5: Commit** `feat(protocol): PAIR_VERIFY command and verify phase (v0.11)`

### Task 2: Variantlar generatori

**Files:**
- Create: `src/shared/lib/pair-choices.ts`, `src/shared/lib/pair-choices.test.ts`

**Interfaces:**
- Produces: `makePairChoices(real: string, random?: (n: number) => Uint32Array): string[]` — uzunligi 3, `real`ni aynan bir marta o'z ichiga oladi, hammasi `PAIR_CODE_RE`ga mos va noyob, tartib aralashgan. `random` default `crypto.getRandomValues`.

- [ ] **Step 1: Tests** (`pair-choices.test.ts`): `"returns 3 distinct 4-digit codes including real exactly once"` (500 marta aylantirib, `real="0042"`); `"regenerates when a decoy collides with real or with another decoy"` (inject `random`, birinchi qiymatlar to'qnashadi → baribir 3 noyob); `"real code position is not constant"` (200 sinovda kamida 2 xil indeks).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement. Decoy: `getRandomValues` natijasi `% 10000`, modulo bias ahamiyatsiz emas — rad-sampling (`< 4294960000`) ishlating; to'qnashuvda qayta tanlang; Fisher–Yates ham `random` bilan.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(shared): pair code choice generator`

### Task 3: `DeviceClient.pair(choose)` + mock-transport

**Files:**
- Modify: `src/shared/api/device/client.ts` (timeout tanlash ~`call`, yangi metod), `src/shared/api/device/mock-transport.ts` (`PAIR_HOST` ~289, yangi `PAIR_VERIFY`)
- Test: `src/shared/api/device/mock-transport.test.ts`

**Interfaces:**
- Consumes: Task 1 sxemalari.
- Produces: `DeviceClient.pair(choose: (info: ConfirmInfo & { code: string }) => boolean | Promise<boolean>): Promise<void>`. Oqim: `PAIR_HOST` chaqiradi (kutmaydi); `phase:"verify"` li `CONFIRM_PENDING` kelganda `choose(info)` natijasi bilan `PAIR_VERIFY {match}` chaqiradi; ikkala call tugagach `PAIR_HOST` xatosini (bo'lsa) tashlaydi. `PAIR_HOST` uchun client timeout = `PAIR_VERIFY_TIMEOUT_MS + CONFIRM_TIMEOUT_MS + 2_000`.
- Mock: `PAIR_HOST` `CONFIRM_PENDING{action:"pair",code,phase:"verify",timeoutMs:30000}` yuboradi va `PAIR_VERIFY`ni kutadi (kutish = deferred; mock `fast` rejimida ham). `match=true` → mavjud `confirm({action:"pair",code})` → pin; `false` → `Fault("USER_REJECTED")`. `PAIR_VERIFY` kutilmasa → `Fault("INVALID_STATE")`. Verify paytida boshqa buyruq (GET_STATUS'dan tashqari) → `BUSY`. Taymer tugasa `TIMEOUT`; ulanish yopilsa deferred tozalanadi.

- [ ] **Step 1: Tests** (`mock-transport.test.ts`): `"pair: matching choice pins the host"`; `"pair: wrong choice rejects with USER_REJECTED and host stays untrusted"` (so'ng `GET_STATUS.hostTrusted === false`); `"pair: choose throwing/returning false never pins"`; `"PAIR_VERIFY without pending PAIR_HOST → INVALID_STATE"`; `"second PAIR_VERIFY → INVALID_STATE"`; `"LIST during verify → BUSY"`; `"verify timeout → TIMEOUT and no pin"` (fake timers); `"pair: choose receives the device code"`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. Mock `handle()` PAIR_VERIFY'ni PAIR_HOST kutayotganda parallel qabul qilishi kerak — `handle` chaqiruvlari ketma-ket kutilsa (`await` zanjiri), PAIR_HOST'ni kutmaydigan tarzda ishga tushiring; mavjud `confirm()` bilan bir xil uslubda.
- [ ] **Step 4:** Barcha mavjud `client.call("PAIR_HOST", {})` chaqiruvlarini `client.pair(() => true)` ga almashtiring (`grep -rn 'call("PAIR_HOST"' src` — `mock-transport.test.ts`, `interop.test.ts`, `secure-transport.test.ts`, `device-store.test.ts` va h.k.). `pnpm test` (interop hali firmware'ga bog'liq: Task 7 gacha `interop.test.ts` o'zgarishini saqlab, uni oxirgi taskda yashil qiling).
- [ ] **Step 5: Commit** `feat(client): pair() with verify step; mock transport PAIR_VERIFY`

### Task 4: Engine oqimi (`device-store`)

**Files:**
- Modify: `src/app/engine/device-store.ts` (state ~30–92, `pair()` ~181, onEvent ~140, `disconnect`), `src/app/engine/main.ts` (snapshot ~23, ops ~42), `src/shared/api/engine/protocol.ts` (`EngineSnapshot`, `ENGINE_OPS`), `src/entities/device/model/store.ts` (`pairingCode` kuzatuvi: ~27, 63, 112), `src/app/engine/device-store.test.ts`

**Interfaces:**
- Consumes: `DeviceClient.pair`, `makePairChoices`.
- Produces: `EngineSnapshot.pairChoices: string[] | null`; ENGINE_OPS ga `"pairChoose"`; engine `pairChoose(code: string | null): Promise<void>` (null = "hech biri"); entity store: `pairChoices: string[] | null`, `pairChoose(code: string | null): Promise<void>`. `pair()` engine'da: `client().pair(async (info) => { set({pairChoices: makePairChoices(info.code)}); const picked = await waitForChoice(); set({pairChoices: null}); return picked !== null && picked === info.code })`, so'ng `refresh()`.
- `phase:"verify"` hodisasi `pending`ni **o'rnatmaydi** (tugma overlay'i faqat tugma bosqichida); `CONFIRM_DONE`/disconnect/`initialState` reset `pairChoices`ni null qiladi va kutayotgan tanlovni `null` bilan hal qiladi.
- `pairingCode`ni snapshot'dan **olib tashlang** (UI haqiqiy kodni ko'rsatmasligi kerak); `grep pairingCode` bilan hamma joyni yangilang, `secure.pairingCode` faqat `client.pair` ichida (`info.code`) ishlatiladi.

- [ ] **Step 1: Tests** (`device-store.test.ts`, mock transport bilan): `"pair exposes 3 choices incl. the device code and pins after choosing it"`; `"pairChoose(null) rejects pair with USER_REJECTED and leaves phase 'pairing'"`; `"choosing a decoy rejects"`; `"disconnect during choice resolves and clears pairChoices"`; `"verify phase does not set pending"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npx tsc --noEmit && pnpm test` PASS.
- [ ] **Step 5: Commit** `feat(engine): pair choice flow`

### Task 5: Pair UI

**Files:**
- Modify: `src/features/pair-device/ui/pair-device.tsx`; `src/pages/pair/ui/*` (agar matn/tavsif bor bo'lsa)
- Test: `src/features/pair-device/ui/pair-device.test.tsx` (mavjud testing setup'ga qarab; bo'lmasa store darajasidagi test Task 4'da yetarli — shunda ushbu step'ni UI'ni qo'lda ko'rishga almashtiring va buni commit xabarida ayting)

**Interfaces:**
- Consumes: `useDevice(s => s.pairChoices)`, `pairChoose`.
- Mantiq: `pairChoices === null` → hozirgi "Ulashni boshlash" tugmasi; `pairChoices` bor → ko'rsatma "Qurilma ekranidagi kodni tanlang" + 3 ta katta mono tugma (`font-mono text-2xl tracking-[0.4em]`, `aria-label="Kod {code}"`) + outline "Hech biri mos emas". Kod bitta katta raqam sifatida **endi ko'rsatilmaydi**. Tanlovdan keyin tugmalar `disabled` + "Qurilmada tugmani bosing" matni; xato bo'lsa `describeError` toast (mavjud).

- [ ] **Step 1–4:** Test (bor bo'lsa): `"renders 3 choices and a 'none match' button; clicking calls pairChoose with the code / null"`. Implement. `pnpm test`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(ui): choose matching pairing code`

### Task 6: Firmware — `PAIR_VERIFY`, kechiktirilgan `PAIR_HOST`

**Files:**
- Modify: `kalit-firmware/lib/kalit_core/cbor.h` (`Request`: `bool has_match=false, match=false;`), `cbor.cpp` (~171 yonida `match` kaliti: CBOR bool `0xf4/0xf5`; boshqa tur → parse xato), `lib/kalit_core/device.h/.cpp`, `lib/kalit_hal/hal.h` (Display), `lib/kalit_esp32/oled_display.cpp`, `test/support/fakes.h`, `test/support/test_host.h`
- Test: `test/test_codec/*` (bool parse), `test/test_device/*`

**Interfaces:**
- `constexpr uint32_t kPairVerifyTimeoutMs = 30000;` (`confirm.h`).
- `Device` private: `bool pair_pending_=false; uint32_t pair_id_=0, pair_deadline_=0; void finish_pair(bool match, uint32_t verify_id); void cancel_pair(Err e);`.
- `Display::ask("pairverify", nullptr, nullptr, code)` — verify bosqichi: sarlavha "KODNI TANLANG", katta kod, "Hostda tanlang", taymer chizig'i 30 s (`confirm_tick` ishlatilmaydi; `tick` orqali). Tugma bosqichi mavjud `ask("pair", …, code)`.
- Xatti-harakat:
  - `PAIR_HOST` (ishonchsiz host, `trusted()` false): `log "PAIR CODE ####"`, `pair_pending_=true`, `pair_id_=id`, `pair_deadline_=now+kPairVerifyTimeoutMs`, `CONFIRM_PENDING{action:"pair", code, phase:"verify", timeoutMs:30000}` yuboradi, `display_->ask("pairverify",…)`, **javob yubormaydi**. Allaqachon `pair_pending_` bo'lsa → `Busy`.
  - `PAIR_VERIFY`: `!pair_pending_` yoki `!has_match` → `InvalidState`. `match=false` → `PAIR_HOST` id'ga `UserRejected`, verify id'ga bo'sh javob, notice "Rad etildi". `match=true` → `pair_pending_=false`; `confirm("pair", nullptr, nullptr, sas_)` (tugma, 10 s, guard); `Accept` bo'lsa mavjud pin/evict kodi (joyini `finish_pair`ga ko'chiring); `PAIR_HOST` id'ga natija (Ok/UserRejected/Timeout), verify id'ga bo'sh javob.
  - `loop()`: `pair_pending_` va muddat tugagan → `PAIR_HOST` id'ga `Timeout`, holat tozalanadi, notice "Vaqt tugadi".
  - Boshqa buyruqlar `pair_pending_` paytida (`GET_STATUS` va `PAIR_VERIFY`dan tashqari) → `Busy`.
  - `reset_conn()` `pair_pending_`ni tozalaydi (javobsiz; kanal yopiq).
  - Tugma verify bosqichida **o'qilmaydi** (poll qilinmaydi) → bosishlar navbatda yig'ilib qolmasligi uchun `PAIR_VERIFY match=true`dan oldin `button_.poll()` bilan bo'shatib oling.
- `kFirmware` → `"1.3.0"`; `Status.firmware` kutadigan joylarni (mock `FIRMWARE`) moslang.

- [ ] **Step 1: Failing tests** (`test_device`): 
  `test_pair_host_defers_reply_and_emits_verify_event` (javob yo'q, event `phase=="verify"`, display `ask:pairverify|||SAS`);
  `test_pair_verify_true_then_short_press_pins_host`;
  `test_pair_verify_false_rejects_and_does_not_pin` (so'ng `GET_STATUS.hostTrusted==false`);
  `test_button_press_during_verify_is_ignored` (`press_after(700, Short)` verify'dan oldin → keyin PAIR_VERIFY true, bosish yo'q → `Timeout`);
  `test_verify_timeout_after_30s` (`clock.t += 31000; dev->loop()` → `Timeout` javobi);
  `test_pair_verify_without_pending_is_invalid_state`; `test_second_pair_verify_is_invalid_state`;
  `test_other_commands_busy_during_verify`; `test_reset_conn_clears_pair_pending` (qayta handshake → `PAIR_VERIFY` `INVALID_STATE`).
  `test_codec`: `match` bool parse (true/false), son bo'lmagan tur rad.
  Test yordamchisi: `test_host.h`ga `Reply call_deferred(...)`/`send(...)` + `collect(...)` yoki `pair(rig, host)` helper'ni ikki bosqichli qiling (`PAIR_HOST` yuboring → `PAIR_VERIFY{match:true}` yuboring; `press_after`) va **mavjud barcha `pair()` / `call(...,"PAIR_HOST")` testlarini** shunga o'tkazing.
- [ ] **Step 2:** `pio test -e native` → FAIL. **Step 3:** Implement. **Step 4:** `pio test -e native` va `pio test -e native_mono` PASS. `pio run -e esp32dev` yig'iladi (OLED o'zgarishi kompilyatsiya).
- [ ] **Step 5: Commit** `feat(firmware): PAIR_VERIFY gates pairing button (v0.11)`

### Task 7: Interop va yakuniy tekshiruv

**Files:**
- Modify: `src/shared/api/device/interop.test.ts` (`PAIR_HOST` → `client.pair(...)`; ~241 test), `README.md`, `kalit-firmware/README.md` (~106, ~178: "tugma kodni majburlamaydi" eskirgan), `docs/store-listing.md` (agar eslatilsa)
- Test: `interop.test.ts`

- [ ] **Step 1:** Interop testlari: `"wrong choice → USER_REJECTED, stderr has no pin; device still untrusted"`; `"matching choice + device press → trusted"`; `"surfaces verify then press CONFIRM_PENDING for pair"` (mavjud ~241 testni yangilang: `seen` = `["pair"(verify), "pair"(press)]`, `phase`lar bilan); `stderr` `PAIR CODE ${code}` tekshiruvi qoladi.
- [ ] **Step 2:** `pnpm test` PASS (native binar yangi firmware bilan yig'ilgan bo'lishi kerak — test setup'i qanday yig'ishini tekshiring).
- [ ] **Step 3:** README'larni yangilang (pairing oqimi: 3 variantdan tanlash; "tugma majburlamaydi" jumlalari olib tashlansin; SAS 4 xona cheklovi eslatmasi qoladi).
- [ ] **Step 4:** To'liq: `npx tsc --noEmit && pnpm test && pnpm run build`; firmware `pio test -e native && pio test -e native_mono`.
- [ ] **Step 5: Commit** `test+docs: pairing verify interop and docs`
