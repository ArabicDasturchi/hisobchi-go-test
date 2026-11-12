# HOLAT: Ombor narxlari, optom narx va ombor sozlamalari

Sana: 12.11.2026. Branch: `claude/stoic-sagan-gf2fji` (so'ralgan `feat/ombor-narxlar` o'rniga: seans faqat shu branchga push qila oladi). `main` dan (2470e10) boshlangan.

## Tayyor (S0-S2, asoschi tasdig'i kutilmoqda)
- **S0:** migratsiya raqami **014** (013 oxirgi; boshqa branchlarda 014+ yo'q).
- **S1:** `supabase/migrations/014_ombor_narxlar.sql`: `products.wholesale_price`, `products.wholesale_min_qty_milli` (+CHECK'lar), `shops.settings` shakli CHECK, SQL `resolve_unit_price`, `suggest_sale_price`. Faqat qo'shuvchi (`dangerous=false`), qayta ishga tushirish xavfsiz. Production'ga qo'llanmagan.
- **S2:** `packages/core/src/pricing.ts` (`resolveUnitPrice`, `isWholesaleApplied`, `suggestSalePrice`), 27 test.
- Ikki yo'l mosligi: `supabase/tests/fixtures/pricing-cases.json` ni core testi va `supabase/tests/95_ombor_narxlar.test.sql` o'qiydi (21 bir xil holat).
- Qarorlar: `docs/QARORLAR.md` (12.11.2026, "TASDIQ KUTILMOQDA").

## To'xtash nuqtasi
Shartnoma bo'yicha migratsiya va pul hisobi qoidalari asoschi tasdig'ini kutadi. Tasdiqdan keyin S3-S7.

## Qolgan (tasdiqdan keyin)
S3 Ombor sahifasi (sozlamalar paneli, tan/sotuv/optom, soni), S4 Mahsulotlar (faqat nom/birlik/sotuv narxi), S5 savdo panelida optom narx, S6 hujjat + UI testlar, S7 chiqarish (migratsiya merge'dan keyin CI qo'llaydi).
`stock_enabled=false` da o'chadigan joylar: `StockTab` (Kam qoldi/Manfiy), `lineWarnings`/`saleInsights` ("Omborda N bor").
