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
