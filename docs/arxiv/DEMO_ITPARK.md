# Hisobchi Go — IT Park demo ssenariysi (mobil + web)

**Talablar:** telefonda Expo Go (SDK 58), kompyuterda Metro, web ilova ochiq, bitta tasdiqlangan hisob.
Supabase Dashboard → Authentication → URL Configuration: Site URL `hisobchigo://auth/callback`,
Redirect URLs `hisobchigo://**` va `exp://**` (oldindan sozlang).

Demodan **oldin** (kechasi emas, bir kun oldin):
1. Mobil ilovani ishga tushiring:
   ```powershell
   cd C:\Users\humoy\Desktop\hisobchi-go\apps\mobile; npx expo start --clear --tunnel
   ```
2. Telefonda: Menyu → Hisob va bulut → Ro'yxatdan o'tish (yoki Kirish) → email havolasini **shu telefonda**
   oching → «Email tasdiqlandi» → Do'kon yaratish. Web'da xuddi shu email bilan kiring.
3. Bosh sahifada «Bulut: barcha yozuvlar yuborilgan» ko'ringanini tekshiring.

> Muhim: bitta telefon = bitta hisob. Telefonda boshqa hisobga kirilsa, sinxronlash ataylab bloklanadi.

## Ssenariy (≈7 daqiqa)

| # | Harakat | Kutilgan natija |
|---|---|---|
| 1 | Mobil → Bosh sahifa | Bugungi savdo, 7 kun, qarz, to'lovlar; pastda bulut holati |
| 2 | Menyu → Mahsulotlar → Yangi mahsulot: «Guruch», kg, 18 000 | Ro'yxatda paydo bo'ladi |
| 3 | Mijozlar → Yangi mijoz: «Akmal aka» | Mijoz ro'yxatida, «Qarzi yo'q» |
| 4 | Yangi savdo → Qo'lda kiritish → «Gur» deb yozing → katalogdan Guruch → miqdor 2,5; qator qo'shing: Non, dona, 3, 4000 | Qator summalari 45 000 va 12 000, taxminiy jami 57 000 |
| 5 | Tasdiqlashga o'tish → mijoz: Akmal aka → belgini qo'yish → Savdoni saqlash | «TypeScript va SQLite hisoblari mos keldi», savdo tafsiloti ochiladi |
| 6 | Savdo tafsilotida bir necha soniya kuting | «Bulutda saqlangan (server tasdiqlagan)» |
| 7 | Mijozlar → Akmal aka → To'lov qabul qilish: 20 000, Naqd → tasdiqlash | Savdo 57 000 · To'langan 20 000 · Qarz 37 000 |
| 8 | Web'ni yangilang | Xuddi shu mahsulot, mijoz, savdo va to'lov; qarz 37 000 |
| 9 | Web'da: shu mijozga 10 000 to'lov kiriting | Web'da qarz 27 000 |
| 10 | Mobil → Menyu → Hisob va bulut → Hozir sinxronlash → mijoz sahifasi | Web'dagi to'lov ko'rinadi, qarz 27 000 |
| 11 | Hisobotlar → Bugun / 7 kun / 30 kun | Raqamlar bosh sahifa bilan mos |
| 12 | (ixtiyoriy) Savdolar → savdo → Savdoni bekor qilish (sabab bilan) | «Bekor qilingan», qarz kamayadi; yozuv o'chmaydi |
| 13 | (ixtiyoriy) Samolyot rejimi → yangi savdo → rejimni o'chirib ilovani qayta oching | Avval «N ta yozuv kutmoqda», keyin avtomatik yuboriladi |

## Ma'lum cheklovlar (savol bo'lsa)
- Internet qaytganini ilova kuzatmaydi: qayta urinish ~30 s – 5 daq oralig'ida, ilova faollashganda yoki tugma bilan.
- Web'da narxsiz kiritilgan mahsulot telefonga olinmaydi (telefon modeli narx talab qiladi) — sababi ko'rsatiladi.
- Savdo/to'lov tarixi bor mijoz web'da o'chirilsa ham telefonda qoladi (moliyaviy tarix saqlanadi).
- Ovozli kiritish Expo Go'da yo'q (development build kerak). AI tahlil ulanmagan — deterministik o'zbekcha parser.
