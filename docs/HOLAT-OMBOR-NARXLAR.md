# HOLAT: Ombor narxlari, optom narx va ombor sozlamalari

Sana: 12.11.2026. Branch: `feat/ombor-narxlar-ui` (S3-S7), `main` dan. Migratsiya 014 production'ga qo'llangan (#58).

## Tayyor
- S0-S2: migratsiya 014, core `pricing.ts` (PR #58, merge qilingan).
- S3 Ombor sahifasi: sozlamalar paneli (Optom/dona, Baza, Ustama %), tan narx/sotuv narx/optom, soni (Baza yoqiq bo'lsa), "Narxi yo'q" filtri, ustama taklifi, tan narx > sotuv ogohlantirishi.
- S4 Mahsulotlar: faqat nom, birlik, sotuv narxi (tan narx va optom Omborda).
- S5 Savdo paneli: optom narx (`repriceLines`, `autoPrice`), "Optom narx" belgisi; Baza o'chiq bo'lsa qoldiq ogohlantirishlari yo'q.
- S6: testlar (shop-pricing, warehouse-pricing-ui, sale-wholesale), QARORLAR/ARXITEKTURA/TZ-MVP.

## Sinalmagan
Telefonda (haqiqiy qurilma, klaviatura), haqiqiy Supabase (PostgREST UPDATE, `shops.settings` yozish, RLS), Safari. Demo rejimda (soxta ma'lumot, yozish o'chiq) Chromium'da ko'rilgan: Ombor sahifasi 390 va 1280 px.

## Ma'lum xavf (tanqidchi, to'smaydi)
- `shops.settings` butun obyekt sifatida xotiradagi nusxadan yoziladi (sozlamalar sahifasidagi `units` bilan bir xil naqsh): ikki qurilmada bir vaqtda o'zgartirilsa eskisi qaytishi mumkin. Yozishdan oldin qayta o'qish keyingi tuzatish.
- "Qo'llash" tugmasi fokusni `onMouseDown preventDefault` bilan saqlaydi; iOS/Android teginishida ishonchliligi sinalmagan.
- `apps/mobile` yangi sozlamalarni hali hisobga olmaydi (mobil muzlatilgan): `docs/VEB-DAN-MOBILGA.md`.

## Qolmagan / qilinmagan (vazifa chegarasi)
Barcha tovarlarga ustamani ommaviy qo'llash, narx tarixi, kirim narxlari tarixi.
