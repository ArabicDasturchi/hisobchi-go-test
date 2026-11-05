# demo-seed

`npm run demo` uchun soxta ma'lumot. Kalit, telefon raqami, haqiqiy mijoz yo'q.

- `data.ts` — faqat ma'lumot (do'kon, ta'minotchi, 9 tovar, 2 mijoz, kirim 1 450 000, savdo 385 000, bir martalik savdo).
- `run.mjs` — `npm run demo`: veb panelni `NEXT_PUBLIC_DEMO=1` bilan ochadi.
- Veb panel: `apps/web/src/lib/demo/` xotiradagi soxta Supabase klienti (faqat ko'rish). Jamilar `@hisobchi/core` bilan.
- Productionda ishlamaydi: `NODE_ENV=production` bo'lsa demo rejimi o'chiq.
- Mobil web demo: mobil muzlatilgan, qarang `docs/VEB-DAN-MOBILGA.md`.
