# Staging tekshiruvi: W1–W10 tuzatishlarini haqiqiy Supabase'da sinash

Sana: 11.11.2026. Holat: **reja, bajarilmagan**. Production'ga tegilmaydi. Asos: [MIGRATSIYA-CI.md](MIGRATSIYA-CI.md) 10-bo'lim (`migrate-staging.yml` tayyor, staging loyihasi va sirlar hali yo'q), [WEB-AUDIT.md](WEB-AUDIT.md), [BACKEND-AUDIT.md](BACKEND-AUDIT.md).

Bajarish uchun bosqichma-bosqich checklist (SQL tekshiruvlari, natijalar jadvali, birlashgan kod natijalari): [STAGING-CHECKLIST.md](STAGING-CHECKLIST.md). Keyingi bosqich: [KEYINGI-BOSQICH.md](KEYINGI-BOSQICH.md).

## 0. Nega kerak

Hozirgi hamma tekshiruv lokal: PostgreSQL 16 + Supabase stub (`supabase/tests/run_local.sh`, 651 PASS), jsdom testlari, demo rejim (faqat o'qish). Haqiqiy Supabase'da quyidagilar **birorta ham sinalmagan**:
- Auth: ro'yxatdan o'tish, email tasdiqlash, kirish, parol tiklash;
- RLS va rollar: Supabase'ning haqiqiy `anon`/`authenticated` default privileges, stub emas;
- PostgREST: yangi RPC'lar (`reverse_sale_with_payments`, `post_supplier_debt`) va schema cache;
- web'ning yozish oqimlari (demo yozishni o'chiradi).

## 1. Asoschi bir marta qiladi (Claude Code qila olmaydi: hisob va sirlar)

1. supabase.com → New project `hisobchi-go-staging`, **bepul reja**, region production bilan bir xil. Faqat soxta ma'lumot.
2. GitHub → Settings → Environments → `staging`. Secrets: `STAGING_SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_DB_PASSWORD`, `STAGING_SUPABASE_PROJECT_REF`.
3. Supabase staging → Authentication:
   - URL Configuration → Redirect URLs: `http://localhost:3000/**` va Vercel preview manzili;
   - **Leaked password protection: yoqish** (audit H1).
4. Vercel `hisobchi-go-web` → **Preview** env: staging `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Production o'zgarmaydi.
5. **Vercel ruxsati:** `ArabicDasturchi` hisobini Vercel jamoasiga qo'shish. Hozir PR preview'lari "Git author must have access" xatosi bilan bloklangan.

## 2. Migratsiyalar

1. Actions → "Migratsiya (staging)" → Run workflow. Kutilgan: 001–012 qo'llandi, "up to date".
2. PR #43 (013) uchun workflow PR'da avtomatik ishlaydi (`supabase/migrations/**`). Kutilgan: 013 qo'llandi.
3. Supabase Dashboard → Advisors: yangi ogohlantirishlar yo'qligi (013 funksiyalarida `search_path` bor).

## 3. Sinov ssenariylari (staging + Vercel preview yoki lokal `npm run dev` staging kalitlari bilan)

Ikki test hisob (A va B do'kon). Har qadamda **natija** va **daftar/kassa raqami** yoziladi.

| # | Ssenariy | Kutilgan natija | PR |
|---|---|---|---|
| S1 | Ro'yxatdan o'tish → email havolasi → kirish → do'kon yaratish | `/onboarding` → `/dashboard`; `create_shop` ikki marta bosilsa ham bitta do'kon | — |
| S2 | Parol tiklash, chiqish, qayta kirish | Havola ishlaydi; eskirgan havola tushunarli xabar | — |
| S3 | Tovar «Shakar» kg yaratish; xuddi shu nom+birlik ikkinchi marta | 2-urinish rad etiladi («katalogda bor»); boshqa birlik ogohlantirish | #46 |
| S4 | Kirim: yangi tovar «Un» kg, to'lov qarzdan katta (xato) | Xato chiqadi, katalogda «Un» **paydo bo'lmaydi** | #47 |
| S5 | Kirim: «Un» kg 10 × 9 000, to'lov 50 000 naqd | Kirim saqlandi; «Un» kg; ombor +10; ta'minotchi qarzi 40 000 | #47 |
| S6 | Savdo: Ali (doimiy), «Un» 2 kg, «To'landi» karta | **Bitta** `post_sale` (Network panelida `record_payment` yo'q); ombor −2; Ali qarzi 0; Kassa (naqd) o'zgarmaydi, «Karta» +jami | #50, #45, #46 |
| S7 | Savdo: mijozsiz, naqd | Savdolarda «Mijozsiz (naqd)»; `payments` da to'lov bor (walk-in); Kassa +jami | #50, #45 |
| S8 | Savdo: Ali, qisman 30 000 naqd | Qarz = jami − 30 000; Kassa +30 000 | #50 |
| S9 | S6 savdosini «Bekor qilish» (belgi standart) | Savdo bekor; to'lov ham bekor; Ali qarzi 0 (**manfiy emas**); ombor qaytdi; «Karta» kamaydi | #43, #44 |
| S10 | Bekor qilingan savdoni «Qayta yozish» «To'landi» bilan | Kassa/karta **bir marta** sanaladi | #44 |
| S11 | Savdoni bekor qilish, belgi olib tashlangan | To'lov qoladi; Ali'da kredit ko'rinadi | #44 |
| S12 | Ta'minotchiga «Daftarga yozish» `kirim 1 000 000` **ikki marta** | Ikkalasi saqlanadi (avval 2-si yiqilardi); daftar «Qarz yozuvi (tovarsiz)»; ombor «Kirim» ro'yxatida yo'q; varaq ostatkasi SQL bilan mos | #43, #49 |
| S13 | S12 yozuvini bekor qilish | Qarz kamayadi | #43 |
| S14 | B do'kon hisobidan A do'kon savdosi URL'ini ochish | «Savdo topilmadi»; RPC `forbidden` | — |
| S15 | Tarmoqni o'chirib savdo «Saqlash», keyin yoqib qayta urinish | Forma qulflanadi; qayta urinish **takroriy savdo yaratmaydi** | #50 |
| S16 | Telefon (haqiqiy, 375–414px): panel, kirim qatori, Savdolar | Gorizontal siljish yo'q, nom ko'rinadi | #47 |
| S17 | MCP: Claude orqali `draft_sale` → web «Qoralamalar» → Tasdiqlash | Qoralama savdoga aylanadi; OAuth token `post_sale` chaqira olmaydi | — |

Natijalar shu fayldagi jadvalga yoki `docs/HOLAT-STAGING.md` ga yoziladi: ✅ / ❌ + izoh. ❌ bo'lsa yangi W-raqam bilan [WEB-AUDIT.md](WEB-AUDIT.md) ga.

## 4. Merge tartibi (staging S1–S16 yashil bo'lgach, asoschi)

1. #42 (lint), keyin #48 (lint skripti).
2. #43 (SQL 013) → CI production'ga qo'llaydi (asoschi so'zi bilan) → PostgREST schema cache yangilanadi.
3. #45 (W6), #46 (W4), #47 (W5; #46 bilan `PanelWorkspace.tsx` importlarida oddiy to'qnashuv), #50 (W3+W10).
4. #44 (W1) va #49 (W2): **faqat #43 production'da bo'lgandan keyin**. Ungacha ular aniq xato beradi, jim fallback yo'q.
   #44 ni #50 dan keyin `main` ga moslash kerak: `sales/[id]/page.tsx` da to'qnashuv (ikkalasini saqlash: `customer.kind !== 'one_time'` sharti va `RefundChoice`).
5. Boshqa ma'lum to'qnashuvlar (`git merge-tree`, juft-juft): #45 × #50 `dashboard/report/page.tsx` (W6 kassa kartalari va W10 walk-in guruhlash, ikkalasi saqlanadi); #46 × #47 `PanelWorkspace.tsx` importlari. Ketma-ket merge'dan keyin boshqa to'qnashuv chiqishi mumkin.
6. `docs/QARORLAR.md`: bir nechta PR jadval oxiriga qator qo'shgan, merge'da qatorlarni saqlab birlashtirish kerak.

## 5. Qolgan xavflar (staging'da kuzatish)

- `products` da DB UNIQUE yo'q. W4 faqat klientda to'xtatadi; MCP va mobil takror yaratishi mumkin. Keyingi migratsiyadan oldin production'dagi takrorlarni topish kerak.
- W5: tovar yaratilib, `post_purchase` tarmoq sababli yiqilsa, yetim tovar qoladi. To'liq yechim uchun yangi RPC kerak.
- Mobil (muzlatilgan) `'debt'` turini kirim deb ko'rsatadi (summa to'g'ri). [VEB-DAN-MOBILGA.md](VEB-DAN-MOBILGA.md) ga yozilsin.
- Mijoz «Daftarga yozish» (savdo + to'lov) hali ikki RPC. #50 merge bo'lgach `postSale(paid)` ga o'tkaziladi (alohida kichik PR).
