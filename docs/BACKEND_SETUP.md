# Hisobchi Go — backend (Supabase) sozlash

**Holat (2026-10-29):** server sxemasi va RPC'lar yozilgan va **lokal PostgreSQL 16 da** Supabase stub bilan
sinalgan (60 ta tekshiruv). Haqiqiy Supabase loyihasiga **hali qo'llanmagan** — URL/kalitlar yo'q.
Mobil ilova bulutsiz (lokal rejimda) to'liq ishlaydi.

## Arxitektura
- **Asosiy manba:** telefondagi SQLite (offline ishlaydi).
- **Bulut:** Supabase Auth (email + parol) + PostgreSQL + RLS.
- **Yozish yo'li:** moliyaviy jadvallarga klient faqat o'qiydi; yozish faqat `SECURITY DEFINER` RPC orqali:
  `create_shop`, `post_sale`, `reverse_sale`, `record_payment`, `void_payment`.
  Har biri `auth.uid()` a'zoligini tekshiradi, summani serverda qayta hisoblaydi, `client_op_id` bilan idempotent.
- **Mijoz/mahsulot:** RLS bilan CRUD (faqat o'z do'koni, `shop_id` RLS `WITH CHECK` bilan tekshiriladi).
- **Sinxronlash:** bir tomonlama push (`apps/mobile/src/backend/sync.ts`). Bulutdan telefonga o'qish yo'q —
  bo'sh javob lokal ma'lumotni o'chira olmaydi. Hodisalar vaqt tartibida, yuborilganlar `sync_log` da.

## 0. Hozirgi holat (2026-10-30 tekshiruvi, faqat o'qish so'rovlari bilan)
> **ESKIRGAN (02.11.2026).** Quyidagi ikki ref (`yenxvancoduazzpkuqmk`, `ftqhdcphiwyarbgibryn`) endi ishlatilmaydi.
> Joriy loyiha: **`kfrnlkwocwpezwgytcmz`** (ap-south-1, `hisobchi-go`); veb shu yerda ishlaydi, 001 va 003 qo'llangan
> (asoschi bildirgan, bu sessiyada tekshirilmagan). Bu bo'limning qolgani eski holat sifatida saqlangan.

- `apps/mobile/.env` dagi URL: `https://yenxvancoduazzpkuqmk.supabase.co`; kalit — `sb_publishable_` (public).
  Kalit shu loyihaga tegishli (auth/v1/settings → 200).
- Siz aytgan `https://ftqhdcphiwyarbgibryn.supabase.co` loyihasi bu kalitni rad etadi (401).
  **Agar ishlatiladigan loyiha `ftqhdcphiwyarbgibryn` bo'lsa**, `.env` ga o'sha loyihaning URL va
  `Publishable key` (Project Settings → API Keys) qiymatini yozing va 2-bo'limdagi migratsiyalarni o'sha
  loyihada ishga tushiring.
- `yenxvancoduazzpkuqmk` loyihasida 001 + 003 qo'llangan ko'rinadi (jadvallar bor, anon'ga yopiq,
  `create_shop` anon uchun yopiq). Email provayder yoqilgan, email tasdiqlash majburiy.
  Yangilangan 003 ni (qayta ishga tushirish xavfsiz) bir marta yana ishga tushirish tavsiya etiladi.

## 1. Supabase loyihasi (qo'lda, dashboard)
1. https://supabase.com da loyiha yarating (region va reja — sizning qaroringiz).
2. **Authentication → Providers → Email** yoqilgan bo'lsin. "Confirm email" yoqilgan bo'lsa, ro'yxatdan
   o'tgach email tasdiqlanadi (ilova buni aytadi).
3. **Project Settings → API**: `Project URL` va `anon public` kalitni oling. `service_role` ni ilovaga bermang.

### Email tasdiqlash — URL sozlamasi (MAJBURIY, "localhost недоступен" xatosining sababi)
Dashboard → **Authentication → URL Configuration**:
- **Site URL:** `hisobchigo://auth/callback`
  (standart `http://localhost:3000` — telefonda ochilmaydi; ilova har doim `emailRedirectTo` yuboradi,
  Site URL faqat zaxira).
- **Redirect URLs** (Add URL, har birini alohida):
  - `hisobchigo://**` — development/production build (`hisobchigo://auth/callback`)
  - `exp://**` — Expo Go (`exp://<IP>:8081/--/auth/callback` yoki `--tunnel` da `exp://<...>.exp.direct/--/auth/callback`)
- Aniq manzilni ilova ko'rsatadi: development rejimida «Hisob va bulut» → kirish formasining pastida
  «Tasdiqlash havolasi qaytadigan manzil».
- **Email Templates → Confirm signup:** standart shablon (`{{ .ConfirmationURL }}`) mos keladi — o'zgartirish shart emas.

Oqim: ro'yxatdan o'tish → email → havola telefonda ochiladi → Supabase emailni tasdiqlaydi →
`hisobchigo://auth/callback?code=...` → ilova `exchangeCodeForSession` (PKCE) → kirildi → do'kon yaratish.
Muhim: havolani **ro'yxatdan o'tilgan telefonda** oching (PKCE kodi shu qurilmada saqlanadi). Expo Go
bilan sinashda Metro server ishlab turgan bo'lishi kerak. Ba'zi pochta ilovalarining ichki brauzeri
maxsus sxemani ochmasligi mumkin — unda havolani tizim brauzerida oching.

## 2. Migratsiyalarni qo'llash
> **03.11.2026:** endi migratsiyalar `main` ga merge bo'lganda GitHub Actions orqali avtomatik qo'llanadi (`docs/MIGRATSIYA-CI.md`). Quyidagi qo'lda yo'l faqat favqulodda holat uchun.

Tartib bilan: `001_initial_schema.sql` → `003_security_and_mvp_rpc.sql` → `004_mcp_agent.sql` (MCP uchun, ixtiyoriy; qayta ishga tushirish xavfsiz; `docs/MCP-AGENT.md`).
- **Yangi (bo'sh) loyiha:** SQL Editor'da avval 001, keyin 003 ni ishga tushiring.
- **001 allaqachon qo'llangan loyiha:** 001 ni QAYTA ishga tushirmang (indeks/siyosatlar takrorlanadi);
  faqat 003 ni ishga tushiring — u qayta ishga tushirishga xavfsiz (lokal testda ikki marta qo'llanadi).
- Qo'llanganini tekshirish (SQL Editor): `select count(*) from pg_proc where proname in ('create_shop','post_sale','record_payment');` → 3.
`002_test_calculations.sql` — faqat tekshiruv DO bloki (ma'lumot yaratmaydi), qo'llash ixtiyoriy.

Supabase CLI bilan (o'rnatilgan va `supabase login` qilingan bo'lsa):
```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```
Yoki dashboard → **SQL Editor** ga fayllar mazmunini tartib bilan joylab, ishga tushiring.

## 3. Mobil ilovani ulash
```bash
cd apps/mobile
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
# .env ichida EXPO_PUBLIC_SUPABASE_URL va EXPO_PUBLIC_SUPABASE_ANON_KEY ni to'ldiring
npx expo start --clear
```
Ilovada: **Menyu → Hisob va bulut → Ro'yxatdan o'tish / Kirish → Do'kon yaratish → Bulutga yuborish**.

## 4. Testlar
Lokal PostgreSQL'da (Supabase stub, vaqtinchalik baza yaratiladi va o'chiriladi):
```bash
bash supabase/tests/run_local.sh
```
Mobil (fake bulut klienti bilan push mantiqi):
```bash
npm test --workspace=apps/mobile
```

### Haqiqiy Supabase'da hali sinalmagan (credential kerak)
- PostgREST orqali RPC chaqiruvi (pul `bigint` parametrlari string sifatida yuboriladi — PostgREST ularni
  `bigint` ga o'girishi kerak; lokal testda RPC to'g'ridan-to'g'ri SQL bilan chaqirilgan).
- Supabase Auth: ro'yxatdan o'tish, kirish, sessiyani tiklash, token yangilash.
- Supabase'ning haqiqiy standart huquqlari (stub ularni taqlid qiladi; 003 anon'dan barcha
  funksiya va jadval huquqlarini aniq olib tashlaydi).

## Ma'lum cheklovlar
- Bir foydalanuvchi — bitta do'kon (egasi). Xodim qo'shish (a'zolik taklifi) hali yo'q.
- Bulutdan telefonga tiklash (pull / yangi telefonga ko'chirish) hali yo'q.
- "Tarixdan yashirish" faqat telefonda (serverga yuborilmaydi).
- Mijoz/mahsulot: telefondagi oxirgi holat bulutdagini yangilaydi (moliyaviy emas).
