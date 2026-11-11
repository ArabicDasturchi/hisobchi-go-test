# Staging checklist: 17 ssenariyni bajarish

Sana: 11.11.2026. Asos: [STAGING-TEKSHIRUV.md](STAGING-TEKSHIRUV.md). Holat: **tayyor, bajarilmagan** — staging hali yo'q (0-bo'lim).
Production'ga tegilmaydi. Merge, production migratsiya, deploy va pullik xarid faqat Humoyunning alohida ruxsati bilan.

---

## 0. Hozir YO'Q (asoschi yaratmaguncha mavjud emas deb hisoblanadi)

| # | Kerak | Holat | Kim | Nega kerak |
|---|---|---|---|---|
| P1 | Supabase loyiha `hisobchi-go-staging` (bepul reja, production bilan bir region) | ❌ mavjud emas | Asoschi | Haqiqiy Auth, RLS, PostgREST |
| P2 | GitHub → Environments → `staging` + secrets `STAGING_SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_DB_PASSWORD`, `STAGING_SUPABASE_PROJECT_REF` | ❌ mavjud emas (#43 dagi «Staging'ga qo'llash» shu sabab hamma qadamni `skipped` qildi) | Asoschi | `migrate-staging.yml` migratsiyalarni qo'llaydi |
| P3 | Staging Auth: Redirect URLs (`http://localhost:3000/**`), Leaked password protection yoqilgan, email tasdiqlash yoqilgan. **Email:** Supabase'ning standart SMTP'si (bilishimcha, staging'da qayta tekshirilsin) faqat loyiha jamoasi a'zolariga va soatiga oz sonli xat yuboradi: test qutilari jamoa a'zosi bo'lsin yoki staging'da custom SMTP sozlansin | ❌ | Asoschi | S1, S2, S14 |
| P4 | Staging **public** URL va anon kalit (bular sir emas, brauzerga boradi) | ❌ | Asoschi beradi | Lokal web staging'ga ulanadi |
| P5 | Ikki test email qutisi (A do'kon, B do'kon) | ❌ | Humoyun | S1, S14 |
| P6 | Vercel: `ArabicDasturchi` jamoaga a'zo (preview'lar hozir bloklangan) | ❌ | Asoschi | Ixtiyoriy: preview orqali sinash. Usiz lokal ishlaymiz |
| P7 | Haqiqiy telefon (375–414px) | ❓ | Humoyun | S16 |
| P8 | MCP staging (OAuth klient, `MCP_ALLOWED_CLIENT_IDS`) | ❌ | Asoschi | S17 (ixtiyoriy; MVP uchun shart emas) |

**Service-role kaliti kerak EMAS va so'ralmaydi.** Hamma sinov oddiy foydalanuvchi sessiyasi bilan (RLS ostida).

---

## 1. Qaysi kod sinaladi

Sinov **birlashgan** kodda o'tadi (hamma PR birga), alohida PR'larda emas: savdo, kassa va bekor qilish bir-biriga bog'liq.

- Lokal integratsiya branchi `sim/merge-tartibi` (push qilinmagan): `origin/main` + #42, #48, #43, #45, #46, #47, #50, #44, #49, #51 shu tartibda.
- 11.11 tekshiruvi: 3 ta kod to'qnashuvi qo'lda yechildi (#47 `PanelWorkspace.tsx` importlari, #50 `dashboard/report/page.tsx`, #44 `sales/[id]/page.tsx`), `docs/QARORLAR.md` qatorlari birlashtirildi.
- Natija (birlashgan kod): lint ✅, typecheck core/web/mcp/admin ✅, core 242 ✅, web 479 ✅, mcp 76 ✅, admin 38 ✅, migration-guard 23 ✅, web va admin build ✅, SQL 651 PASS ✅.
- Ishga tushirish: `apps/web/.env.local` ga P4 qiymatlari, keyin `npm run dev:web`. `.env.local` gitignore'da, repoga tushmaydi.

---

## 2. Tayyorgarlik qadamlari (P1–P5 tayyor bo'lgach)

- [ ] **T1.** GitHub Actions → «Migratsiya (staging)» → Run workflow (asoschi yoki Humoyun; ruxsat bilan Claude Code GitHub REST API orqali ham ishga tushira oladi, `gh` o'rnatilmagan). Kutilgan: 001–012 qo'llandi, «up to date».
- [ ] **T2.** #43 branchi uchun staging workflow qayta ishga tushirilsin. Kutilgan: 013 qo'llandi. Supabase SQL Editor'da:
  ```sql
  select proname from pg_proc where proname in ('reverse_sale_with_payments','post_supplier_debt');  -- 2 qator
  select pg_get_constraintdef(oid) from pg_constraint where conname = 'purchase_documents_kind_check';  -- 'debt' bor
  ```
- [ ] **T3.** Supabase → Settings → API → «Reload schema» (yoki 1–2 daqiqa kutish): PostgREST yangi RPC'larni ko'rsin.
- [ ] **T4.** Supabase → Advisors (Security, Performance): yangi ogohlantirish yo'qligi. Natija yoziladi.
- [ ] **T5.** `apps/web/.env.local` (P4), `npm run dev:web` → `http://localhost:3000` ochiladi, `/setup` emas.
- [ ] **T6.** Brauzer DevTools → Network ochiq turadi (RPC chaqiruvlarini ko'rish uchun).

---

## 3. Ssenariylar

Har ssenariy uchun yoziladi: ✅/❌, sana, kim, dalil (skrinshot yoki SQL natijasi). ❌ bo'lsa to'xtaladi va [WEB-AUDIT.md](WEB-AUDIT.md) ga yangi W-raqam qo'shiladi.
SQL tekshiruvlar faqat **staging**'da, faqat `SELECT`. `:shop` — A do'kon id'si: `select id from shops where name = 'Test A';`.

### Blok A — Kirish va do'kon (W yo'q, auth hech qachon sinalmagan)

- [ ] **S1. Ro'yxatdan o'tish → email → kirish → do'kon**
  1. `/register`, A email, parol (8+ belgi, harf va raqam).
  2. Pochtadagi havolani shu brauzerda ochish → `/auth/callback` → `/onboarding`.
  3. Do'kon nomi «Test A» → «Do'konni yaratish» tugmasini tez **ikki marta** bosish.
  - Kutilgan: `/dashboard` ochiladi; `select count(*) from shops where name='Test A';` = **1**.
- [ ] **S2. Parol tiklash, chiqish, qayta kirish**
  1. Chiqish → `/forgot-password` → havola → yangi parol → kirish.
  2. Eski havolani qayta ochish.
  - Kutilgan: yangi parol bilan kirish ishlaydi; eski havolada «Havola eskirgan…» xabari.

### Blok B — Katalog va kirim (W4, W5)

- [ ] **S3. Takroriy tovar (W4, #46)**
  0. Sozlamalar → Birliklar → `kg` ni yoqish.
  1. Mahsulotlar → «Shakar», kg, 12 000 → Saqlash.
  2. Yana «shakar » (kichik harf, oxirida bo'sh joy), kg → Saqlash.
  3. «Shakar», pachka.
  - Kutilgan: 2-qadam rad etiladi («katalogda bor»); 3-qadam sariq ogohlantirish bilan saqlanadi.
  - SQL: `select name, unit from products where shop_id=:shop and lower(name) like 'shakar%';` = 2 qator (kg, pachka).
- [ ] **S4. Xato kirimda tovar yaratilmaydi (W5, #47)**
  1. Ta'minotchilar → «Rahim aka» yaratish.
  2. Panel → Amal «Kirim», Kimdan «Rahim aka» → «Un» (yangi) → birlik **kg**, soni 10, tan narx 9 000.
  3. «Berilgan summa» = 200 000 (jamidan ko'p).
  - Kutilgan: qizil «Berilgan summa jamidan ko'p» xabari, «Tasdiqlash» tugmasi **o'chiq** (bosib bo'lmaydi); `select count(*) from products where shop_id=:shop and name='Un';` = **0**.
- [ ] **S5. To'g'ri kirim (W5)**
  1. S4 ni davom ettirish: summa 50 000 naqd → Tasdiqlash.
  - Kutilgan: Ombor → Qoldiq: «Un» 10 kg; ta'minotchi qarzi 40 000.
  - SQL: `select unit from products where shop_id=:shop and name='Un';` = `kg`.
  - SQL: `select supplier_outstanding(:shop, '<rahim id>');` = 40000.
  - Kutilgan: Hisobotlar → «Kassa (naqd)» −50 000 (ta'minotchiga naqd chiqim; manfiy ko'rinishi to'g'ri).

### Blok C — Savdo, kassa (W3, W6, W10, W4)

**S5–S11 bir kunda (Toshkent vaqti) bajarilsin**: Hisobotlar «Bugun» kartalari shunga tayanadi. To'lov usuli tanlovi savdodan savdoga saqlanib qoladi: har savdoda usulni aniq tanlang.

Boshlashdan oldin: Mijozlar → «Ali» va «Vali» yaratish. «Un» narxini 12 000 qilish. **Ali qarzi S6–S11 davomida faqat shu ssenariylardan o'zgaradi** (qisman savdo Vali'da).

- [ ] **S6. Doimiy mijoz, to'liq, karta (W3, W6, W4)**
  1. Panel → Savdo, Kimga «Ali», «Un» katalogdan → soni 2 → Tasdiqlash → «To'landi», usul **Karta** → Saqlash.
  - Kutilgan: Network'da faqat **bitta** `post_sale` (`p_paid=24000`, `p_payment_method=karta`), `record_payment` **yo'q**; Ali qarzi 0; Ombor «Un» 8 kg.
  - Kutilgan: Hisobotlar → «Kassa (naqd)» o'zgarmaydi, «Karta va o'tkazma» +24 000.
  - SQL: `select product_id is not null from document_lines where document_id='<savdo id>';` = true.
- [ ] **S7. Mijozsiz, naqd (W10, W6)**
  1. Savdo, Kimga «Mijozsiz (naqd)», «Un» 1 → «To'landi», Naqd → Saqlash.
  - Kutilgan: Savdolar ro'yxatida «Mijozsiz (naqd)»; Kassa (naqd) +12 000.
  - SQL: `select c.kind, p.method, p.amount from payments p join customers c on c.id=p.customer_id where p.client_op_id like 'sale-pay:%' order by p.created_at desc limit 1;` = `one_time | naqd | 12000`.
- [ ] **S7b. Mijozsiz 0 so'm** — erkin matnli yangi qator «Sovg'a paket», soni 1, narx 0, mijozsiz, «To'landi».
  - Kutilgan: saqlanadi, xato yo'q; `documents.customer_id IS NULL`, to'lov yo'q.
- [ ] **S8. Qisman (W3)**
  1. **Vali**, «Un» 5 (60 000) → «Qisman» 30 000 naqd → Saqlash.
  - Kutilgan: Vali qarzi 30 000; Kassa (naqd) +30 000; bitta `post_sale`. Ali qarzi o'zgarmaydi (0).

### Blok D — Bekor qilish (W1)

- [ ] **S9. To'langan savdoni bekor qilish (W1, #43, #44)**
  1. Savdolar → S6 savdosi → «Bekor qilish», sabab «Noto'g'ri narx».
  2. «Savdo bilan olingan to'lovni ham bekor qilish (24 000)» **belgilangan** holatda tasdiqlash.
  - Kutilgan: savdo «Bekor qilingan»; Ali qarzi **0** (−24 000 emas); Ombor «Un» +2; «Karta» −24 000.
  - SQL: `select count(*) from payment_voids v join payments p on p.id=v.payment_id where p.client_op_id like 'sale-pay:%';` ≥ 1.
- [ ] **S10. Qayta yozish (W1)**
  1. S9 savdosi → «Qayta yozish» → narx 11 000 → «To'landi» Karta → Saqlash.
  - Kutilgan: «Karta» = 22 000 (bir marta sanaladi); Ali qarzi 0; Ombor «Un» 2 kg.
- [ ] **S11. To'lovni qoldirib bekor qilish (W1)** (S10 dan keyin Ali qarzi 0)
  1. Yangi savdo Ali, «Un» 1 (12 000) «To'landi» naqd → bekor qilish → belgini **olib tashlash**.
  - Kutilgan: «kredit» ogohlantirishi; Ali qarzi −12 000 (kredit); to'lov faol.
  - Eslatma: kreditni qaytarish oqimi yo'q (W11, MVP'dan keyin).

### Blok E — Ta'minotchi daftari (W2)

- [ ] **S12. Ikki marta «Daftarga yozish» (W2, #43, #49)**
  1. Panel → «Daftarga yozish», Kimga «Rahim aka» → `kirim 1 000 000` → Tasdiqlash.
  2. Yana `kirim 500 000`.
  - Kutilgan: ikkalasi saqlanadi (avval 2-si `opening_balance_exists` bilan yiqilardi); daftarda «Qarz yozuvi (tovarsiz)» × 2.
  - Kutilgan: Ombor → Kirim ro'yxatida **yo'q**; varaq ostida «Hisob ikki yo‘l bilan tekshirildi (server bilan mos)» (qizil «Hisob mos kelmadi» chiqmasligi kerak).
  - SQL: `select kind, subtotal from purchase_documents where supplier_id='<rahim>' order by created_at;` → ..., `debt 1000000`, `debt 500000`.
- [ ] **S13. Qarz yozuvini bekor qilish** — daftarda 500 000 yozuvi → Bekor qilish.
  - Kutilgan: qarz 500 000 ga kamayadi.

### Blok F — Xavfsizlik va ishonchlilik

- [ ] **S14. Begona do'kon (RLS)**
  1. B email bilan boshqa brauzer yoki inkognito oynada kirish → do'kon «Test B».
  2. A do'konining savdo URL'ini ochish (`/sales/<A savdo id>`).
  - Kutilgan: «Savdo topilmadi»; B ning ro'yxatlarida A ma'lumoti yo'q.
- [ ] **S15. Tarmoq uzilishi (W3 idempotentlik)**
  1. DevTools → Network → Offline → Savdo «Saqlash» → xato, forma qulflanadi.
  2. Online → «Saqlash» ni qayta bosish (o‘sha kalit bilan yuboriladi).
  - Kutilgan: bitta savdo. SQL: `select count(*) from documents where client_op_id = '<op>';` = 1 (op Network'dan).
- [ ] **S16. Telefon (W5, umumiy)** — haqiqiy telefonda (yoki DevTools 375×812): Panel, Kirim qatori, Savdolar, Hisobotlar.
  - Kutilgan: gorizontal siljish yo'q, tovar nomi ko'rinadi.
- [ ] **S17. MCP qoralama (ixtiyoriy, P8 kerak)** — Claude → `draft_sale` → web «Qoralamalar» → Tasdiqlash.
  - Kutilgan: savdo paydo bo'ladi; OAuth token bilan to'g'ridan-to'g'ri `post_sale` → `oauth_client_forbidden`.

---

## 4. Natijalar jadvali (to'ldiriladi)

| S | Natija | Sana | Kim | Dalil / izoh |
|---|---|---|---|---|
| S1 | | | | |
| S2 | | | | |
| S3 | | | | |
| S4 | | | | |
| S5 | | | | |
| S6 | | | | |
| S7 | | | | |
| S7b | | | | |
| S8 | | | | |
| S9 | | | | |
| S10 | | | | |
| S11 | | | | |
| S12 | | | | |
| S13 | | | | |
| S14 | | | | |
| S15 | | | | |
| S16 | | | | |
| S17 | | | | |

**To'xtash qoidasi:** S6–S13 (pul va qarz) da bitta ❌ bo'lsa ham merge qilinmaydi. S16 yoki S17 ❌ bo'lsa MVP'ni to'xtatmaydi, lekin yoziladi.

---

## 5. Merge tartibi (staging S1–S15 ✅ bo'lgach, Humoyun ruxsati va asoschi bilan)

Tartib birlashgan kodda tekshirilgan (1-bo'lim). Bog'liqliklar:

| Qadam | PR | Bog'liq | Eslatma |
|---|---|---|---|
| 1 | #42 lint | — | |
| 2 | #48 lint skripti | #42 | #42 siz `main` da lint qizil |
| 3 | #43 SQL 013 | — | merge = production migratsiya (`migrate.yml`): **alohida ruxsat**; keyin schema reload |
| 4 | #45 W6 kassa | — | **asoschi 05.11 qarorini o'zgartirishni tasdiqlashi shart** (kutilmoqda) |
| 5 | #46 W4 | — | `QARORLAR.md` to'qnashadi (qatorlar birlashtiriladi) |
| 6 | #47 W5 | — | #46 bilan `PanelWorkspace.tsx` importlari to'qnashadi (ikkalasi saqlanadi) |
| 7 | #50 W3+W10 | — | #45 bilan `dashboard/report/page.tsx` (`anon` + `paymentsByMethod` ikkalasi) va `QARORLAR.md` to'qnashadi |
| 8 | #44 W1 | **#43 production'da** | #50 bilan `sales/[id]/page.tsx` (`kind !== 'one_time'` + `RefundChoice`) va `QARORLAR.md` to'qnashadi |
| 9 | #49 W2 | **#43 production'da** | to'qnashuv yo'q |
| 10 | #51 hujjatlar | — | |

To'qnashuvlarni men har PR'ni yangi `main` ga moslab yechib bera olaman (merge qilmasdan, PR branchiga push). Har biri uchun ruxsat so'rayman.
