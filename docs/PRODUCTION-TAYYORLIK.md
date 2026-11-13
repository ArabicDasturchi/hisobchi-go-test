# Production'ga tayyorlik: staging, server, TLS, zaxira, monitoring

Sana: 12.11.2026. Holat: **reja va tayyor vositalar**. Asoschi hisoblari va sirlari kerak bo'lgan qadamlar belgilangan (Claude Code qila olmaydi). Production bazaga hech narsa qo'llanmagan.

Bog'liq hujjatlar: [STAGING-TEKSHIRUV.md](STAGING-TEKSHIRUV.md), [STAGING-CHECKLIST.md](STAGING-CHECKLIST.md) (S1–S15), [MIGRATSIYA-CI.md](MIGRATSIYA-CI.md), [AI-PROVAYDER.md](AI-PROVAYDER.md).

## 1. Arxitektura tanlovi (server/VPS)

| Qism | Tavsiya | Sabab |
|---|---|---|
| Baza, Auth, Edge Functions | **Supabase Cloud** (hozirgi loyiha), pullik reja | O'zi o'rnatiladigan Supabase odatda kamida 4 GB xotira talab qiladi (asoschi hujjati). 6–8 $ lik VPS'da u xavfli. Cloud'da zaxira, yangilanish va TLS tayyor |
| Web (Next.js) | **Vercel** (hozirgi `hisobchi-go-web`) | TLS va domen avtomatik, preview deploy'lar staging uchun tayyor |
| VPS | **Hozircha kerak emas** | Faqat MCP serveri (`apps/mcp`) uchun kerak bo'lishi mumkin. Unda 2–4 GB'lik VPS, Docker, Caddy (TLS avtomatik) |

Narx va reja imkoniyatlari (kunlik zaxira, PITR) Supabase va Vercel saytida **tekshirilsin**: bu hujjat ularni tasdiqlamaydi.

## 2. Migratsiyalar tartibi (faqat asoschi so'zi bilan)

| Raqam | Mazmun | PR turi | Xavf |
|---|---|---|---|
| 013 | Savdoni to'lovi bilan bekor qilish, ta'minotchi qarz yozuvi | merge qilingan; production'da qo'llanganligi **tekshirilmagan** | past |
| 015 | Xavfsizlik va barqarorlik (B2) | faqat SQL | K3 birlik qulfi saqlanadi (QARORLAR 13.11): web oldindan to'xtatadi, mobilga talab yozildi. 11 indeks qisqa yozish qulfi beradi |
| 016 | Savat (F2) | faqat SQL | yangi jadval, mavjud ma'lumotga tegmaydi |
| 017 | Audit va kirimni to'lovi bilan bekor qilish (F3) | faqat SQL | trigger'lar har tuzatishda bitta qator qo'shadi |
| 018 | AI sarf jurnali va limit (F4/F5) | faqat SQL | yangi jadval |
| 019 | Rollar: sotuvchi bekor qila olmaydi / ombor tuzata olmaydi | faqat SQL | trigger; hozir har do'konda faqat egasi bor — ta'sir yo'q |

Har migratsiya: avval **staging** → `bash supabase/tests/run_local.sh` (lokal: 889 PASS) → staging'da S1–S15 + quyidagi yangi oqimlar → asoschi so'zi → `main` ga merge → CI `migrate.yml` qo'llaydi.

Web 016/017/018 qo'llanmagan serverda ham buzilmaydi:
- savat shu brauzerda saqlanadi;
- kirim avvalgi yo'l bilan bekor qilinadi va savdogarga aytiladi;
- AI "ulanmagan" deydi.

Bu xatti-harakat testlar bilan tekshirilgan.

## 3. Staging (B1) — asoschi qiladi, keyin Claude Code sinaydi

1. Asoschi: [STAGING-TEKSHIRUV.md](STAGING-TEKSHIRUV.md) 1-bo'lim (staging loyiha, GitHub `staging` muhiti sirlari, Vercel Preview env, Redirect URL'lar, leaked password protection).
2. Claude Code: `migrate-staging.yml` bilan 001–019, keyin [STAGING-CHECKLIST.md](STAGING-CHECKLIST.md) S1–S15. Yangi oqimlar:
   - **F1:** 10 qatorli ro'yxat joylash → tasdiq → `post_sale`. Jami serverda qayta hisoblanadi.
   - **F2:**
     - ikki mijoz savati;
     - boshqa qurilmada o'zgartirish (to'qnashuv oynasi);
     - tasdiqlangach `baskets.status = done`;
     - sahifa yangilansa ham savatlar joyida;
     - AI qoralamasini savatga olish.
   - **F3:**
     - kirimni to'lovi bilan bekor qilish: ta'minotchi qarzi to'g'ri qaytadi;
     - O'zgarishlar tarixi yozuvlari ko'rinadi.
   - **F4/F5:**
     - provayder ulangach: matn, ovoz va rasmdan qatorlar;
     - `ai_usage_summary`;
     - limit (200 so'rov).
   - **B2:**
     - ikki do'kon ajratilishi;
     - OAuth token yozolmasligi;
     - parallel takror yuborishda dublikat yo'qligi.

## 4. Muhit o'zgaruvchilari

| Joy | O'zgaruvchi | Izoh |
|---|---|---|
| Vercel (web) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` | anon kalit ommaviy. **service_role web'da yo'q** |
| Supabase secrets (Edge Function) | `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_ALLOWED_ORIGINS` | [AI-PROVAYDER.md](AI-PROVAYDER.md) 3-bo'lim. Kalit faqat `supabase secrets set` bilan |
| GitHub Environments | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (+ `STAGING_*`) | [MIGRATSIYA-CI.md](MIGRATSIYA-CI.md) |
| Lokal zaxira | `ZAXIRA_DB_URL` | faqat terminalda, repoga yozilmaydi |

Repoda `.env` yo'q (gitignore). Kalit, parol va mijoz telefoni kodda yo'q.

## 5. TLS va domen

- **Web:** Vercel → Project → Domains → domen qo'shiladi, DNS'da `A`/`CNAME` yozuvi. Sertifikatni Vercel avtomatik beradi va yangilaydi.
- Supabase Auth → URL Configuration: Site URL va Redirect URLs yangi domenga moslanadi. `NEXT_PUBLIC_SITE_URL` ham yangilanadi.
- **Edge Function:** `AI_ALLOWED_ORIGINS` = yangi domen.
- **MCP** (VPS bo'lsa): Caddy `mcp.domen.uz { reverse_proxy localhost:PORT }`, sertifikat avtomatik.

## 6. Zaxira va tiklash

1. **Asosiy zaxira:** Supabase rejasidagi kunlik zaxira va PITR (yoqilganini Dashboard → Database → Backups'da **tekshiring**).
2. **Qo'shimcha qo'lda zaxira** (haftasiga bir marta va har migratsiyadan oldin):
   ```bash
   ZAXIRA_DB_URL='postgresql://...' bash scripts/zaxira/zaxira.sh ./zaxira
   ```
   Natija: `pg_dump` custom format va `.sha256`. `zaxira/` va `*.dump` gitignore'da.
3. **Tiklashni amalda sinash** (lokal PostgreSQL, production'ga tegmaydi):
   ```bash
   bash scripts/zaxira/tiklash-sinov.sh ./zaxira/hisobchi-....dump
   ```
   Skript qiladi:
   - nazorat yig'indisini tekshiradi;
   - vaqtinchalik bazaga tiklaydi;
   - jadvallar sonini chiqaradi;
   - har savdo jami = qatorlar yig'indisi (ikki yo'l formulasi) ekanini tekshiradi;
   - bazani o'chiradi.

   **12.11.2026 da lokal test bazasida sinaldi:** 13 jadval tiklandi, mos kelmagan savdo 0. Haqiqiy Supabase zaxirasi bilan **sinalmagan**.
4. Savdogar o'zi ham yuklab oladi: Sozlamalar → Ma'lumotlar → «Hammasini yuklab olish» (9 ta CSV).

## 7. Monitoring

| Nima | Qayerda |
|---|---|
| RPC/SQL xatolari | Supabase Dashboard → Logs (Postgres, API). Biznes xatolari web'da o'zbekcha xabarga aylanadi (`lib/errors.ts`) |
| Edge Function | Supabase → Edge Functions → `ai-parse` → Logs. Logda faqat kod, davomiylik va token; matn, rasm va ism yo'q |
| AI sarfi | `select * from ai_usage_summary('<shop>', 30)`: kun, rejim, so'rovlar, xatolar, tokenlar |
| Tuzatishlar/bekor qilishlar | Ilova: Sozlamalar → O'zgarishlar tarixi (`audit_log`) |
| Web ishlashi | Vercel → Deployments/Logs |
| Platforma (admin) | `apps/admin` (do'konlar faolligi, faqat sonlar) |

Tavsiya: Supabase'da Postgres xato logi uchun ogohlantirish (alert) va Vercel'da deploy xatosi xabari. Bu asoschi akkauntida sozlanadi.

## 8. Rollar

DB'da `owner/admin/member` rollari bor. Web hozir hamma ruxsatni bitta joydan tekshiradi (`lib/permissions.ts`). Lekin `staff` uchun narx, tan narx va bekor qilish cheklovi RLS/RPC darajasida **yo'q**.

Buni qilish uchun asoschi qarori kerak: sotuvchi nimani ko'radi va nimani bekor qila oladi. Qaror bo'lgach:
- yangi migratsiya: RPC ichida `role` tekshiruvi;
- `PERMISSIONS` jadvalini yangilash.

## 9. Chiqishdan oldingi tekshiruv ro'yxati

- [ ] Staging'da 001–018 qo'llandi, S1–S15 va 3-bo'limdagi yangi oqimlar ✅
- [ ] AI provayderi tanlandi, `AI_*` sirlari GitHub Environments'ga kiritildi, Actions → «Edge Function deploy (ai-parse)» (staging, keyin production)
- [ ] Production zaxirasi olindi (`zaxira.sh`) va tiklash sinaldi (`tiklash-sinov.sh`)
- [ ] Domen, TLS, Redirect URL'lar, `AI_ALLOWED_ORIGINS`
- [ ] Supabase va Vercel ogohlantirishlari yoqilgan
- [ ] Har PR: `npm test`, `npm run typecheck`, `npm run lint:web`, `npm run build:web`, `run_local.sh` yashil
