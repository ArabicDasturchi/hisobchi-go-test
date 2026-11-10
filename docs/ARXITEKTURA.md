# Hisobchi Go — arxitektura (v2)

> **03.11.2026 eslatma:** bu reja 28.10 da yozilgan. Joriy koddan farqlar: hisobning A yo'li telefonda `packages/core` (TS), B yo'li Postgres SQL (`post_sale`); veb panel Next.js (`apps/web`); AI hali ulanmagan. Joriy holat va navbat: [TZ-MVP.md](TZ-MVP.md), [VAZIFALAR-ICE.md](VAZIFALAR-ICE.md). Ziddiyat bo'lsa ular ustun.

Holat: qurishga tayyor reja. Oxirgi yangilanish: 28.10.2026. **Mobil-birinchi:** asosiy mahsulot Android va iOS ilovasi; savdogarga alohida kompyuter kerak emas. Veb (PC) versiya shu kodning o'zidan chiqadi.
Belgilar: **[QAROR]** — shu bilan quramiz. **[SINASH]** — tanlov sinov natijasiga bog'liq. **[TAXMIN]** — o'lchanmagan.

---

## 0. Bir qarashda

Oqim: **kiritadi → tushunadi → tasdiqlaydi → hisoblaydi → saqlaydi → natija.**

| Ishtirokchi | Qiladi | Qilmaydi |
|---|---|---|
| AI | Matnni qatorlarga ajratadi, tovarni nomzodlardan tanlaydi | Hisoblamaydi, bazaga yozmaydi, tovar to'qimaydi |
| Savdogar | Tasdiqlaydi, sariq qatorni hal qiladi | Qo'lda hisoblamaydi |
| Kod | Sonni o'qiydi, hisoblaydi (ikki yo'l), yozadi | Taxmin qilmaydi |

## 1. Texnologiya [QAROR]

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Ilova | **Expo (React Native) + TypeScript**: bitta kod → Android, iOS, veb (PC) | Haqiqiy mobil ilova; kamera, mikrofon, mahalliy xotira, Bluetooth chop etish ishonchli. Alohida PC ilova kerak emas |
| Mahalliy baza (telefonda) | SQLite (`expo-sqlite`) | Oflayn navbat va tez ishlash |
| Server mantig'i | Supabase Edge Functions (TypeScript) | AI, STT, hisob (A yo'li). Kalitlar faqat shu yerda |
| Baza | Supabase (Postgres) | Auth, Storage, RLS, SQL funksiya (B yo'li) |
| Veb versiya | `expo export -p web` → Vercel | Bepul ommaviy havola, PC uchun |
| Mobil build | Expo EAS (Android APK/AAB, iOS) | Do'konga chiqarish. Google Play va Apple ishlab chiquvchi hisoblari pullik (summani tekshirish kerak) |
| AI (tushunish) | Claude API, strukturalangan JSON chiqish | Server tomonda |
| Ovoz → matn | Provayder interfeysi orqasida: Aisha / Muxlisa / UzbekVoice **[SINASH]** | 9-bo'limdagi sinov bilan tanlanadi |
| Rasm → matn | Claude ko'rish (vision) yoki OCR **[SINASH]** | Qo'lyozma uchun sinov kerak |

Provayderlar `SttProvider` va `VisionProvider` interfeysi orqasida turadi, almashtirish bitta fayl.

### Repo tuzilmasi (monorepo)

```
apps/mobile/        Expo ilova (Android, iOS, veb)
packages/core/      Hisob (calc), parseUzNumber, turlar, tekshiruvlar. Mobil ham, server ham shuni ishlatadi
supabase/
  migrations/       Jadvallar, RLS, calc_document() SQL funksiyasi
  functions/        Edge Functions: parse-capture, post-document, stt, ...
docs/
```

`packages/core` — yagona haqiqat manbai: bir xil hisob kodi telefonda (ko'rsatma uchun) va serverda (A yo'li) ishlaydi. B yo'li SQLda alohida yoziladi.

### Mobil imkoniyatlar (suhbatlardan)

- **Kamera:** spiska va nakladnoy rasmi; shtrix/QR skaner (Husanboy aka taklifi).
- **Chop etish:** telefondan Bluetooth printerga (Muhammad Sodiq aka muammosi) **[SINASH: printer modeli]**.
- **Mikrofon:** spiskani ovoz bilan aytish.
- **Qulf:** ilovaga PIN/barmoq izi (telefon boshqa odamda bo'lsa ham ma'lumot ochilmasin).

## 2. Ma'lumotlar modeli (2-muammo hal)

Qoida: **har jadvalda `shop_id`** (savdogar do'koni). Pul — butun so'm (`bigint`). Miqdor — **mini-birlikda butun son** (`qty_milli`: 1 dona = 1000, 2,5 kg = 2500). Suzuvchi nuqta yo'q.

| Jadval | Mazmuni |
|---|---|
| `shops` | Do'kon/savdogar (ijarachi) |
| `memberships` | `user_id`, `shop_id`, `role` (owner, staff) |
| `products` | `name`, `base_unit`, `current_price`, `cost_price` (tan narx, ixtiyoriy) |
| `product_units` | `product_id`, `unit` (quti), `factor_milli` (1 quti = 12 000 dona) |
| `product_aliases` | `product_id`, `alias`, `alias_norm` (sinonim, lotin/kirill, imlo variantlari) |
| `price_history` | `product_id`, `price`, `valid_from` (faqat o'zgarganda qator qo'shiladi) |
| `customers` | `name`, `phone` (ixtiyoriy), `note` |
| `captures` | Xom kirish: ovoz/rasm/matn, `status`, `raw_text`, `file_path`, `device_id`, `client_op_id` |
| `documents` | Sotuv/kirim hujjati: `type` (sale, purchase), `customer_id`, `status`, `total`, `discount`, `client_op_id` |
| `document_lines` | `document_id`, `product_id`, `unit`, `qty_milli`, `unit_price`, `line_discount`, `line_total` |
| `ledger_entries` | **Qo'shiladigan jurnal** (4-bo'lim): pul va tovar harakati |
| `audit_log` | Kim, qachon, nima qildi |

Birliklar: sotuv qatori `unit` ni saqlaydi, ombor/qoldiq hisobida `factor_milli` orqali asosiy birlikka keltiriladi.
Chegirma: qator darajasida (so'm) va hujjat darajasida (so'm). Foiz kiritilsa, kod so'mga aylantirib yozadi.
Yaxlitlash qoidasi **[QAROR]**: `line_total = (qty_milli × unit_price + 500) ÷ 1000` (butun bo'lish), har qator alohida, keyin qo'shiladi.

## 3. Hujjat holatlari

`captured → parsed → draft → confirmed → posted`, va `posted → reversed` (faqat teskari yozuv bilan).

- `draft` gacha hech narsa ledgerga tushmaydi.
- `confirmed` — savdogar bosdi. Server hisoblaydi (5-bo'lim). Mos kelsa `posted`, kelmasa `blocked` (savdogarga ko'rsatiladi, yozilmaydi).

## 4. Nasiya, qarz va jurnal (2-muammo hal)

`ledger_entries`: `id`, `shop_id`, `kind` (sale, payment, purchase, stock_in, stock_out, adjustment), `customer_id`, `product_id`, `amount` (so'm, +/−), `qty_milli` (+/−), `document_id`, `reverses_id`, `created_by`, `created_at`.

- **Mijoz qoldig'i = `SUM(amount)` shu mijoz bo'yicha.** Alohida maydonda saqlanmaydi, har doim jurnaldan hisoblanadi (view). Qoldiq "ketib qolishi" mumkin emas.
- **To'lov** (mijoz qarzdan bir qismini berdi) — `payment` yozuvi. Qisman to'lov tabiiy ishlaydi.
- Oldi-berdi ko'rinishi (Eski / Tovar / Jami / Berilgan / Qoldi): view `customer_statement(customer, from, to)`. PDF/rasm sifatida mijozga yuborish keyin.
- **O'zgarmaslik:** `ledger_entries` va `posted` hujjatlarga `UPDATE`/`DELETE` huquqi **yo'q** (rol darajasida) + trigger xato beradi. Xatoni tuzatish: `reverses_id` bilan teskari yozuv + yangi to'g'ri yozuv. Tarix saqlanadi.
- **Tovar qoldig'i** = `SUM(qty_milli)` jurnaldan. Kun oxiri tekshiruvi: `qoldiq = kirim − chiqim`, farq bo'lsa savdogarga ro'yxat ko'rsatiladi.

## 5. Hisob va "AI noto'g'ri son o'qisa" himoyasi (1-muammo hal)

Muammo: AI "13 000" ni "18 000" deb o'qisa, ikki hisob ham to'g'ri qo'shib xato jami beradi. Shuning uchun himoya **hisobdan oldin** ham bor. 6 ta to'siq:

1. **Sonni AI emas, kod o'qiydi.** AI faqat matn bo'lagini ajratadi ("o'n uch ming", "13 ming", "13000"). O'zbekcha son so'zlarini `parseUzNumber()` (deterministik kod, testlangan) songa aylantiradi. AI bergan son va kod o'qigan son farq qilsa, qator sariq.
2. **Narx tarixi bilan solishtirish.** Tovarning oxirgi narxidan ±25% (sozlanadi) dan chetga chiqsa, qator sariq: "odatda 13 000, hozir 18 000, tekshiring".
3. **Tasdiqlash ekrani eng ishonchli to'siq.** Har qatorda manba bilan yonma-yon: eshitilgan/rasmdagi matn parchasi va tushunilgan son. Rasm bo'lsa, qator rasmning shu joyi bilan ko'rsatiladi. Katta raqam shrifti.
4. **O'qib berish (ixtiyoriy).** "Chirmoq, o'n dona, o'n uch ming" — ovoz bilan qaytarib o'qiladi, savdogar eshitib tasdiqlaydi.
5. **Savdogar aytgan jami bilan solishtirish.** Spiska oxirida "jami 385 ming" aytilsa/yozilsa, kod hisoblagan jami bilan solishtiriladi. Farq bo'lsa to'xtaydi.
6. **Ikki STT bo'lsa** (sinov natijasiga qarab): raqam raqamlari ikki provayderda farq qilsa, sariq.

**Hisobning o'zi — ikki haqiqatan mustaqil yo'l** (kod bilan bir xil formula emas, boshqa muhit):

| Yo'l | Qayerda | Qanday |
|---|---|---|
| A | Server, TypeScript, `BigInt` | Qator bo'yicha yaxlitlab qo'shadi |
| B | Postgres SQL funksiyasi `calc_document(doc_id)` | Xuddi shu qoidani SQLda alohida yozilgan |

`A ≠ B` bo'lsa hujjat `blocked`, ledgerga yozilmaydi. Telefondagi hisob (ko'rsatma uchun) ham serverdagi natija bilan solishtiriladi. Testlar: namuna 10×13 000 + 5×15 000 + 20×9 000 = **385 000**, kasr miqdor, chegirma, 1 so'm yaxlitlash holatlari.

**Sariq qator turlari:** tovar topilmadi · bir nechta mos tovar · narx kutilmagan · son ishonchsiz · birlik noaniq · miqdor yo'q. Sariq qator hal qilinmaguncha "Tasdiqlayman" tugmasi ishlamaydi.

## 6. Tovarni moslash (5-muammo hal)

Pipeline (AI tovar to'qimaydi, faqat bazadagi nomzodlardan tanlaydi):

1. **Normallashtirish:** kichik harf, apostrof variantlari (`'`, `ʻ`, `‘`), kirill ↔ lotin, ortiqcha bo'shliq.
2. **Aniq moslik:** `product_aliases.alias_norm` bilan teng → tamom.
3. **O'xshashlik:** Postgres `pg_trgm`, chegara 0,6 dan yuqori top-5 nomzod.
4. **AI tanlovi:** nomzodlar ro'yxati AIga beriladi; u bittasini tanlaydi yoki "yo'q" deydi. Ro'yxatdan tashqari nom qaytara olmaydi (chiqish sxemasi bilan cheklangan).
5. **Noaniq bo'lsa** — sariq, savdogar tanlaydi. Tanlov `product_aliases` ga yangi sinonim bo'lib yoziladi, keyingi safar o'zi topadi.
6. **Yangi tovar:** "yangi tovar" yorlig'i bilan sariq; savdogar narx yozsa mahsulotlar ro'yxatiga qo'shiladi (kun oxirida tartib raqam bilan ham bo'ladi).

## 7. Oflayn va sinxronizatsiya (6-muammo hal)

- Har amalga mijoz tomonda **`client_op_id` (UUID)** beriladi. Server shu id bilan takroriy yuborishni rad etadi (idempotent). Ikki marta yuborilsa, ikki marta yozilmaydi.
- Jurnal faqat qo'shiladigan bo'lgani uchun **ikki qurilma to'qnashmaydi**: ikkala yozuv ham saqlanadi, qoldiq `SUM` dan chiqadi.
- Tahrirlanadigan ma'lumotlar (tovar nomi, narx, mijoz): `version` raqami; eski versiya bilan yozilsa server rad etadi, ilova "yangilab qaytadan urining" deydi. Narx o'zgarishi `price_history` ga qator bo'lib tushadi.
- **Oflayn rejim:** telefondagi SQLite'da mahsulotlar keshi, mijozlar va navbat. Matn bilan qo'lda kiritish va mahalliy hisob ishlaydi. Ovoz/rasm tahlili (AI) internet talab qiladi: oflayn bo'lsa "internet kelganda tahlil qilinadi" navbatiga tushadi. Hujjat navbatga `pending_sync` bilan saqlanadi.
- Internet kelganda navbat tartib bilan yuboriladi; server har birini 5-bo'lim bo'yicha qayta hisoblaydi. Mos kelmasa savdogarga "ko'rib chiqing" ro'yxati chiqadi.
- Mobil-birinchi bo'lgani uchun oflayn navbat **1-bosqichda** (MVP da yo'q, faqat onlayn).

## 8. Foydalanuvchilar va xavfsizlik (4- va 8-muammo hal)

- **Kirish:** Supabase Auth (telefon raqam + OTP yoki email; qaysi biri qulay — savdogarlar bilan sinab hal qilinadi **[SINASH]**).
- **Rollar:** `owner` — hammasi; `staff` — sotuv kiritadi, mijozlarni ko'radi, narx/tan narx/teskari yozuvni ko'rmaydi yoki qila olmaydi.
- **Ma'lumot ajratish:** har jadvalda RLS: `shop_id` foydalanuvchining `memberships` ida bo'lsagina o'qiydi/yozadi. Bir savdogar boshqasining ma'lumotini ko'ra olmaydi.
- **Kalitlar:** AI va STT kalitlari faqat server tomonda (`.env`, Supabase Edge Functions maxfiy sozlamalari). Brauzerga chiqmaydi.
- **Ovoz va rasm:** shaxsiy (private) xotirada, faqat imzolangan vaqtinchalik havola bilan. **Saqlash muddati 30 kun [QAROR]**, keyin fayl o'chadi, tushunilgan matn va hujjat qoladi.
- **Zaxira:** Supabase kunlik nusxa **[tarifga bog'liq, tekshirish kerak]** + savdogar o'zi istagan paytda CSV/Excel yuklab olishi (mijoz daftari, ledger). Bu ularning ma'lumoti ekani va ketish erkinligini ham beradi.
- **Cheklov:** AI/STT chaqiruvlariga foydalanuvchi bo'yicha kunlik limit (xarajat va suiiste'mol uchun).
- **Telefondagi ma'lumot:** mahalliy bazada faqat shu do'konning kerakli ma'lumoti; ilova qulfi (PIN/barmoq izi); chiqishda mahalliy baza tozalanadi.
- **Maxfiylik:** repoga haqiqiy mijoz ma'lumoti yoki kalit yozilmaydi.

## 9. Agentlar va aniqlikni o'lchash (9-muammo hal)

Agentlar — alohida vazifa, aniq kirish/chiqish. Hammasi serverdan chaqiriladi:

| Agent | Kirish → chiqish | MVP |
|---|---|---|
| Spiska agenti | matn/ovoz/rasm → qatorlar `{matn bo'lagi, tovar nomi, miqdor matni, narx matni}` | ha |
| Moslovchi | qator + top-5 nomzod → tanlov yoki "yo'q" | ha |
| Kirim agenti | nakladnoy rasmi → kirim qatorlari | yo'q |
| Ombor nazoratchisi | kun oxiri qoldiq tekshiruvi | yo'q |
| O'rnatish agenti | eski Excel/rasmdan boshlang'ich baza | yo'q |
| Xabar agenti | mijozga Telegram/SMS | yo'q |

**Sinov to'plami (benchmark) [QAROR]:** 100 ta haqiqiy spiska (savdogar ruxsati bilan, shaxsiy ma'lumotsiz): ~30 ovozli, ~30 rasm (qo'lyozma), ~40 matn. Har bir spiskaning to'g'ri javobi qo'lda yoziladi.

O'lchovlar va pilotga chiqish chegarasi **[TAXMIN, sinovdan keyin tuzatiladi]**:

| O'lchov | Maqsad |
|---|---|
| Son (miqdor, narx) to'g'ri o'qilishi | ≥ 95% |
| Tovar to'g'ri moslanishi | ≥ 90% |
| **Jimgina xato** (noto'g'ri, lekin sariq emas) | ≤ 1% qator |
| Sariq qator ulushi | ≤ 25% (ko'p bo'lsa foydalanish noqulay) |
| Bir spiska uchun savdogar vaqti | qo'lda hisoblashdan qisqa |

Eng muhimi — "jimgina xato". Aniqlik 100% bo'lmasligi mumkin, lekin xato **sariq bilan ushlanishi** kerak. Provayder tanlovi (Aisha / Muxlisa / UzbekVoice, Claude ko'rish / OCR) shu to'plamda qiyoslanadi.

## 10. Xarajat (7-muammo uchun) [TAXMIN]

Hozir faqat bitta manbali raqam bor: Aisha STT ~425 so'm/daqiqa (loyiha hujjatida yozilgan, rasmiy narx tekshirilmagan). AI chaqiruv narxi va rasm tahlili narxi **o'lchanmagan**. Vazifa: 100 ta sinov spiskasida bitta spiska narxini o'lchab, savdogarning oylik to'lovi (taxminan 200 000 so'm farazi) bilan solishtirish. Narx oshib ketsa — kam chaqiruv (keshlash, qisqa audio) yoki tarif.

## 11. Bosqichlar

| Bosqich | Mazmuni |
|---|---|
| **MVP (1 kun)** | Expo ilova (veb havola + Expo Go): matn/ovoz kiritish, sariq qator, tasdiqlash, ikki yo'l hisob, mijoz daftari. Auth soddalashtirilgan |
| 1 | Auth + rollar + RLS, tovar bazasi va sinonim o'rganish, narx tarixi tekshiruvi, nasiya/to'lov, **oflayn navbat (SQLite)**, Android APK tarqatish |
| 2 | Rasm (spiska, nakladnoy), shtrix skaner, Bluetooth chop etish, CSV eksport, kun oxiri tekshiruvi, Google Play |
| 3 | Xabar agenti (Telegram/SMS mijozga), PDF oldi-berdi, o'rnatish agenti, App Store |

## 12. Ochiq savollar

- STT/OCR provayder tanlovi (9-bo'limdagi sinov).
- Kirish usuli: telefon OTP yoki email.
- Supabase tarifida kunlik zaxira bormi (tekshirish).
- Narx tarixi chegarasi 25% to'g'rimi (savdogarlar bilan sinash).
- Bluetooth printer modeli (savdogarlar qaysi printerdan foydalanadi).
- Google Play va Apple hisoblari narxi va kim ochishi.
- Veb (PC) versiya kerakli darajada qulay bo'lishi uchun qaysi ekranlar alohida moslanadi.

## Veb panel: menyu va daftar (MENYU-DAFTAR, 06.11.2026)

Menyu: **Asosiy** (Bosh sahifa, Savdolar, Qoralamalar) · **Daftarlar** (Ta'minotchilar, Mijozlar) · **Baza** (Mahsulotlar, Ombor) · Sozlamalar. To'lovlar, Qarzlar, Kirim/Chiqim daftari va Hisobotlar bo'lim emas: to'lov va qarz mijoz/ta'minotchi varag'ida, kirim va chiqim Ombor ichida (`/warehouse?tab=in|out`), hisobot `/dashboard/report` (Bosh sahifadagi tugma). Eski URL'lar yo'naltiriladi (`lib/redirects.ts`, `/books/*` — `books/[kind]/page.tsx`).

Daftar varag'i:
- **core** `packages/core/src/ledger.ts`: `ledgerRows` (qator = kun; Eski → Ostatka zanjiri; bekor qilingan qatorda qoladi, jamiga kirmaydi; ochilish qoldig'i birinchi qator va Tovar jamiga kirmaydi), `assertLedgerMatches`; `aged-debt.ts`: 30+ kunlik qarz (FIFO).
- **ikkinchi yo'l**: PostgreSQL `partner_statement` (butun davr Ostatka'si); mos kelmasa varaq yozishni to'xtatadi. SQL'ga yetib bo'lmasa core `partnerBalance` bilan mahalliy tekshiruv.
- **web**: `components/ledger/LedgerSheet.tsx` (bitta komponent, mijoz/ta'minotchi sozlamasi `lib/ledgerView.ts`), ulagichlar `CustomerLedger.tsx` / `SupplierLedger.tsx`, ma'lumot `lib/data/partnerLedger.ts` va `supplierPayments.ts`, ro'yxatlar `lib/customerBook.ts` / `lib/supplierBook.ts`. Yangi jadval va migratsiya yo'q.
- **ruxsat**: `can(role, action)` (`lib/permissions.ts`) — yagona nuqta; rollar keyin qo'shilganda faqat shu jadval o'zgaradi.

## Admin panel (ADMIN-1, 09.11.2026)

Platforma egalari (asoschilar) uchun alohida ilova `apps/admin`, do'kon egasi ilovasi (`apps/web`) bilan aralashmaydi. Faqat o'qish.
Migratsiya `011_platform_admin.sql`: `platform_admins` (bo'sh), `admin_audit` (append-only), `is_platform_admin()`, `admin_overview/shops/shop_detail/funnel/my_audit/shop_stage` (hammasi `SECURITY DEFINER`, birinchi qadamda admin tekshiruvi + audit, `anon` ga EXECUTE yo'q). Do'kon jadvallariga RLS orqali kirish ochilmaydi; admin faqat RPC natijasini (sonlar, holatlar) ko'radi. To'liq: [ADMIN.md](ADMIN.md).
Ilova `apps/admin` (Next.js, alohida Vercel loyiha, port 3100): `src/lib/api.ts` (faqat `admin_*` RPC), `src/lib/demo.ts` (demo API, bir xil interfeys), `src/proxy.ts` (sessiya + `is_platform_admin()`), `src/app/(panel)/*` (ekranlar). `npm run demo:admin` Supabase'siz ishlaydi.


## Ochiq bosh sahifa (landing, 09.11.2026)

- `apps/web/src/app/page.tsx` (`/`) va `app/maxfiylik/` — server komponentlar, kirishsiz ochiq. Komponentlar: `src/components/landing/` (`Brand`, `Hero`, `Sections`, `Footer`, `LandingPage`). Landing `Logo.tsx` ni ishlatmaydi (u klient moduli).
- Yo'naltirish: `src/lib/rootRoute.ts` (`decideLanding`, sof funksiya, testlangan) va `src/proxy.ts`. Kirgan foydalanuvchi `/` dan `/dashboard` ga o'tadi; ochiq yo'llar ro'yxati (`/`, `/maxfiylik`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`) shu faylda, boshqa sahifalar himoyalangan.
- SEO: `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx` (1200×630), sahifa metadata'si va FAQ uchun JSON-LD. Kuzatuv skripti yo'q.
- Rasmlar: `docs/ekranlar` dagi demo skrinshotlardan `node scripts/landing-images.mjs` bilan qirqilib WebP qilinadi (`public/landing/`), `next/image` orqali beriladi. Landing skrinshotlari: `scripts/landing-screenshots.mjs` → `docs/ekranlar/sayt/`.
- Aloqa: `lib/contact.ts`, env `NEXT_PUBLIC_CONTACT_TELEGRAM`, `NEXT_PUBLIC_CONTACT_PHONE` (bo'sh bo'lsa tugma yo'q).

## Asosiy oyna (yagona kiritish oynasi, 09.11.2026)
Bosh sahifa (`/dashboard`) tepasida `SaleWorkspace` ([components/sale/](../apps/web/src/components/sale/)). Qatlamlar:
- **Sof mantiq** (`apps/web/src/lib`, testlanadi, UI'siz): `translit.ts` (Kirill→Lotin qidiruv kaliti), `productSearch.ts` (`searchProductsAll`, `toggleSelection`, `applySelection`), `lineStatus.ts` (`lineStatus` ok/sariq, `summarizeLines`). Summa faqat mavjud `buildSalePlan`/`lineTotal`/`post_sale`; yangi formula yo'q.
- **Komponentlar**: `SaleComposer` (yumaloq kiritish), `SuggestionPanel` (ko'p tanlash), `SaleLineCard`, `SaleSummaryBar`, `CustomerChip`, `ConfirmSaleModal`, `SaleResultCard`.
- **Hooklar**: `useSaleSubmit` (eski /sales/new oqimi: kalitlar, qulflash, `payment_failed`, chek), `usePaymentSubmit` (To'lov amali), `useKeyboardInset` (ekran klaviaturasi).
- Hamma ma'lumot xotiradagi katalogdan (`ShopDataProvider`): takliflar uchun serverga so'rov yo'q. Saqlash faqat tasdiq oynasidagi «Saqlash» bosilganda. `/sales/new` → `/dashboard` yo'naltirish.

## Panel-3: kiritish oynasi faqat panelda (10.11.2026)
`/dashboard` = `PanelWorkspace` ([components/panel/](../apps/web/src/components/panel/)): asosiy maydon (`flex-1 overflow-y-auto`) + qotirilgan kiritish oynasi (`SaleComposer`). Amal ko'rinishlari: Savdo (sale/ komponentlari), `PayView` (To'lov olish va Ta'minotchiga to'lov), `PurchaseView` (Kirim), `NoteView` (Daftarga yozish). Menyular: `MenuSheet` (telefonda varaq, PC da menyu), `ActionMenu`, `PlusMenu`, `PartnerChip`. Sof mantiq `lib/`: `panelState.ts` (amallar, URL), `ledgerNote.ts` (erkin matn), `panelLines.ts` (kirim qatorlari). Saqlash hooklari: `useSaleSubmit`, `usePaymentSubmit` (sale/), `usePanelActions.ts` (kirim, ta'minotchi to'lovi, daftar yozuvi): hammasi mavjud RPC va bir martalik kalitlar ustida. Navigatsiya: `layout/nav.ts` (`hasComposer`, `searchPlaceholder`), `AppShell` (panelda hamburger, boshqa sahifada pastki menyu), tepada `HeaderSearch` (`?q=`). Hisobot kartochkalari: `reports/Overview.tsx` (Hisobotlar sahifasida).

### Panel-3: Tuzatish va Baza (10.11.2026)
`components/edit/` (`useRowEdit` holat mashinasi, `EditableCell`, `RowActions`/`EditableRow`) + `lib/rowEdit.ts` (tekshiruv). Ishlatiladi: Mahsulotlar (`app/(app)/products`, `lib/productsView.ts`), Ombor/Qoldiq (`components/warehouse/StockTab.tsx`, `lib/stockView.ts`; tahrir `adjust_stock` yozuvi), Mijozlar/Ta'minotchilar (`components/partners/PartnerList.tsx`), Savdolar (Bekor qilish, `lib/resale.ts` bilan Qayta yozish). Daftar varag'i (`components/ledger/LedgerSheet.tsx`) faqat o'qiladi; yozuv panelda (`/dashboard?amal=daftar&kimga=`).
