# Kalit extension'ni o'rnatish

Kalit — parollaringizni brauzerda emas, ESP32 qurilmangizda saqlaydigan parol menejeri.
Bu qo'llanma extension'ni zip arxivdan qo'lda (Chrome Web Store'siz) o'rnatishni tushuntiradi.

Talablar: Chrome (yoki Chromium asosidagi brauzer) 116 yoki yangi, Web Serial qo'llab-quvvatlanishi, USB kabel va Kalit qurilmasi.

## 1. O'rnatish

1. `kalit-extension-vX.Y.Z.zip` faylini oling va doimiy papkaga chiqaring (masalan `Hujjatlar/kalit-extension`).
   Papkani keyin o'chirmang: Chrome extension'ni shu papkadan o'qiydi.
2. Chrome'da `chrome://extensions` manzilini oching.
3. O'ng yuqoridagi **Developer mode** (Dasturchi rejimi) tugmasini yoqing.
4. **Load unpacked** (Paketsiz yuklash) ni bosing va chiqarilgan papkani (ichida `manifest.json` bor) tanlang.
5. Ro'yxatda "Kalit" paydo bo'ladi. Xato chiqsa, papka to'g'ri tanlanganini tekshiring.

## 2. Toolbar'ga mahkamlash

Chrome toolbar'idagi jumboq belgisi (Extensions) → Kalit yonidagi **pin** tugmasi. Kalit ikonkasi doim ko'rinib turadi.

## 3. Qurilmani ulash (USB ruxsati)

1. Qurilmani USB kabel bilan kompyuterga ulang. Boshqa dasturlar (serial monitor, PlatformIO) portni band qilmasin.
2. Kalit ikonkasini bosing → **USB orqali ulash**.
3. Ochilgan sahifada Chrome qurilmani tanlash oynasini ko'rsatadi: qurilmangizni tanlab, **Connect** ni bosing.
   Bu ruxsat bir marta beriladi; keyin Kalit o'zi ulanadi, kabel qayta ulansa ham.

## 4. Birinchi ulash (pairing)

Qurilma yangi kompyuterni tanimaydi, shuning uchun uni bir marta ulash kerak:

1. Qurilma OLED ekranida 2 xonali kodni ko'rsatadi (masalan `07`). Bu paytda qurilmadagi tugma ishlamaydi.
2. "Bu kompyuterni ulang" ekranida 3 ta kod chiqadi: OLED'dagi kod bilan bir xilini tanlang (30 soniya ichida).
   Hech biri mos kelmasa — **"Hech biri mos emas"** ni bosing: ulanish rad etiladi.
3. To'g'ri kod tanlansa, qurilmada tugma bosish **kerak emas**: extension "Ulanmoqda…" deydi, qurilma ekranida "Ulandi"
   chiqadi va ulanish tugaydi.

**Muhim:** "Kod mos kelmadi" ogohlantirishi chiqsa (noto'g'ri kod yoki "Hech biri mos emas"), ulanish rad etilgan. Kod
variantlar orasida yo'qligi kimdir ulanishga aralashayotganini (MITM) bildirishi mumkin. Cheklov: qurilma sizning
tanlovingizni o'zi tekshira olmaydi va to'g'ri tanlovdan keyin tugma so'ramaydi — shuning uchun bunday vositachi yoki
buzilgan kompyuter qurilmaga jismoniy tegmasdan ham o'zini ulay oladi. Kod atigi 2 xonali (~6.6 bit), ya'ni zaif. Ulangan
kompyuter ham vault'ni master parolsiz ocha olmaydi, va har bir to'ldirish / saqlash / o'chirish baribir qurilmada tugma
bilan tasdiqlanadi. "Kod mos kelmadi" chiqqan bo'lsa-yu qurilmada "Ulandi" ko'rinsa — begona kompyuterni
Sozlamalar → Hostlar bo'limida bekor qiling.

Bunday tasdiqlash uchun qurilma firmware'i 1.3.0 yoki yangi bo'lishi kerak: eskisida extension firmware'ni yangilashni
so'raydi.

Qurilma bir vaqtda 4 tagacha kompyuterni eslab qoladi. Keraksizini Boshqaruv → Sozlamalar → **Hostlar** bo'limidan bekor qiling.

## 5. Qurilmani sozlash (yangi qurilma)

1. "Master parol yarating" ekranida kamida 12 belgili master parol kiriting va takrorlang.
2. Master parolni tiklash imkoni **yo'q** (recovery phrase yo'q): uni qog'ozga yozib, xavfsiz joyda saqlang va
   Sozlamalar → Zaxira orqali shifrlangan nusxa oling. Keyin **Tushundim** ni bosing.
   Master parol unutilsa: qurilmani tozalang (10 ta noto'g'ri urinish yoki `docs/FLASHING.md`), yangi master parol yarating, so'ng Sozlamalar → Zaxira → **Tiklash** orqali `.kalit` faylini zaxira paroli bilan qaytaring.
3. Endi qurilmani master parol bilan oching. Ekran qulflansa, qurilma ham qulflanadi.

## 6. Bitwarden'dan import

1. Bitwarden'da: Tools → Export vault → format **.json** (yoki .csv). Faylni saqlang.
2. Kalit popup'ida **Boshqaruvni ochish** → Sozlamalar → **Import**.
3. Faylni tanlang va yozuvlarni ko'rib chiqing. Saytsiz yozuvlar uchun sayt tanlash yoki maxfiy yozuv sifatida saqlash mumkin.
4. Import boshlanishidan oldin qurilmada "N ta yozuv" so'rovi chiqadi; bir marta tugma bilan tasdiqlang.
   Qolgan yozuvlar qo'shimcha tasdiqsiz yoziladi. Import uchun qurilma firmware'i 0.4.0 yoki yangi bo'lishi kerak.
5. **Muhim:** import tugagach Bitwarden eksport faylini (ochiq matn!) xavfsiz o'chiring.

## 7. Zaxira nusxa

1. Boshqaruv → Sozlamalar → **Zaxira** → "Zaxira nusxa olish".
2. Alohida zaxira paroli o'ylab toping (master paroldan farqli bo'lgani yaxshi) va qurilmada tugma bilan tasdiqlang.
3. Yozuvlar qurilmada shifrlanib, `kalit-backup-YYYY-MM-DD.kalit` fayliga saqlanadi. Faylni xavfsiz joyda (USB flesh, boshqa disk) saqlang.
4. **Zaxira paroli tiklanmaydi.** Yo'qotsangiz, fayl hech kimga ochilmaydi.
5. Tiklash: Zaxira → "Zaxiradan tiklash" → `.kalit` faylni tanlang → zaxira parolini kiriting → qurilmada tasdiqlang.
   Firmware 0.5.0 yoki yangi bo'lishi kerak.

## 8. Ikkinchi / ish kompyuterida (faqat extension bilan)

Qurilmaning o'zida parollar bor, shuning uchun ikkinchi kompyuterga faqat extension kerak:

1. Shu qo'llanmaning 1-2 bandlari bo'yicha extension'ni o'rnating.
2. Qurilmani shu kompyuterga ulang (3-band) va yangi kompyuterni ulang (4-band, OLED'dagi kodni tanlab).
3. Master parol bilan oching. Parollar qurilmadan keladi, kompyuterga nusxa ko'chmaydi.

Ish kompyuterida extension o'rnatish siyosat bilan cheklangan bo'lishi mumkin; bu holda IT bo'limiga murojaat qiling.

## Muammolar

- **Qurilma ko'rinmayapti:** boshqa kabel yoki USB port sinab ko'ring; serial monitor yopilganini tekshiring.
- **Ulanish uzilgan:** `chrome://extensions` → Kalit → Inspect views → `offscreen.html` → Console.
- **Yangilash:** yangi zip'ni shu papkaga chiqarib (eskisini almashtirib), `chrome://extensions`da Kalit'dagi yangilash (⟳) tugmasini bosing.
