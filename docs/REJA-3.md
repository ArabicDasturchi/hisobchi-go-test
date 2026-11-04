# REJA-3: Daftarlar (kirim/chiqim), ombor, katalog, tezkor savdo + agent katalogi

Sana: 03.11.2026. Holat va keyingi qadam: [HOLAT-3.md](HOLAT-3.md). Qarorlar: [QARORLAR.md](QARORLAR.md).
Bu katta vazifa bir seansga sig'maydi: bosqichlar (S1 dan S5 gacha) tartib bilan, har bosqich alohida PR. Migratsiyali PR kod PR'idan **alohida**.
Migratsiyalarni men qo'llamayman: fayl yoziladi, `main` ga merge bo'lganda CI (`docs/MIGRATSIYA-CI.md`) qo'llaydi.

## 1. Hozirgi holat (kod bo'yicha, 03.11.2026)

**Server (Supabase, migratsiyalar 001-004, hammasi qo'llangan):**
- Jadvallar: `shops`, `shop_members`, `products` (`name`, `unit`, `last_price`, `is_active`; `UNIQUE(shop_id, name)`), `product_aliases`,
  `customers` (`name`, `phone`, `notes`; **arxiv belgisi yo'q**, bir turdagi mijoz), `documents` + `document_lines` (savdo; `status` posted/reversed),
  `ledger_entries` (`entry_type`: sale, reversal, adjustment), `document_reversals`, `payments` + `payment_voids` (faqat mijoz to'lovi), `audit_log`,
  `agent_drafts` (004; turlari: sale, payment).
- RPC: `post_sale`, `reverse_sale`, `record_payment`, `void_payment`, `customer_outstanding`, `create_shop`, `agent_*` (o'qish, qoralama), `accept/reject_agent_draft`.
- **Yo'q:** ta'minotchi, kirim hujjati, ta'minotchi to'lovi, ombor harakati, tan narx, bir martalik mijoz, mijoz arxivi.
- Qarz = savdolar (bekor qilinmagan) - to'lovlar (`customer_outstanding`). Hisob ikki yo'l: TS (BigInt) va PostgreSQL `calculate_line_total`.
- Xavfsizlik: yozuv faqat `SECURITY DEFINER` RPC orqali; OAuth token (`client_id`) yozuv RPC'lariga va jadvallarga to'g'ridan-to'g'ri yopiq (`*_no_oauth`).

**Mobil (`apps/mobile`, Expo):** tablar: Bosh sahifa, Savdolar, Yangi savdo (+), Mijozlar, Menyu. SQLite sxemasi v5 (`src/data/schema.ts`: sales, sale_lines,
ledger_entries, drafts, products, payments...), `catalog.ts` (mahsulot: nom, birlik, narx), `ledger.ts`, sinxronizatsiya `backend/sync.ts` (bir tomonlama push) va
`backend/pull.ts` (qo'shimcha import). Mijoz ekranlari: `customers/[id]`, `customers/form`; mahsulotlar `products.tsx`; savdo `new.tsx` -> `review.tsx` -> `confirm.tsx`.
**Telefon asosiy manba**: server sxemasidagi har yangi ustun mobilda alohida SQLite migratsiyasi va push/pull o'zgarishini talab qiladi.

**Veb (`apps/web`, Next.js):** dashboard, savdolar (+yangi), mijozlar, mahsulotlar (arxiv bor), to'lovlar, qarzlar, hisobotlar, sozlamalar, qoralamalar, `oauth/consent`.
Ma'lumot `ShopDataProvider` orqali yuklanadi.

**Core (`packages/core`):** `calculateLineTotal/calculateDocument`, `parseUzNumber`, `parseQtyMilli`, `parseUnitPriceText`, `validateLine/Document`, `parseProductList`.
**MCP (`apps/mcp`):** 7 asbob (o'qish va savdo/to'lov qoralamasi).

## 2. Bosqichlar, PR'lar, o'zgaradigan fayllar

Raqamlash: migratsiyalar `005_nom.sql`, `006_nom.sql` ... (vaqt belgisi yo'q). Har bosqich oxirida `npm test`, `npm run typecheck`, SQL testlar (`bash supabase/tests/run_local.sh`) yashil.

| Bosqich | PR | Mazmuni | Asosiy fayllar |
|---|---|---|---|
| **S1** agent katalogi | **PR-A (DB)**: `005_agent_catalog.sql` + SQL testlar + hujjat. **PR-B (kod)**: MCP + veb | Agent mijoz/tovar **qo'shadi** (tasdiqsiz), o'zgartirish/arxiv **faqat qoralama**. `customers.is_active`, `source` belgilari, `agent_add_customer`, `agent_add_products`, `agent_list_products`, `agent_propose_*`, `accept_agent_draft` kengayishi | `supabase/migrations/005_*`, `supabase/tests/30_*`, `apps/mcp/src/{db,tools}.ts`, `apps/web/src/{lib/data,components/DraftCard.tsx,app/(app)/drafts,customers,products}`, `docs/MCP-AGENT.md` |
| **S2** ma'lumotlar modeli | PR-C (migratsiya 006, kerak bo'lsa 007) + PR-D (mobil sxema/sync) | Ta'minotchi, kirim hujjati + qatorlari, ta'minotchi to'lovi, ombor harakatlari, tovarda `cost_price`/`sale_price`, savdo qatorida tan narx snapshot, bir martalik mijoz. `post_purchase`, `reverse_purchase`, `record_supplier_payment` (ikki yo'l bilan hisob), RLS va `_no_oauth` | `supabase/migrations/006_*`, `apps/mobile/src/data/schema.ts`, `backend/{sync,pull}.ts` |
| **S3** hisob moduli | PR-E | Kirim jami, ostatka, ombor qoldig'i, foyda; testlar (Vazifa 3, 3-band) | `packages/core/src/*`, `packages/core/__tests__/*` |
| **S4** mobil va veb | bir nechta PR | Asosiy panel (Katalog + Savdo), tezkor savdo, ixcham kartochka, Ombor, Kirim/Chiqim daftari, Ta'minotchilar, Mijozlar, Qoralamalar | `apps/mobile/src/app/*`, `apps/web/*` |
| **S5** MCP kengaytmasi | PR-F | `list_products` (qoldiq, tan, sotuv narxi), `list_suppliers`, `draft_purchase`; `draft_sale` mijozsiz = bir martalik mijoz | `apps/mcp/*`, `supabase/migrations/00N_*` (agent RPC'lar) |

PR'lar zanjir (stacked) bo'lishi mumkin: kod PR'i o'z migratsiya PR'iga tayanadi va u merge bo'lgach `main` ga qaratiladi. **Tartib: avval migratsiya PR'i merge** (CI qo'llaydi), keyin kod PR'i; shunda yangi ustunni so'raydigan kod ustun yo'q bazaga tushmaydi.

## 3. Qarorlarga mos kelishi (zid bo'lsa to'xtash)

Tekshirildi, to'xtatadigan ziddiyat **topilmadi**. Eslatmalar:
- **Qoida 1 ("AI bazaga yozmaydi") faqat katalog uchun o'zgaradi** (asoschi tasdiqlagan, A QISM 0-band): agent mijoz/tovar *qo'shadi*; o'zgartirish/arxiv tasdiqlash so'rovi; savdo, to'lov va (S5) kirim faqat qoralama. `QARORLAR.md` ga yoziladi.
- `ARXITEKTURA.md` v2 dagi jadval nomlari (`product_units`, `price_history`...) amaldagi 001-004 dan farq qiladi; reja **amaldagi** sxemadan boradi, ARXITEKTURA.md ga o'zgarish bosqich oxirida kiritiladi.
- "Veb faqat qoralama va daftarlarni ko'rish" (default): mavjud veb funksiyalari (savdo kiritish, mijoz/mahsulot CRUD) **olib tashlanmaydi**, yangi tahrir ekranlari veb'ga qo'shilmaydi.
- Qoida 4: haqiqiy DELETE yo'q; "o'chirish" = arxiv (`is_active=false`). (Eslatma: birinchi tomon ilova hozir `customers` ni DELETE qila oladi (003 huquqlari, mobil sync "o'chirilgan mijoz" ni biladi); bu o'zgartirilmaydi, S2/S4 da ko'rib chiqiladi.)

## 4. Xavflar

| Xavf | Chora |
|---|---|
| Mobil telefon asosiy manba: yangi server ustuni mobilda ko'rinmaydi, yoki mobil yangi ustunni so'rab eski bazada yiqiladi | Migratsiya PR'i avval; mobil o'zgarishlari alohida PR; pull'da ustun so'rovi migratsiyadan keyin |
| Mijoz arxivi mobilga hali ma'lum emas (S1) | Arxivlangan mijoz telefonda ko'rinaveradi, savdo tarixi saqlanadi; mobil qo'llab-quvvatlashi S2/S4 da. Hujjatlanadi |
| Agent noto'g'ri mijoz/tovar qo'shadi | Qo'shish qaytariladigan: arxiv so'rovi (tasdiq bilan); kunlik limit; dublikat himoyasi; "AI qo'shdi" belgisi |
| `last_price` ning ma'nosi S2 da `sale_price` ga o'tadi | S1 da agent narxi `last_price` ga yoziladi; S2 migratsiyasi `sale_price := last_price` qiladi (ma'lumot yo'qolmaydi) |
| Migratsiya xatosi production'ga tushishi | CI: test, dry-run, xavfli buyruq qo'riqchisi; har fayl bitta tranzaksiya; 005+ idempotent yoziladi |
| Hisob mos kelmasligi (tan narx, ostatka) | Ikki yo'l (TS BigInt + SQL), mos kelmasa to'xtaydi; core testlari (S3) |
| Katta hajm (Sheets dan yuzlab tovar) | `agent_add_products` bir chaqiriqda <= 100; kuniga 500 tovar / 100 mijoz limiti |

## 5. Mobil/veb uchun eslatma (S4 dan keyin ham tekshiriladi)

Past internetda ishlash (mobil oflayn navbat mavjud), katta tugmalar, o'zbekcha (lotin). Matn kiritishda o'qish: sonlarni kod o'qiydi (core).

## 6. Ochiq savollar (javob kelmasa **default** bilan davom etiladi)

1. **Tan narx usuli:** oxirgi kirim (**default**) yoki o'rtacha.
2. **Manfiy qoldiq:** ruxsat, sariq ogohlantirish bilan (**default**) yoki taqiq.
3. **Veb:** mobil asosiy, veb faqat qoralama va daftarlarni ko'rish (**default**) yoki to'liq.
4. **Agent kunlik limiti (S1):** do'kon boshiga kuniga **500 tovar** va **100 mijoz** qo'shish (Toshkent kuni, **default**); bir chaqiriqda <= 100. Sheets dan boshlang'ich yuklashga yetadi; kerak bo'lsa SQL doimiysini o'zgartirish bitta migratsiya.
5. **Mijoz arxivi:** `customers.is_active` (tovardagi `is_active` bilan bir xil nom, **default**) yoki alohida `archived_at`.
6. **Agent o'zgartira oladigan maydonlar:** mijozda faqat nom; tovarda nom, birlik, narx (**default**). Telefon va izoh agent tomonidan **qo'yilmaydi va o'zgartirilmaydi**.
7. **Eskirgan so'rov:** o'zgartirish so'rovi yaratilgandan keyin yozuv boshqacha bo'lib qolsa, tasdiqlash `draft_stale` bilan rad etiladi (**default**), jim ustidan yozilmaydi.

## 7. S2 dizayni (keyingi seans shundan boshlaydi)

Amaldagi sxemadan eng kam o'zgarish bilan. Migratsiyalar: **006** (hamkor va katalog asoslari), **007** (kirim, ombor, ta'minotchi to'lovi). Har biri alohida migratsiya PR'i; mobil sxema/sync alohida kod PR'i (migratsiyalardan keyin).
Barcha yangi jadvallar: RLS yoqilgan, a'zolik `is_shop_member`, yozuv faqat `SECURITY DEFINER` RPC (`require_shop_member` orqali OAuth rad etiladi), `<jadval>_no_oauth` RESTRICTIVE siyosati (20-test qo'riqchisi buni majburlaydi), append-only jadvallarga `prevent_append_only_change` trigger.

### 006: hamkorlar va tovar narxlari
- `suppliers`: `id`, `shop_id`, `name`, `phone`, `notes`, `is_active`, `source`, `source_client_id`, `created_at`, `updated_at` (mijozlar jadvali bilan bir xil shakl; first-party CRUD siyosati `customers` kabi).
- `customers.kind text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','one_time'))` + do'konga bitta tizim mijozi: partial unique `(shop_id) WHERE kind = 'one_time'`, nomi "Bir martalik mijoz". RPC `ensure_walkin_customer(shop)` (idempotent) va `create_shop` ichida chaqiriladi; mavjud do'konlar uchun migratsiya ham yaratadi. Ro'yxatlarda ko'rinishi: S4.
- `products.cost_price bigint NULL` (oxirgi kirim tan narxi), `products.sale_price bigint NULL`. Backfill: `sale_price := last_price` (ma'lumot yo'qolmaydi). `last_price` mobil moslik uchun saqlanadi (mobil v6 ga o'tgach eskirgan deb belgilanadi). `agent_add_products`/`agent_propose_product_update` `price` ni `sale_price` ga yozadigan bo'ladi (S5 emas, shu migratsiyada `CREATE OR REPLACE`).
- `document_lines.unit_cost bigint NULL` (savdo paytidagi tan narx snapshot'i; eski qatorlar NULL = tan narx noma'lum, foyda hisoblanmaydi).
- `post_sale` kengayishi (eski imzo `DROP FUNCTION` bilan almashtiriladi, ikki overload qolmasin): ixtiyoriy `p_payment_method`, `p_paid` (bir martalik mijoz uchun majburiy: `p_paid = jami`, aks holda `walkin_requires_full_payment`; qarzga berilmaydi). Savdo va to'lov bitta tranzaksiyada. Qator mahsulotga `catalog_norm(nom)` bilan bog'lanadi (faqat birlik mos kelsa): `product_id` va `unit_cost = cost_price` yoziladi.

### 007: kirim, ombor, ta'minotchi to'lovi
- `purchase_documents` (savdo hujjatiga o'xshash): `id`, `shop_id`, `supplier_id NOT NULL`, `doc_date date`, `status` (posted/reversed), `subtotal`, `ts_total`, `pg_total`, `calc_match`, `client_op_id` (UNIQUE per shop), `created_by`, `posted_at`.
- `purchase_lines`: `document_id`, `line_index`, `product_id NOT NULL` (kirimda tovar katalogdan tanlanadi), `product_name` (snapshot), `qty_milli`, `unit`, `unit_cost`, `line_total` (`CHECK` yaxlitlash formulasi bilan, 003 dagi `calculate_line_total`).
- `supplier_payments` + `supplier_payment_voids`, `purchase_reversals`: `payments`/`payment_voids`/`document_reversals` ko'zgusi.
- `stock_movements`: `id`, `shop_id`, `product_id`, `kind` (purchase, sale, adjustment, purchase_reversal, sale_reversal), `qty_milli` (+/-), `document_id`, `created_at`; append-only. **Qoldiq = SUM(qty_milli)** (view `product_stock`), alohida kiritilmaydi. Savdo `post_sale` ichida, kirim `post_purchase` ichida harakat yozadi; bekor qilish teskari harakat. Manfiy qoldiqqa ruxsat (CHECK yo'q); ko'rsatishda sariq.
- RPC (hammasi `post_sale` uslubida: a'zolik, idempotent `client_op_id`, **ikki mustaqil hisob** TS jami vs PostgreSQL, mos kelmasa hech narsa saqlanmaydi): `post_purchase(shop, purchase_id, client_op_id, supplier_id, doc_date, lines jsonb, client_total, paid default 0, method, note)` (berilgan to'lov bir tranzaksiyada; `cost_price := oxirgi kirim unit_cost`), `reverse_purchase`, `record_supplier_payment`, `void_supplier_payment`.
- Ta'minotchi balansi: `supplier_outstanding(shop, supplier)` = kirimlar (bekor qilinmagan) - to'lovlar (bekor qilinmagan), **a'zolik tekshiruvi bilan** (`customer_outstanding` xatosi takrorlanmasin).
- Daftar: `partner_statement(shop, 'customer'|'supplier', partner_id, from, to)`: Eski (davr boshidagi qoldiq), Tovar, Jami, Berildi, Ostatka (= Eski + Tovar - Berildi). Hisob SQL'da, TS'da mustaqil (S3), taqqoslanadi.

### Testlar (SQL + core)
Kirim 100×9 000 + 50×11 000 = 1 450 000, berildi 1 000 000 -> ostatka 450 000; `reverse_purchase` ostatka va qoldiqni qaytaradi; bir martalik savdo qarz yaratmaydi; foyda 10×13 000 sotuv, 10×11 000 tan -> 20 000; manfiy qoldiq ogohlantirish; boshqa do'kon izolyatsiyasi; OAuth token yozuv RPC'larini chaqira olmaydi; mavjud 001-005 testlari o'zgarmaydi.

### Mobil (keyingi kod PR'i)
SQLite `schema.ts` **v7** (amalda; v6 allaqachon band edi): `suppliers`, `purchases`, `purchase_lines`, `supplier_payments`, `stock_movements`, `customers.kind/is_active/source`, `products.cost_price/sale_price`; `sync.ts` (push) va `pull.ts` yangi entity'lar, mijoz `is_active` (arxiv telefonda yashiriladi, tarix saqlanadi). Server ustunini so'raydigan pull o'zgarishi migratsiya qo'llangandan keyin merge bo'ladi.

**Amalga oshirilgan o'zgarishlar (S2-mobil):** `stock_movements` mobilda alohida jadval emas, hujjatlardan hisoblanadi (QARORLAR). `sale_lines.product_id/unit_cost`, `products.cost_price/is_active/source`, `customers.kind/is_active/source` ustunlari `ensureColumns` orqali; `sync_log2`. Yangi: `src/data/purchasing.ts` (ta'minotchi, kirim, to'lov, ombor, oldi-berdi), `ledger.postSale({ paid })`, `ensureWalkinCustomer`. Sinxron: push 12 entity (`post_purchase`, `reverse_purchase`, `record_supplier_payment`, `void_supplier_payment`, `adjust_stock`), pull: ta'minotchi, kirim, to'lov, bekor qilishlar. **Pull qilinmaydi:** ombor tuzatishlari (serverda `stock_movements` ga yoziladi, mobilda esa lokal `stock_adjustments`) — boshqa qurilmadagi tuzatish bu telefonda ko'rinmaydi.
