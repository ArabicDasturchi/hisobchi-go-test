# Backend audit (B0): Hisobchi Go

Sana: 11.11.2026. Asos: `main` @ `4ae7083` (PR #39). Topshiriq: `docs/HUMOYUN-BACKEND.md`, 6-bo'lim, B0.
Bajarildi: alohida nusxada (`hisobchi-go-validation`), kod **o'zgartirilmagan**, production Supabase'ga ulanilmagan.

Belgilar: **[SINALDI]** lokal PostgreSQL 16 da (Supabase stub, `supabase/tests/00_supabase_stub.sql`) yoki testda ishga tushirib tekshirildi; **[O'QILDI]** kod o'qib tasdiqlandi (deterministik oqim); **[HUJJAT]** `HUMOYUN-BACKEND.md`/advisor ma'lumoti, qayta tekshirilmagan; **[STAGING]** faqat haqiqiy Supabase'da tasdiqlanadi.

---

## 1. Testlar natijasi (alohida nusxa, Node 24.12.0, npm 11.6.2)

| Tekshiruv | Natija |
|---|---|
| `npm ci` (core, web, admin, mcp; mobil o'rnatilmadi) | OK, 597 paket. Ogohlantirish: `jsdom@31`, `w3c-xmlserializer@6` Node `^24.15.0` talab qiladi (EBADENGINE) |
| TypeScript: core, web, admin, mcp | 4/4 OK |
| ESLint: admin | OK |
| ESLint: web | **XATO**: 1 error, 1 warning (pastda L1, L2) |
| Vitest: core / web / admin / mcp | 235 / 387 / 38 / 76, hammasi o'tdi (736 test) |
| `test:ci` (migration-guard) | 23/23 o'tdi |
| Build: web, admin (Next 16.4.3), mcp | 3/3 OK |
| SQL: `supabase/tests/run_local.sh` (001–012, 003–012 ikki marta) | 603 PASS, 0 FAIL |
| TS ↔ SQL hisob mosligi (`calculateLineTotal` ↔ `calculate_line_total`) | 20 015 holat, 0 farq; namuna 385 000 to'g'ri |
| Mobil testlar, Expo bundle | **O'tkazilmadi** (`apps/mobile` ga tegilmaydi) |

CI eslatma: `.github/workflows/ci.yml` da **lint qadami yo'q**, shuning uchun L1 xatosi CI'da ushlanmagan.

## 2. RPC xavfsizligi (46 ta `SECURITY DEFINER` funksiya) [SINALDI]

`pg_proc` dan avtomatik tasniflandi (`authenticated` EXECUTE: 41, advisor bilan bir xil):

| Guruh | Funksiyalar | Birinchi tekshiruv | `client_op_id` |
|---|---|---|---|
| Yozish (faqat ilova/veb sessiyasi) | `post_sale`, `reverse_sale`, `record_payment`, `void_payment`, `post_purchase`, `reverse_purchase`, `record_supplier_payment`, `void_supplier_payment`, `post_supplier_opening_balance`, `adjust_stock`, `ensure_walkin_customer` | `require_shop_member` (a'zolik + `assert_first_party`) | bor (void_* da `payment_id` UNIQUE orqali idempotent) |
| Tasdiq | `accept_agent_draft`, `reject_agent_draft` | `assert_first_party` + `is_shop_member` | qoralama id |
| Agent (OAuth ruxsat) | `agent_*` (15 ta), `customer_outstanding`, `supplier_outstanding`, `partner_statement` | `require_shop_member_agent` | yozuvchi agent RPC'larda `p_client_op_id`/`p_request_id` bor |
| Admin | `admin_*` (6) | `_admin_gate` / `is_platform_admin` | yo'q (faqat o'qish) |
| O'z-o'zini cheklovchi | `create_shop`, `agent_whoami`, `is_platform_admin`, `is_shop_member` | `auth.uid()` | `create_shop` idempotent (bitta egalik) |
| Ichki (EXECUTE yopiq) | `_admin_gate`, `_admin_shop_facts`, `apply_catalog_draft`, `require_shop_member*` | - | - |

Xulosa: a'zolik tekshiruvisiz ochiq yozuv RPC'si **topilmadi**. OAuth token bilan `post_sale` va `accept_agent_draft` → `oauth_client_forbidden`, jadvalga to'g'ridan-to'g'ri INSERT → RLS `*_no_oauth` rad etadi, o'qish 0 qator [SINALDI]. Boshqa do'kon foydalanuvchisi: `customer_outstanding` → `forbidden`, `customers` → 0 qator [SINALDI]. Hamma `SECURITY DEFINER` funksiyada `search_path` o'rnatilgan (0 ta istisno).

**Nega `is_shop_member` `anon` ga ochiq:** `001` uni yaratganda PostgreSQL standart `EXECUTE TO PUBLIC` beradi. `003:372` faqat `FROM anon` olib tashlaydi, `PUBLIC` grant qoladi (anon PUBLIC orqali meros oladi). `004` bu funksiyani qayta yaratmaydi, huquqni "qaytargan" emas. Lokal bazada: `has_function_privilege('anon','is_shop_member(uuid)')` = true, PUBLIC grant = 1. Bu `anon` chaqira oladigan **yagona** DEFINER funksiya. Ta'sir: anon uchun doim `false` (auth.uid() NULL). RLS siyosatlari uni chaqiruvchi roli bilan ishlatadi: `REVOKE FROM PUBLIC` dan keyin `authenticated` ga aniq `GRANT EXECUTE` shart, aks holda siyosatlar sinadi.

## 3. Hisob mosligi (TS ↔ SQL)

- Formula ikkala tomonda bir xil: `(qty_milli × unit_price + 500) / 1000`, qator bo'yicha (`packages/core/src/calculation.ts:34`, `001_initial_schema.sql:226`). 20 015 tasodifiy va chegaraviy holat (1e9 × 1e8 gacha) farqsiz [SINALDI].
- Ataylab farq: mijoz jami 499, server 500 → `calc_mismatch`, hech narsa saqlanmadi (0 qator) [SINALDI].
- Manfiy miqdor → xato; bo'sh hujjat → `empty_document` [SINALDI].
- Cheklov: ikki yo'l bir xil formulaning ikki tilda yozilishi, formulaning o'zidagi xatoni ushlamaydi (dizayn bo'yicha qabul qilingan).

## 4. Topilmalar jadvali

Xavf: Yuqori / O'rta / Past. Holat: CONFIRMED (tasdiqlandi), NEEDS STAGING TEST.

| # | Topilma | Joyi (fayl:qator) | Xavf | Holat | Tuzatish | Test |
|---|---|---|---|---|---|---|
| B1 | Panel "Daftarga yozish" ta'minotchi uchun `post_supplier_opening_balance` chaqiradi; bir ta'minotchiga bitta faol ochilish qoldig'i ruxsat, 2-yozuv `opening_balance_exists` bilan yiqiladi (boshlang'ich qarz bilan yaratilganda 1-yozuv ham) | `apps/web/src/components/panel/usePanelActions.ts:164`; `supabase/migrations/009_supplier_opening_balance.sql:23-24,61-63` | Yuqori | CONFIRMED [SINALDI] | Alohida "tovarsiz kirim/qarz yozuvi" turi yoki RPC (`kind='adjustment'`), opening'dan ajratish | SQL: bir ta'minotchiga 2 yozuv; veb: hook testi |
| B2 | Panel kirimida yangi tovarlar `buildPurchasePlan` tekshiruvidan **oldin** yaratiladi (doim `dona`); kirim rad etilsa/yiqilsa katalogda yetim tovar qoladi | `usePanelActions.ts:97-105` | O'rta | CONFIRMED [O'QILDI] | Avval reja tekshiruvi; tovar yaratish + kirimni bitta RPC'ga | Veb: noto'g'ri to'lovda `createProduct` chaqirilmasligi |
| B3 | Rozilik sahifasi "mijoz/mahsulot ma'lumotini o'zgartira olmaydi" deydi, lekin OAuth token `agent_add_customer`/`agent_add_products` bilan tasdiqsiz qo'shadi | `apps/web/src/lib/oauthConsent.ts:51-58`; `005_agent_catalog.sql:153,214`; `apps/mcp/src/tools.ts:370,403` | O'rta | CONFIRMED [SINALDI] | Rozilik matnini haqiqiy imkoniyatga moslash (qo'shish, kirim qoralamasi) | Snapshot test matn ↔ tool ro'yxati |
| B4 | Qoldig'i bor tovarning birligi to'g'ridan-to'g'ri o'zgartiriladi; eski harakatlar yangi birlikda o'qiladi, eski birlikdagi savdo tovarga bog'lanmaydi (ombor harakati yo'q, jim) | `apps/web/src/app/(app)/products/page.tsx:36,67`; `001:343-345` (FOR ALL); `006_partners_stock.sql:252-260` | O'rta | CONFIRMED [SINALDI] | Harakati bor tovarda `unit` ni trigger bilan bloklash yoki birlik almashtirish RPC'si | SQL: harakatli tovarda unit UPDATE rad etilishi |
| B5 | Veb savdo + to'lov ikki alohida RPC (`post_sale`, keyin `record_payment`); `post_sale(p_paid)` bitta tranzaksiyada qila oladi | `apps/web/src/components/sale/useSaleSubmit.ts:60-71,111`; `006:179-180,295-299` | O'rta | CONFIRMED [O'QILDI]; tarmoq uzilishidagi oqim: NEEDS STAGING TEST | `postSale` ga `p_payment_method/p_paid` | Veb: bitta RPC chaqiruvi |
| B6 | Mijozsiz savdo ikki xil: veb `customer_id NULL` (to'lov yozilmaydi, kassa izsiz), mobil/agent `one_time` mijoz + avto to'lov | veb `apps/web/src/lib/data/api.ts:370-385`; `006:25-42` | O'rta | CONFIRMED [SINALDI]: NULL savdoda 0 to'lov, walk-in'da 1 | Vebni `ensure_walkin_customer` + `p_paid` ga o'tkazish | SQL + veb |
| B7 | Agent kirim qoralamasidagi `note` tasdiqda yo'qoladi (`post_purchase` da izoh parametri va ustuni yo'q) | `008_agent_purchases.sql:315` vs `:379-381` | Past | CONFIRMED [SINALDI] | `purchase_documents.note` + `post_purchase(p_note)` | SQL: izoh saqlanishi |
| B8 | `is_shop_member` `anon` ga ochiq (PUBLIC grant) | `003_security_and_mvp_rpc.sql:18-24,372` | Past | CONFIRMED [SINALDI] | `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated` | SQL: `has_function_privilege` |
| B9 | 9 funksiyada `search_path` yo'q (hammasi INVOKER): `agent_drafts_guard, calculate_document_total, calculate_line_total, catalog_norm, get_document_pg_total, prevent_append_only_change, prevent_ledger_modification, products_sync_prices, update_updated_at` | `001`, `003:137`, `004:156`, `005:32`, `006:71` | Past | CONFIRMED [SINALDI] | `ALTER FUNCTION ... SET search_path = public, pg_temp` | SQL: `proconfig` |
| B10 | Idempotentlik "tekshir, keyin yoz": parallel bir xil chaqiruvda 2-si mavjud id o'rniga xom `23505` oladi (dublikat yaratilmaydi) | `006:200-206` (va boshqa yozish RPC'lari) | Past | CONFIRMED [SINALDI] (2 sessiya) | `INSERT ... ON CONFLICT DO NOTHING` + qayta o'qish yoki `pg_advisory_xact_lock(shop, op)` | SQL: 2 parallel sessiya |
| B11 | `engines.node >=20.9.0`, lekin `@supabase/*` ≥22, `jsdom` `^22.22.2 \|\| ^24.15.0` | root/web/admin `package.json` `engines` | Past | CONFIRMED (npm EBADENGINE, Node 24.12) | `engines` ni `^22.22.2 \|\| >=24.15.0`, `.nvmrc` | - |
| B12 | Ikki TypeScript: core 5.9.3, ilovalar 6.0.3 | `package-lock.json` | Past | CONFIRMED (`node_modules`) | Bitta versiya | - |
| L1 | Web ESLint xatosi `react-hooks/set-state-in-effect` | `apps/web/src/components/useBooks.ts:34` | Past | CONFIRMED (lint) | Effect'dan holatni sinxron o'rnatmaslik; CI'ga `lint` qadami | `npm run lint` |
| L2 | Ishlatilmagan import `isBlankPurchaseLine` | `apps/web/src/app/(app)/purchases/new/page.tsx:19` | Past | CONFIRMED (lint) | O'chirish | lint |
| S1 | Agent `agent_draft_sale` ga walk-in (`one_time`) mijoz id'sini to'g'ridan-to'g'ri bersa, qoralama yaratiladi, lekin tasdiqda doim `walkin_requires_full_payment`: qoralama abadiy `draft` (50 ta limitni band qiladi) | `008_agent_purchases.sql:122-127` | O'rta | CONFIRMED [SINALDI] | `agent_draft_sale` da `kind='one_time'` mijozni rad etish (`p_walkin` ishlatilsin) | SQL |
| S2 | Savdo bilan to'langan doimiy mijoz savdosi bekor qilinsa to'lov qoladi → qarz −10 000; keyingi qarzga savdodan keyin to'lov `payment_exceeds_debt` bilan bloklanadi. Qaytarish (refund) oqimi yo'q | `006:342-352`, `003:333-336` | O'rta | CONFIRMED [SINALDI] | Bekor qilishda "to'lovni ham qaytarish" tanlovi yoki refund RPC; UI'da kredit ko'rsatish | SQL |
| S3 | Arxivlangan mijozga qoralama savdosi tasdiqlanadi | `008:347-361` | Past | CONFIRMED [SINALDI] | Tasdiqda `is_active` tekshirish (`draft_stale`) | SQL |
| S4 | Klient tizim ustunlarini to'g'ridan-to'g'ri yozadi: walk-in mijozni `regular` ga aylantirish, `source='agent'` soxtalash, `cost_price` o'rnatish (faqat o'z do'koni) | `001:343-355`, `003:163`, `006:66` | O'rta | CONFIRMED [SINALDI] | Ustun darajasida `GRANT UPDATE (name, phone, notes, ...)` yoki trigger | SQL: klient UPDATE rad |
| S5 | Walk-in savdo to'lovini `void_payment` bilan bekor qilish → walk-in "qarzi" paydo bo'ladi | `003:344-367` | Past | CONFIRMED [SINALDI] | `one_time` to'lovini alohida void qilishni taqiqlash (faqat savdo bekor qilish orqali) | SQL |
| S6 | Bir xil `client_op_id` boshqa tarkib bilan qayta yuborilsa server jim eski hujjatni qaytaradi | `006:200-203` (barcha yozish RPC'lari) | Past | CONFIRMED [SINALDI] (veb `api.ts:391-394` summani solishtirib ushlaydi; mobil/MCP tekshirilmagan) | Payload hash saqlash va farqda `idempotency_conflict` | SQL |
| S7 | MCP `p_client_total: Number(bigint)`: 2^53 dan katta jamida aniqlik yo'qoladi → `calc_mismatch` (xavfsiz yiqiladi) | `apps/mcp/src/db.ts:245,262` | Past | CONFIRMED [O'QILDI] | String yuborish (veb kabi) | mcp unit test |
| S8 | `MCP_ALLOWED_CLIENT_IDS` bo'sh bo'lsa Supabase'dagi istalgan OAuth klient qabul qilinadi | `apps/mcp/src/config.ts:243`, `auth.ts:57` | O'rta | CONFIRMED [O'QILDI]; production qiymati: NEEDS STAGING TEST | Production'da allowlist majburiy | config test |
| S9 | `post_sale` da tovarga bog'lanmagan qator ombor qoldig'iga tegmaydi va hech qayerda ko'rsatilmaydi (jim) | `006:249-271` | O'rta | CONFIRMED [SINALDI] (B4 probasida) | RPC natijasida bog'lanmagan qatorlar ro'yxatini qaytarish, UI'da sariq | SQL |
| S10 | `admin_shop_stage` audit yozmaydi (`_admin_gate` emas) | `011_platform_admin.sql:147-164` | Past | CONFIRMED [O'QILDI] | `_admin_gate` ishlatish | SQL |
| S11 | `ledger_entries` qarz hisobida ishlatilmaydi (qarz = documents + payments), `audit_log` ga hech kim yozmaydi: ortiqcha/ikki manbali model | `003:168-179`, `001:204-216` | Past | CONFIRMED [O'QILDI] | Qaror: ledger'ni yagona manba qilish yoki rasman "arxiv" deb belgilash (QARORLAR.md) | - |
| H1 | Auth "Leaked password protection" o'chirilgan | Supabase Dashboard | O'rta | NEEDS STAGING TEST [HUJJAT] | Yoqish | - |
| H2 | 11 FK indekssiz; `shops_update` da `auth.uid()` har qatorda | `001`, `003:46-48` | Past | [HUJJAT] advisor; kodda `shops_update` tasdiqlandi | 013 migratsiya: indekslar, `(select auth.uid())` | - |

## 5. Oqimlar bo'yicha yurish yo'li

| Oqim | RPC | Natija [SINALDI] | Jim xato / yo'qotish xavfi |
|---|---|---|---|
| Savdo | `post_sale` | jami qayta hisoblanadi, mos kelmasa 0 qator | S9 (bog'lanmagan qator), B4, S6, B10 |
| To'lov | `record_payment` / `void_payment` | qarzdan oshsa rad | S2 (manfiy qarzdan keyin to'lov bloklanadi), S5 |
| Kirim | `post_purchase` | tan narx yangilanadi, qoldiq + | B2 (veb, yetim tovar), B7 (agent izohi) |
| Ta'minotchi to'lovi | `record_supplier_payment` | qarzdan oshsa rad | B1 (daftar yozuvi) |
| Bekor qilish | `reverse_sale` / `reverse_purchase` | teskari yozuv, qoldiq qaytadi | S2; kirim to'lovi qoladi (hujjatlangan) |
| Qoldiq tuzatish | `adjust_stock` | sabab majburiy, idempotent | yo'q |
| Agent qoralama | `agent_draft_*` → `accept_agent_draft` | OAuth tasdiqlay olmaydi | S1, S3, B7 |

## 6. Tuzatish ketma-ketligi (taklif)

1. **B1** (veb + kerak bo'lsa yangi RPC), **B2**, **L1/L2** va CI'ga `npm run lint` qadami.
2. **013 migratsiya (faqat SQL PR):** B8, B9, B10/S6 (idempotentlik), S1, S3, S4 (ustun huquqlari), S5, B4 (unit bloklash), B7 (`note`), S10, H2 (indekslar, `shops_update`). Har biriga `supabase/tests/90_*.test.sql`.
3. **Veb PR:** B5 + B6 (atomik `p_paid`, walk-in), B3 (rozilik matni), S9 (bog'lanmagan qator ogohlantirishi), S2 (kredit ko'rsatish / refund oqimi qarori).
4. **MCP PR:** S7, S8.
5. **Konfiguratsiya:** B11, B12, H1.
6. Qoralama tahriri RPC (HUMOYUN-BACKEND B3).

## 7. Staging'da bajarilishi kerak

- 013 migratsiyani bo'sh staging loyihada qo'llash (`migrate-staging.yml`), `run_local.sh` natijasini haqiqiy Supabase rollari bilan solishtirish (stub `anon/authenticated` va default privileges Supabase'ga mos deb taxmin qilingan).
- Haqiqiy Supabase OAuth 2.1 tokeni: `client_id` claim haqiqatan borligi, RESTRICTIVE siyosatlar ishlashi, MCP orqali Claude bilan to'liq aylanma.
- Veb oqimlari (HOLAT-PANEL-3 "Sinalmagan"): kirim, ta'minotchi to'lovi, daftar yozuvi (B1 ni foydalanuvchi ko'rinishida), bekor qilish/qayta yozish, qoldiq tuzatish, tahrirlar.
- B5: tarmoq uzilishida "savdo saqlandi, to'lov yo'q" holati.
- Auth sozlamalari (H1), zaxira/PITR holati, production `MCP_ALLOWED_CLIENT_IDS` qiymati.

## 8. Bajarilmagan / cheklovlar

- Mobil (`apps/mobile`) testlari, Expo bundle va mobil sinxronizatsiya kodi tekshirilmadi (topshiriq bo'yicha tegilmaydi).
- Haqiqiy Supabase'da hech narsa sinalmadi (production'ga ulanilmadi, staging yo'q).
- Brauzerda veb UI qo'lda sinalmadi; B2, B5 kod oqimi bo'yicha tasdiqlangan.
- Load/performance testlari o'tkazilmadi.
