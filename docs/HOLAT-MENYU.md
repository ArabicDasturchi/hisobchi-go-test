# MENYU-DAFTAR holati (06.11.2026)

Har bosqich `main` dan alohida PR, hech biri merge qilinmagan. Migratsiya **yo'q** (hammasi mavjud jadval/RPC'lar).

| Bosqich | PR | Holat |
|---|---|---|
| M1 Menyu va yo'naltirishlar, `can()` | #24 | tayyor |
| M2 LedgerSheet + core `ledgerRows`, ikkinchi yo'l | #25 | tayyor |
| M3 Mijozlar daftari (+ `agedDebt`) | #26 | tayyor |
| M4 Ta'minotchilar daftari | #27 | tayyor |
| M5 Ombor ichida Kirim/Chiqim | #28 | tayyor |
| M6 Demo, skrinshot, hujjat | M6 PR | tayyor |

Merge tartibi: M1 → M2 → M3 → M4 → M5 → M6. M2–M5 umumiy fayllari bir xil matn bilan; konflikt faqat `docs/QARORLAR.md` oxirida (ikkala tomonni qoldiring) va M3 da `packages/core/src/index.ts` (M2+M3 qatorlari).
Birlashtirilgan holat (M1–M6) lokalda `npm run typecheck` va `npm test` yashil, demo brauzerda ko'rildi.

Sinalmagan: haqiqiy Supabase (tez yozuv: `post_sale` + `record_payment`, ta'minotchi to'lovi, bekor qilishlar, `partner_statement` solishtiruvi), haqiqiy telefon, Chiqim tabi haqiqiy `stock_movements` bilan, Web Share (hozir faqat nusxalash/chop etish).
Ochiq masalalar: mijoz uchun boshlang'ich qarz (ochilish qoldig'i) yo'q — 009 faqat ta'minotchi uchun, mijozga alohida migratsiya kerak (asoschi qarori); ta'minotchida tezkor qatordan tovar summasi yozib bo'lmaydi (`post_purchase` tovar talab qiladi).
