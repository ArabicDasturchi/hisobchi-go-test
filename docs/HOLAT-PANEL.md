# PANEL-1/2 holati (05.11.2026)

Har PR `main` dan ochilgan, hech biri merge qilinmagan. Merge tartibi tavsiya: **#21 (009) → #22 (010) → #19 → #20 → demo PR**.

| Bosqich (PANEL-2 tartibi) | PR | Holat |
|---|---|---|
| S1 Veb'da ta'minotchi va kirim, boshlang'ich qarz, ombor tuzatishi | #21 | tayyor, **009 migratsiya**, SQL test CI'da ishga tushadi |
| S2 Birliklar (dona/pachka, Sozlamalar → Birliklar) | #22 + savdo qismi #19 da | tayyor, **010 migratsiya** |
| S3 Yangi savdo standartlari, S4 tovar tanlash, S5 foyda/ogohlantirish, S6 natija kartasi | #19 | tayyor |
| S7 Bosh sahifa | #20 | tayyor |
| S8 Demo ma'lumot + skrinshotlar | demo PR | tayyor |

Sinalmagan: haqiqiy Supabase (saqlash oqimlari, 009/010 qo'llangandan keyingi holat), SQL testlar lokalda (psql yo'q, faqat CI), haqiqiy telefon, Web Share.
Birlashtirilgan holat (barcha PR'lar) lokalda `npm run check` yashil; konfliktlar faqat `packages/core/src/index.ts` va `docs/QARORLAR.md` oxirida (ikkala tomonni qoldirish kifoya).
Keyingi qadam: PR'larni ko'rib merge qilish; 009/010 CI orqali qo'llanadi; keyin haqiqiy bazada kirim va ta'minotchi oqimini sinash.
Ochiq savollar: `docs/QARORLAR.md` (dona↔pachka aylantirish; kassada karta/o'tkazma; minimal qoldiq chegarasi).
