# HISOBCHI GO — PROGRESS JURNALI

**Oxirgi yangilash:** 2026-10-29

---

## Umumiy holat

| Metrika | Qiymat |
|---------|--------|
| Branch | `feature/hisobchi-go-mvp` |
| Oxirgi commit | `8b399cf` (mobil MVP). Keyingi diagnostika va tuzatishlar hali commit qilinmagan |
| Joriy bosqich | To'liq mobil MVP: pastki tablar, qo'lda kiritish, katalog, to'lov/qarz, hisobot, sozlamalar ✅ — qurilmada sinov kutilmoqda |
| Core testlar | 166/166 ✅ (asl 118 ta test o'zgarmagan) |
| Mobile testlar | 138/138 ✅ (haqiqiy SQLite, node:sqlite; bulut — fake klient) |
| Server (lokal PostgreSQL 16 + Supabase stub) | 60 PASS ✅ (`bash supabase/tests/run_local.sh`) |
| `expo-doctor` | 20/20 ✅ |
| Typecheck (core + mobile) | ✅ |
| `expo export --platform ios` / `android` | ✅ / ✅ (faqat JS bundle; native build emas) |
| iPhone (Expo Go, iOS 27) | Ilova oddiy rejimda ochildi va bosh ekran ma'lumot yukladi. Savdo oqimi qurilmada hali to'liq sinalmagan |

---

## Tugallangan bosqichlar

### 0–2. Audit, core modul, hujjatlar ✅
- `packages/core`: BigInt hisob-kitob, `parseUzNumber`, validatsiya, normalizatsiya.
- `docs/` hujjatlari.

### 3. Supabase sxemasi (qisman) ✅
- `supabase/migrations/001_initial_schema.sql` yozilgan, **hech qayerda qo'llanmagan**.
- `002_test_calculations.sql` — SQL testlari (ma'lum xato: M10).

### 4. Mobil MVP (`8b399cf`) ✅
- `core/parse-list.ts`: o'zbekcha ro'yxat tahlili, float'siz miqdor/narx.
- Expo Router ekranlari: bosh sahifa, kiritish, tekshirish, tasdiqlash, mijozlar, tarix, tafsilot.
- Qurilmadagi SQLite: append-only jadvallar, `line_total` CHECK, `client_op_id` idempotentligi.
- Ikki mustaqil hisob: TypeScript (BigInt) + SQLite integer arifmetikasi; mos kelmasa saqlanmaydi.

### 5. iPhone diagnostikasi va tuzatishlar (commit qilinmagan) ✅
- **SQLite tranzaksiya ulanishi** (isbotlangan): `withExclusiveTransactionAsync` alohida ulanish ochadi →
  `':memory:'` da "no such table: sales", fayl bazada `foreign_keys` tranzaksiyada o'chiq edi.
  Tuzatish: `createSerializedDb` — bitta navbatli ulanish. Regressiya testi bor.
- **Migratsiya**: `IF NOT EXISTS`, sxemani tekshirish (`inspectSchema`), DROP/reset yo'q.
- **Native header crash** (iPhone'da 4b/4c bosqichlari bilan ajratilgan): native Stack header o'rniga
  `src/ui/AppHeader.tsx` (JS header). Oddiy rejimda ilova ochildi.
- Diagnostika rejimlari saqlangan: `EXPO_PUBLIC_SAFE_MODE=1`, `EXPO_PUBLIC_STARTUP_STAGE=1..6 / 4a..4e`.

### 6. Professional MVP — 1-bosqich: audit va muhim xatolar ✅
- **Tasdiqlash ekranidagi mijoz xatosi** (kod bilan isbotlangan): tanlangan mijoz faqat qidiruv
  natijasidan topilardi — qidiruv o'zgarsa, ekranda ko'rinmay qolib, savdo baribir o'sha mijozga
  yozilardi. Endi tanlangan mijoz alohida yuklanadi, doim ko'rinadi; mijoz o'zgarsa tasdiq belgisi
  qayta so'raladi; tasdiq matnida jami summa va mijoz nomi bor.
- **Saqlashdan keyingi miltillash**: `clear()` navigatsiyadan oldin "ro'yxat yo'q" ekranini ko'rsatardi.
- **Xato xabarlari**: xom SQLite matni o'rniga tushunarli xabar + "hech narsa saqlanmadi" + keyingi qadam
  (`src/features/saveErrors.ts`).
- Yangi testlar (`__tests__/edge-cases.test.ts`, 13 ta): 2-qator yozilayotganda xato → hech narsa
  saqlanmaydi va qayta urinish ishlaydi; parallel ikki marta bosish → bitta savdo; maksimal qiymatlar;
  chegaradan oshgan/manfiy/bo'sh qiymatlar; tahrirlash va tasdiq qoidalari; xato xabarlari.

### 7. MVP missiyasi — A, B, C, D, F (commit qilinmagan) ✅
- **A:** bazaviy holat qayta tekshirildi (testlar, typecheck, export). Diagnostika rejimlari saqlangan;
  oddiy ishga tushirish ularga bog'liq emas (env o'zgaruvchisi bo'lmasa `AppRoot`).
- **B:** tarix ↔ tafsilot ↔ qatorlar yig'indisi ↔ mijoz balansi mosligi testi (4 savdo, 2 mijoz + umumiy).
- **C — qoralama:** sxema v2 `drafts` jadvali (ledger'dan alohida). Avtomatik saqlash (400 ms,
  fonga o'tganda darhol), ilova qayta ochilganda tiklash, bosh ekranda "Tugallanmagan hisob" kartasi
  (davom ettirish / tasdiqlab o'chirish), buzilgan qoralama yiqitmaydi. Savdo saqlanganda qoralama
  o'sha tranzaksiyada o'chadi; kechikkan avtomatik saqlash uni tiriltirmaydi. Qayta tahlil qo'lda
  qilingan tahrirlarni ogohlantirishsiz o'chirmaydi; bo'sh tahlil natijasi qoralamani almashtirmaydi.
- **D — bekor qilish:** sxema v3 `sale_reversals` (append-only; `ledger_entries` CHECK'ini o'zgartirish
  jadvalni qayta qurishni talab qilgani uchun alohida jadval). UNIQUE(sale_id) — ikki marta bekor
  qilib bo'lmaydi; client_op_id — idempotent; trigger summa va mijoz savdoga tengligini majburlaydi;
  sabab majburiy. Balans, kunlik savdo va mijoz savdolari soni bekor qilishni hisobga oladi; tarixda
  "BEKOR QILINGAN" belgisi; tafsilotda sabab va sana.
  ⚠ "Boshqa foydalanuvchining savdosini bekor qila olmaslik" — server yo'q, bitta qurilma/foydalanuvchi;
  server tomondagi kafolat F rejasida.
- **F:** `docs/SERVER_XAVFSIZLIK.md` — 001 migratsiyasida KRITIK S1 (istalgan foydalanuvchi istalgan
  do'konga a'zo bo'la oladi), M9/S2, S3–S5; Supabase arxitektura rejasi; ruxsat talab qiladigan qadamlar.
- Yangi testlar: `__tests__/drafts-reversal.test.ts` (13 ta) — v1→v3 migratsiya ma'lumot saqlanishi,
  qoralama tiklash/ustiga yozish/o'chirish/buzilgan/parallel, bekor qilish (balans, idempotentlik,
  parallel, trigger, append-only), oqim mosligi.

### 8. Professional MVP yangilanishi (commit qilinmagan) ✅
- **Dizayn tizimi** (`src/ui/theme.ts`, `src/ui/components.tsx`): yagona ranglar, matn shkalasi (`type`),
  soya, radius, 48+ pt bosish maydoni; yangi `Badge`, `StatTile`, `ChipGroup`, `Screen`
  (KeyboardAvoidingView + header balandligi), `ListRow` holat belgisi va chizilgan summa bilan.
  Ikonka paketi qo'shilmagan (`@expo/vector-icons` o'rnatilmagan — ruxsat bilan qo'shish mumkin).
- **Dashboard** (`src/app/index.tsx`): bugungi savdo va soni, so'nggi 7 kun, "mijozlarga savdo"
  (aniq: qarz EMAS — to'lov hisobi yo'q), oxirgi 5 savdo, tugallanmagan hisob, tezkor amallar.
  Barchasi `ledger.dashboard()` — bitta qoida: savdolar minus bekor qilinganlar.
- **Tarix** (`src/app/sales/index.tsx`): qidiruv (mijoz/mahsulot), davr (bugun/7/30 kun/hammasi),
  holat (faol/bekor qilingan), saralash (yangi/eski/summa), yashirilganlarni ko'rsatish, xulosa qatori.
- **Tarixdan yashirish** (sxema v4, `sale_visibility_events`, append-only): moliyaviy ta'siri yo'q,
  qayta ko'rsatish mumkin, audit izi saqlanadi, idempotent. Bekor qilishdan aniq ajratilgan.
  Ilova bitta foydalanuvchili (auth yo'q) — foydalanuvchi bo'yicha yashirish serverda (SERVER_XAVFSIZLIK.md).
- **Savdo tafsiloti**: savdo raqami (#XXXXXXXX), holat belgisi, jami, qatorlar, "Amallar" bo'limi
  (yashirish/ko'rsatish va bekor qilish, ikkalasi ham tasdiq dialogi bilan, farqi matnda tushuntirilgan).
- **Kiritish**: qo'llab-quvvatlanadigan formatlar namunasi va birliklar ro'yxati.
- **Mijozlar**: tafsilotda yashirilgan/bekor qilingan savdolar belgisi bilan; formadan saqlanmagan
  o'zgarishlar bilan chiqishda ogohlantirish (`usePreventRemove`).
- **Klaviatura**: tasdiqlash, kiritish, tekshirish, mijoz formasi — offset haqiqiy header balandligidan.
- Yangi testlar: `__tests__/history.test.ts` (11 ta) — qidiruv, sana, holat, saralash, SQL in'ektsiya,
  yashirishning summalarga ta'siri yo'qligi, idempotentlik, audit izi, dashboard, v3→v4 migratsiya, format.

### 9. To'liq mobil MVP (commit qilinmagan) ✅
- **Navigatsiya:** doimiy pastki tablar (`src/app/(tabs)/`, `expo-router/js-tabs` — native modulsiz):
  Bosh sahifa, Savdolar, Yangi savdo, Mijozlar, Menyu. Tafsilot ekranlari root Stack'da (JS `AppHeader`).
  Ikonkalar — matn belgilari (ikonka paketi o'rnatilmagan).
- **Sxema v5** (non-destructive): `products`, `payments` (append-only), `payment_voids` (bir marta),
  `settings`.
- **To'lov va qarz:** qarz = savdo (bekor qilinganlarsiz) − to'lovlar (bekor qilinganlarsiz) — bitta SQL
  ifodasi (`OUTSTANDING_SQL`) mijoz ro'yxati, tafsiloti, dashboard va to'lov tekshiruvida. To'lov qarzdan
  oshmaydi (avans qo'llab-quvvatlanmaydi — hujjatlashtirilgan qoida), idempotent, parallel ikki to'lov
  qarzdan oshirmaydi; xato to'lov sabab bilan bekor qilinadi. Savdo to'lovdan keyin bekor qilinsa —
  "ortiqcha to'lov" (manfiy qoldiq) ochiq ko'rsatiladi. Umumiy xaridor savdolari qarz hisoblanmaydi.
- **Davr savdosi qoidasi yagona:** shu davrda qilingan va bekor qilinmagan savdolar (dashboard,
  hisobot, tarix filtri — barchasi bugun bilan 7 kun).
- **Qo'lda kiritish:** "Yangi savdo" → "Qo'lda kiritish (matnsiz)" → bo'sh qatordan; katalogdan tez
  tanlash (nom, birlik, narx to'ldiriladi). Matnli tahlil saqlangan.
- **Mahsulotlar:** qo'shish/tahrirlash/o'chirish, nom takrorlanmaydi; savdo qatorlari nusxa saqlaydi —
  narx o'zgarishi tarixga ta'sir qilmaydi (test bilan).
- **Hisobotlar:** bugun, 7 kun, kunlar bo'yicha (faol), bekor qilinganlar, to'lovlar, qarzdorlar.
- **Sozlamalar:** do'kon nomi/telefon/manzil, versiya, platforma, sxema versiyasi, ma'lumot joylashuvi.
- **Mijozlar:** ro'yxatda qarz va holat belgisi; tafsilotda Savdo / To'langan / Qarz alohida,
  to'lov qabul qilish, to'lovlar tarixi, savdolar.
- Yangi testlar: `__tests__/payments-catalog.test.ts` (13 ta).

### 10. Ikonkalar va backend asosi (commit qilinmagan) ✅
- **Ikonkalar:** `@expo/vector-icons` (SDK 58 ga mos, Expo Go'da bor) — `src/ui/Icon.tsx` (Ionicons).
  Tablar: home / receipt / add / people / grid (faol — to'liq, nofaol — kontur), header orqaga/yopish,
  banner, bo'sh holat, ro'yxat strelkasi va tugmalar. Barcha matn belgilari va emoji'lar olib tashlandi.
- **Server xavfsizligi (`supabase/migrations/003_security_and_mvp_rpc.sql`):** S1 (istalgan do'konga
  a'zo bo'lish), S2 (RLS orqali "posted" yozish), S3 (cheksiz do'kon yaratish), S4 (search_path) tuzatildi;
  anon'ning funksiya huquqlari olib tashlandi (lokal testda topilgan). RPC'lar: `create_shop`, `post_sale`
  (server qayta hisoblaydi, mos kelmasa rad), `reverse_sale`, `record_payment` (qarzdan oshmaydi, mijoz
  qatori qulflanadi), `void_payment`. Append-only: to'lovlar, bekor qilishlar, savdo qatorlari.
- **Mobil backend qatlami (`src/backend/`):** tiplangan `CloudClient`, xato xaritasi (tarmoq/auth/ruxsat/
  konflikt/validatsiya), Supabase Auth (email+parol, sessiya AsyncStorage'da tiklanadi), "Hisob va bulut"
  ekrani, bir tomonlama push (`sync.ts`, lokal sxema v6 `sync_log`). Bulut sozlanmagan — "Lokal rejim".
- Yangi testlar: `__tests__/sync.test.ts` (14), `supabase/tests/10_security_isolation.test.sql` (60 tekshiruv).
- **Haqiqiy Supabase'da sinalmagan** — loyiha/kalit yo'q (docs/BACKEND_SETUP.md).

### 11. Auth tuzatishlari va menyu (commit qilinmagan) ✅
- **"localhost недоступен" sababi (kodda tasdiqlangan):** `signUp` `emailRedirectTo`siz chaqirilgan va ilovada
  callback marshruti yo'q edi → Supabase standart Site URL (localhost) ga yo'naltirgan.
- Tuzatish: PKCE (`flowType: 'pkce'`), `emailRedirectTo = Linking.createURL('auth/callback')`,
  yangi `src/app/auth/callback.tsx` (code / token / token_hash / xato havolalari, bir martalik qayta ishlash),
  `resend` (xatni qayta yuborish), mavjud hisobni aniqlash (identities bo'sh), o'zbekcha xatolar
  (`src/backend/authLinks.ts`, 14 test), ikki marta yuborishdan himoya, do'kon yuklanayotganda formani ko'rsatmaslik.
- Menyudan «Ma'lumotlar qayerda saqlanadi» kartasi olib tashlandi; bosh sahifadagi eskirgan izoh o'rniga
  haqiqiy bulut holati (`SyncStatus`: ulanmagan / kirilmagan / N ta yuborilmagan / hammasi yuborilgan).
- 003 qayta ishga tushirishga xavfsiz (DROP IF EXISTS + CREATE), lokal testda ikki marta qo'llanadi.
- `.env` tekshiruvi: kalit `yenxvancoduazzpkuqmk` loyihasiga tegishli, `ftqhdcphiwyarbgibryn` uni rad etadi
  (docs/BACKEND_SETUP.md, 0-bo'lim).

### 12. Yakuniy MVP bosqichi (commit qilinmagan) ✅
- **Jonli Supabase (`yenxvancoduazzpkuqmk`) — faqat o'qish tekshiruvi (anon, public kalit):** `create_shop`,
  `post_sale`, `reverse_sale`, `record_payment`, `void_payment` aynan mobil ishlatadigan parametr nomlari bilan
  mavjud va anon uchun yopiq (42501). Jadvallar anon uchun yopiq. Foydalanuvchi yaratilmagan, ma'lumot yozilmagan.
- **Avtomatik sinxronlash (`src/backend/SyncProvider.tsx`):** kirish/do'kon yuklanganda, ilova faollashganda,
  har bir savdo/bekor qilish/to'lov/to'lov bekor qilishdan keyin va navbat bo'lsa davriy; bir vaqtda bitta push;
  tarmoq xatosida 30s→5 daq, ruxsat/validatsiya xatosida avtomatik to'xtaydi; 20 s so'rov timeout;
  oxirgi vaqt va xato SQLite'da saqlanadi. Savdo tafsilotida "Bulutda saqlangan / hali yuborilmagan".
- **Mijozni o'chirish:** faqat savdo/to'lov tarixi yo'q va bulutga yuborilmagan bo'lsa.
- **RPC kontrakt testi:** 003 dagi SQL imzolari ↔ mobil argumentlar; 001 formulasi ↔ core.
- Testlar: core 166, mobile 122, server (lokal PG) 60, expo-doctor 20/20, Android/iOS export ✅.

### 13. Mobil MVP yakunlash (web reliz `591c0fa` dan keyin; commit qilinmagan) ✅
- **Ikki tomonlama ma'lumot almashinuvi:** web bazaga to'g'ridan-to'g'ri yozadi, mobil esa faqat push qilardi —
  web'dagi yozuvlar mobilda ko'rinmasdi. Qo'shildi: `src/backend/pull.ts` (faqat qo'shish; har savdo core formulasi
  bilan qayta tekshiriladi; lokal moliyaviy yozuv o'chirilmaydi/ustidan yozilmaydi; mijoz/mahsulot faqat lokal
  yuborilmagan tahrir bo'lmasa yangilanadi). Sinxronlash sikli: push → pull.
- **Push tuzatildi:** mijoz/mahsulot faqat yangi yoki tahrirlangan bo'lsa yuboriladi (avval har safar hammasi
  upsert qilinib, web'da o'chirilgan mijozni tiriltirar edi).
- **Chiqish faqat shu qurilmadan:** `signOut({ scope: 'local' })` (standart 'global' barcha qurilmalarni chiqarar edi).
- Hisobotlarda davr filtri (bugun / 7 / 30 kun); sozlamalarda bulut holati.
- Testlar: `__tests__/pull.test.ts` (8), sync.test yangilangan qoidaga moslandi (+1 test).

### 14. Yakuniy QA (commit qilinmagan) ✅
- Jonli sxema tekshiruvi (anon, faqat o'qish): pull'dagi 7 ta `select` (ustunlar, `::text`, `order=id`) jonli bazada
  to'g'ri tahlil qilinadi (42501, nazorat — noto'g'ri ustun 42703).
- **Tuzatildi — boshqa hisob ma'lumoti aralashishi:** bir telefonda boshqa hisobga kirilganda lokal savdolar
  boshqa do'konga yuborilardi. Endi lokal baza birinchi sinxronlangan do'konga bog'lanadi (`ensureShopBinding`).
- **Tuzatildi — o'chirish/arxiv:** web'da o'chirilgan mijoz va o'chirilgan/arxivlangan mahsulot telefondan
  xavfsiz qoidalar bilan olib tashlanadi (sinxronlangan, tahrirlanmagan, mijozda tarix yo'q; bo'sh javobda — yo'q).
- **Tuzatildi — holat:** bulut yozuvlari rad etilganda «barcha yozuvlar yuborilgan» ko'rsatilmaydi; push'dagi
  yozuvga xos xatoda pull baribir bajariladi.
- Demo: `docs/DEMO_ITPARK.md`. APK yaratilmadi (Android SDK / eas.json yo'q).

---

## Ishlashi isbotlanmagan (qurilmada sinov kerak)
- Web'da kiritilgan yozuvlarning mobilda paydo bo'lishi (jonli bulut, kirilgan foydalanuvchi bilan).
- Jonli Supabase bilan to'liq oqim (ro'yxatdan o'tish → tasdiqlash → do'kon → push) — email tasdiqlash talab qilinadi.
- Ro'yxatdan o'tish → email havolasi → ilovaga qaytish (Supabase Dashboard URL sozlamasi talab qilinadi).
- Yangi ikonkalar ko'rinishi (iOS/Android), "Hisob va bulut" ekrani (lokal rejim xabari).
- Pastki tablar (iOS home indicator, Android tizim navigatsiyasi va orqaga tugmasi), barcha yangi ekranlar.
- To'lov qabul qilish / bekor qilish, mahsulot katalogi, hisobotlar, sozlamalar.
- Yangi dizayn ko'rinishi (kichik ekran, notch, kontrast), dashboard, tarix filtrlari, yashirish.
- Mijoz formasidan chiqish ogohlantirishi (iOS swipe-back, Android orqaga tugmasi).
- Qoralama: kiritishdan keyin ilovani yopish → qayta ochish → "Tugallanmagan hisob" → davom ettirish.
- Savdoni bekor qilish UI (sabab, tasdiq, balans va tarixdagi belgi).
- Eski (v1) bazasi bor iPhone'da v3 migratsiyasi (Node testida isbotlangan).
- iPhone'da to'liq savdo oqimi: kiritish → tekshirish → tasdiqlash → saqlash → tarix → tafsilot.
- Ilovani yopib qayta ochganda ma'lumot saqlanishi (Node testida isbotlangan, qurilmada emas).
- Mijoz yaratish (modal) → tasdiqlash ekraniga qaytish.
- Klaviatura ochilganda tekshirish ekranining pastki tugmasi (`keyboardVerticalOffset={90}`).
- JS header: Orqaga/Yopish, SafeArea, Android orqaga tugmasi.
- Android'da umuman sinalmagan.

---

## Keyingi bosqichlar (ustuvorlik bo'yicha)

| # | Bosqich | Holat |
|---|---------|-------|
| 2 | iPhone'da to'liq oqim + qoralama + bekor qilish sinovi, topilgan xatolarni tuzatish | ⏳ |
| 3 | Server xavfsizlik migratsiyalarini lokal PostgreSQL'da yozish va sinash (S1–S4, post_document) | ⏳ ruxsat |
| 4 | Mijozlar va tarix: tarixda qidiruv/sana filtri, tasdiqlash ekranida 6 tadan ortiq mijozni ko'rsatish | ⏳ |
| 5 | UI/UX, iPhone/Android mosligi, klaviatura | ⏳ |
| 6 | Yakuniy test va qurilma yo'riqnomasi | ⏳ |

## MVP'dan oldin hal qilinishi kerak bo'lgan muhim ishlar
1. Cloud sync / Supabase: ma'lumot faqat telefonda — telefon yo'qolsa, ledger yo'qoladi.
2. Server tomoni `post_document` RPC, RLS tuzatishlari (MUAMMOLAR M9), PostgreSQL ikkinchi hisob (TZ DoD).
3. AI parsing: ulanmagan (UI buni da'vo qilmaydi); hozir faqat deterministik parser.
4. Autentifikatsiya: yo'q.
5. ~~Savdoni bekor qilish~~ — lokal qilindi (D); server tomoni F rejasida.
7. KRITIK: `001` migratsiyasidagi S1 (tenant izolyatsiyasi) — serverga qo'llashdan oldin tuzatilishi shart.
6. `002_test_calculations.sql` dagi soxta PASS xatosi (M10).

---

## Tashqi bog'liqliklar

| Xizmat | Holat | Ta'sir |
|--------|-------|--------|
| Supabase loyiha | Yo'q | Cloud sync va server hisobi yo'q |
| AI API kaliti | Yo'q | Faqat deterministik parser |
| Vercel | Sozlanmagan | Web deploy yo'q |
| Android SDK / adb | Bu kompyuterda yo'q | Android dev build qilinmagan |
