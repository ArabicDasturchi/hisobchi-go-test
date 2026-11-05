# Migratsiyalar avtomatik qo'llanishi (GitHub Actions + Supabase CLI)

Holat (03.11.2026): workflow yozilgan va **lokal sinalgan** (haqiqiy Supabase CLI 3.0.0 bilan lokal PostgreSQL'da). **Production'ga hali
qo'llanmagan, GitHub'da hali ishga tushirilmagan**: Secrets kiritilmagan. Pastdagi "Sinalgan / sinalmagan" bo'limiga qarang.

Fayl: `.github/workflows/migrate.yml`. Qo'riqchi skript: `scripts/ci/migration-guard.mjs` (testlari: `npm run test:ci`).
Loyiha: `kfrnlkwocwpezwgytcmz` (ref sir emas).

## 1. Qanday ishlaydi

`main` ga `supabase/migrations/**` o'zgargan commit tushsa (yoki qo'lda "Run workflow", `mode=migrate`):

```
Testlar  ──►  Reja  ──►  [xavfli bo'lsa: tasdiq]  ──►  Qo'llash
```

| Bosqich | Nima qiladi | Qachon to'xtaydi |
|---|---|---|
| **Testlar** | `npm ci`, `npm run typecheck`, `npm test`, `supabase/tests/run_local.sh` (001-004 va xavfsizlik testlari, lokal PostgreSQL konteynerida) | Biror test qizil bo'lsa: migratsiya qo'llanmaydi |
| **Reja** | Supabase'ga ulanadi (`supabase link`), tarixni (`migration list`) va zaxira holatini chop etadi, `db push --dry-run` bilan kutilayotgan fayllarni topadi, qo'riqchi skriptni ishga tushiradi | 001-004 kutilayotgan bo'lsa (baseline qilinmagan); dry-run chiqishi tushunarsiz bo'lsa |
| **Qo'llash** | Kutilayotgan ro'yxat rejadagi bilan bir xilligini qayta tekshiradi, `supabase db push --yes`, keyin "kutilayotgan qolmadi" tekshiruvi | Migratsiya xato bersa; ro'yxat o'zgargan bo'lsa |

- **Oddiy qo'shuvchi migratsiya** (`CREATE`, `ALTER ... ADD`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` va h.k.) o'zi o'tadi, muhit `production`.
- **Xavfli migratsiya** bo'lsa Qo'llash `production-approval` muhitida to'xtab, tasdiq kutadi (4-bo'lim).
- **Bir vaqtda bitta ish:** `concurrency: supabase-migrate-production`, `cancel-in-progress: false` (ishlayotgan migratsiya o'rtasida to'xtatilmaydi). Navbatda bitta ish kutadi; keyingi ish hamma kutilayotgan migratsiyani qo'llaydi, shuning uchun bekor bo'lgan navbatdagi ish hech narsani yo'qotmaydi.
- **Atomiklik:** CLI har migratsiya faylini **bitta tranzaksiyada** bajaradi. Lokal sinovda faylning 3-buyrug'i xato berganda 1- va 2-buyruqlar ham bekor bo'ldi, tarixga yozilmadi. Ammo oldingi **fayllar** qo'llangan bo'lib qoladi (har fayl alohida). Tranzaksiyada ishlamaydigan buyruqlar (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE ... ADD VALUE`) bu usulda qo'llanmaydi: ularni alohida, qo'lda bajaring.

## 2. Tarix muammosi (001-004) va baseline

001-004 SQL Editor'da qo'lda qo'llangan, Supabase'ning migratsiya tarixi (`supabase_migrations.schema_migrations`) da yo'q. Tarixsiz `db push` ularni
**qayta ishga tushirmoqchi** bo'ladi. Lokal sinovda dry-run aynan shuni ko'rsatdi: bo'sh tarixda 001, 002, 003 va 004 kutilayotgan bo'lib chiqdi.
001 ni qayta ishga tushirib bo'lmaydi: u `CREATE INDEX` ni `IF NOT EXISTS` siz yozgan. Lokal sinovda qayta ishga tushirish `relation "idx_shop_members_user" already exists` xatosi bilan yiqildi (tranzaksiya bekor bo'ldi, zarar yo'q, lekin ish to'xtab qoladi; `BACKEND_SETUP.md` ham "001 ni qayta ishga tushirmang" deydi). 003 va 004 qayta ishga tushirishga xavfsiz (lokal sinovda ikki marta xatosiz o'tdi), shuning uchun 001 asosiy to'siq.

Yechim, Supabase hujjatidagi usul: `supabase migration repair --status applied <versiyalar>`. Bu **faqat tarixga yozadi, SQL bajarmaydi**.

**Xavfsizlik to'ri:** qo'riqchi skript (Reja bosqichi) kutilayotganlar orasida 001-004 dan birortasini ko'rsa, ishni to'xtatadi va `mode=baseline` ni so'raydi.
Shuning uchun baseline qilinmasdan birinchi `migrate` ishga tushsa ham 001-004 qayta qo'llanmaydi.

**Baseline** (bir marta, qo'lda): "Run workflow" → `mode=baseline`, `confirm=kfrnlkwocwpezwgytcmz`. Ish:
1. `confirm` loyiha ref'iga teng ekanini tekshiradi (xato yozilsa to'xtaydi);
2. `production-approval` muhiti tasdig'ini kutadi;
3. `supabase migration list --remote` bilan tarixni chop etadi va faqat tarixda **yo'q** 001-004 ni aniqlaydi (allaqachon belgilanganlariga tegmaydi). Bazada tarixi bor, lekin repoda fayli yo'q migratsiya topilsa to'xtaydi;
4. `repair --status applied` bilan belgilaydi;
5. tekshiradi: 001-004 endi kutilayotgan emas.

> **Baseline'dan oldin o'zingiz tekshiring:** 001, 003, 004 haqiqatan qo'llanganmi? Aks holda baseline "qo'llangan" deb yolg'on yozadi va ular hech qachon qo'llanmaydi.
> Supabase SQL Editor'da:
> ```sql
> select
>   to_regclass('public.documents') is not null                              as m001,
>   exists (select 1 from pg_proc where proname = 'post_sale')              as m003,
>   exists (select 1 from pg_proc where proname = 'accept_agent_draft')     as m004;
> ```
> Uchalasi `true` bo'lishi kerak. **002** (`002_test_calculations.sql`) faqat tekshiruv bloki, ma'lumot yaratmaydi; baseline uni ham "qo'llangan" deb belgilaydi, qo'llangan yoki qo'llanmaganidan qat'i nazar zarari yo'q.

## 3. Fayl nomi formati

Supabase CLI 3.0.0 (lokal sinov): `001_initial_schema.sql` ko'rinishidagi nomlar **qabul qilinadi**; versiya `001`, nomi `initial_schema` bo'ladi. **Fayllarni qayta nomlash shart emas**: mavjud nomlar o'zgarmaydi (bu eng kam xavfli yo'l; qayta nomlansa tarixdagi versiyalar mos kelmay qolardi).

Qoidalar (CLI migratsiyalarni nom bo'yicha tartiblaydi):
- Yangi fayl: **`005_nom.sql`, `006_nom.sql`, ...** ketma-ket, 3 xonali raqam bilan.
- `supabase migration new` ishlatmang: u vaqt belgisi (`20261103...`) beradi. Raqamli va vaqt belgili nomlarni **aralashtirmang**: keyin qo'shilgan `006_...` allaqachon qo'llangan `2026...` dan "eski" bo'lib qolib, `db push` xato beradi.
- Qo'llangan faylni **tahrirlamang**: tuzatish uchun yangi fayl yozing.
- Migratsiyalarni qayta ishga tushirishga xavfsiz yozing (`IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE OR REPLACE`): 003 va 004 shunday.
- `supabase/seed.sql` yoki `roles.sql` qo'shmang: `db push` ularni sukut bo'yicha qo'llamaydi, baribir hozircha kerak emas.

## 4. Xavfli migratsiya: qo'lda tasdiq

Qo'riqchi kutilayotgan fayllardan izohlarni olib tashlab, quyidagilarni qidiradi:

`DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`, `DROP COLUMN`, `TRUNCATE`, `WHERE`siz `DELETE FROM`.

Topilsa `dangerous=true`: Qo'llash `production-approval` muhitiga o'tadi va **Required reviewers** tasdiqlamaguncha kutadi. Reja bosqichining "Summary" qismida qaysi fayl, qaysi qator va qaysi buyruq ekani yoziladi.
`DROP POLICY/TRIGGER/FUNCTION ... IF EXISTS` xavfli hisoblanmaydi (003/004 shunday yozilgan). Tahlil **cheklangan**: `EXECUTE '...'` ichidagi dinamik SQL, `UPDATE` ni `WHERE`siz yozish, `ALTER COLUMN ... TYPE` aniqlanmaydi. Ma'lumotni o'zgartiradigan migratsiyani merge qilishdan oldin ko'zdan kechiring.

## 5. Zaxira (backup)

- Supabase hujjatiga ko'ra avtomatik kunlik zaxira **faqat Pro (7 kun), Team (14), Enterprise (30)** rejalarida bor; Free rejada yo'q (hujjat `supabase db dump` bilan o'zingiz eksport qilishni tavsiya etadi). Kunlik zaxira Dashboard > Database > Backups da ko'rinadi.
- Workflow Reja bosqichida `supabase backups list --remote` ni chaqiradi (ma'lumot uchun; **bloklamaydi**). Bu CLI buyrug'i jismoniy zaxiralarni ko'rsatadi. Sizning rejangiz va ro'yxat nima qaytarishi **topilmadi**: bu sessiyada token va tarmoq yo'q edi, tekshirilmagan.
- **Sizdan:** loyiha qaysi rejada ekanini bilib oling. Free bo'lsa, xavfli migratsiyadan oldin zaxira yo'q deb hisoblang va qo'lda `supabase db dump` oling (mijoz ma'lumotlari bor, shuning uchun faylni repoga yoki GitHub artifact'ga **qo'ymang**). Shu sababli workflow ma'lumot dump'ini GitHub'ga yuklamaydi.

## 6. Asoschi bir marta qiladi

1. **Supabase access token:** Supabase > Account > Access Tokens > yangi token yarating, nomi `github-migrate`. Token faqat bir marta ko'rsatiladi, nusxalang.
2. **Baza paroli:** Project Settings > Database. Parolni bilsangiz uni ishlating; bilmasangiz yangilang ("Reset database password"). Veb, mobil va MCP bazaga parol bilan ulanmaydi (ular publishable kalit va foydalanuvchi tokeni bilan ishlaydi), repoda DB parolini ishlatadigan joy **topilmadi**, lekin yangilashdan oldin boshqa xizmat (masalan Vercel'dagi ulanish) uni ishlatmayotganini o'zingiz tekshiring.
3. **GitHub Secrets:** repo > Settings > Secrets and variables > Actions > New repository secret. Ikkita secret, nomlari aynan:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`

   Qiymatlarni faqat shu oynaga kiriting: repoga, chatga, PR yoki loglarga yozmang. `service_role` kaliti kerak emas va kiritilmaydi.
4. **GitHub Environments:** repo > Settings > Environments > New environment, ikkita:
   - `production`: himoyasiz (oddiy migratsiyalar shu yerdan o'tadi);
   - `production-approval`: **Required reviewers** ni yoqing va o'zingizni (va xohlasangiz Humoyunni) qo'shing. Xavfli migratsiya va baseline shu muhitda tasdiq kutadi.

   Eslatma: shaxsiy hisobdagi **private** repo uchun Required reviewers GitHub tarifiga bog'liq bo'lishi mumkin, bu tekshirilmagan. Imkoni bo'lmasa, muhit tasdiqsiz o'tib ketadi: xavfli migratsiyani merge qilishdan oldin o'zingiz tekshiring.
5. **Birinchi sinov** (ketma-ket):
   1. 2-bo'limdagi SQL bilan 001/003/004 qo'llanganini tekshiring.
   2. Actions > "Migratsiya (Supabase)" > Run workflow: `mode=baseline`, `confirm=kfrnlkwocwpezwgytcmz` > tasdiqlang. Logda `Repaired migration history: [001 002 003 004] => applied` ko'rinishi kerak.
   3. Yana Run workflow: `mode=migrate`. Kutilgan natija: Testlar yashil, Reja "Kutilayotgan migratsiya yo'q", Qo'llash o'tkazib yuboriladi. Bu Secrets, ulanish va testlarni tekshiradi.
   4. Birinchi haqiqiy migratsiya (`005_...`) PR orqali merge qilinganda avtomatik qo'llanadi.

## 7. Xato bo'lsa

| Belgi | Sabab va qilinadigan ish |
|---|---|
| **Testlar** qizil | Migratsiya qo'llanmadi (kutilganidek). Xatoni tuzating, qayta merge qiling |
| "GitHub Secrets'da ... yo'q" | 6-bo'lim, 3-qadam |
| Reja: "qo'lda qo'llangan migratsiyalar yo'q: 001..." | Baseline qilinmagan: 2-bo'lim |
| Reja: "chiqishi tushunarsiz" | CLI versiyasi o'zgargan yoki ulanish xatosi. Logdagi `dry-run.txt` chiqishini ko'ring. Hech narsa qo'llanmagan |
| Link / parol / token xatosi | Secrets noto'g'ri yoki token muddati o'tgan: yangisini yarating |
| Ulanish vaqti tugadi | Supabase to'g'ridan-to'g'ri bazasi IPv6 bo'lishi mumkin, GitHub runner esa IPv4. `supabase link` pooler manzilini saqlaydi; ishlamasa xabar bering. **Haqiqiy loyihada sinalmagan** |
| Qo'llashda SQL xatosi | Shu fayl to'liq bekor qilindi (tarixga yozilmadi). Oldingi fayllar qo'llangan qoladi. Xatoni **yangi** tuzatuvchi fayl bilan (yoki hali qo'llanmagan faylni tahrirlab) tuzating va merge qiling |
| "Remote migration versions not found in local migrations directory" | Bazada tarixi bor, repoda fayli yo'q (kimdir boshqa joydan qo'llagan). Avval aniqlang, `db push` ni majburlamang |
| Tasdiqdan keyin "kutilayotgan migratsiyalar o'zgardi" | Tasdiq va qo'llash orasida `main` ga yangi migratsiya tushgan. Ishni qayta ishga tushiring, yangi reja ko'rinadi |
| Migratsiya qo'llandi, lekin ilova buzildi | Fayl tarixda "qo'llangan". Tuzatuvchi `00N_...sql` yozing. Eski faylni tahrirlash yoki `repair --status reverted` bilan tarixni qaytarish faqat SQL'ning natijasi allaqachon qaytarilgan bo'lsagina |

## 8. Qo'lda yo'l (zaxira, favqulodda)

Workflow ishlamasa migratsiyani SQL Editor'ga joylab ishga tushirish mumkin. **Shundan keyin tarixni yangilang**, aks holda CI uni yana qo'llamoqchi bo'ladi
(Supabase hujjati: Dashboard orqali o'zgartirish tarixni chetlab o'tadi va `db push` xato beradi). Variantlar:
- Ish stoli CLI'si: `supabase migration repair --status applied 005 --remote` (loyihaga `supabase link` qilingan bo'lishi kerak);
- yoki fayl `IF NOT EXISTS` bilan idempotent yozilgan bo'lsa, CI uni qayta qo'llashi zarar qilmaydi: baribir `migrate` ishi uni qayd etadi.

## 9. Sinalgan / sinalmagan

**Lokal sinalgan** (Supabase CLI 3.0.0, lokal PostgreSQL 16, Supabase stub):
- `001_` nomlari qabul qilinadi; bo'sh tarixda `db push --dry-run` 001-004 ni kutilayotgan deb ko'rsatadi; `migration repair --status applied` tarixga yozadi va SQL'ni bajarmaydi; shundan keyin "up to date".
- Toza bazada 001-004 CLI orqali xatosiz qo'llanadi (CLI ning SQL ajratgichi `$$`, `DO` bloklari, `#variable_conflict` bilan muammosiz); ikkinchi `push` hech narsa qilmaydi.
- Atomiklik: ikkinchi fayl xato berdi, uning birinchi buyrug'i ham bekor bo'ldi, tarixda faqat birinchi fayl qoldi.
- Butun oqim qo'riqchi bilan: bo'sh tarixda to'xtaydi, baseline, qo'shuvchi `005` o'tadi (`dangerous=false`), `DROP TABLE` `dangerous=true`.
- `scripts/ci/migration-guard.test.mjs` (21 test), `actionlint` workflow'da xato topmadi.

**Sinalmagan (haqiqiy muhit kerak):**
- GitHub'da ishga tushirish; `supabase/setup-cli@v1` ning `version: 3.0.0` bilan o'rnatishi.
- Haqiqiy loyihaga `supabase link`, `SUPABASE_DB_PASSWORD` env orqali parol uzatilishi (CLI binarida o'zgaruvchi nomi mavjud, lekin ulanib ko'rilmagan), pooler/IPv6.
- `--remote` bayrog'i (3.0.0 yordamida shunday), `supabase backups list --remote` natijasi.
- Environment'larda Required reviewers (tarifga bog'liq).
- Production bazaning haqiqiy migratsiya tarixi holati (bo'sh deb faraz qilingan; `schema_migrations` jadvali allaqachon bor bo'lishi ham mumkin, baseline uni hisobga oladi).

**PR'da testlar:** `.github/workflows/ci.yml` (04.11.2026) har PRda `npm ci`, typecheck, `npm test`, veb build, mobil bundle va SQL testlarni ishga tushiradi (10-bo'lim). GitHub'da hali ishga tushirilmagan (shu PR merge bo'lgach ko'rinadi).

## 10. CI (har PR) va staging

### PR'dagi CI (`ci.yml`)

Ish nomlari (branch himoyasi shunga tayanadi): **`CI / Testlar`**, **`CI / Veb build`**, **`CI / Mobil bundle`**, **`CI / SQL testlar`**. Sirlar kerak emas. SQL testlar lokal PostgreSQL konteynerida (`supabase/tests/run_local.sh`, 001-008). Branch himoyasi: repo > Settings > Branches > `main` > "Require status checks to pass" va shu to'rttasini tanlang (ish bir marta ishlagandan keyin ro'yxatda ko'rinadi).

### Staging ("Staging'ga qo'llash", `migrate-staging.yml`)

Maqsad: migratsiya production'ga tushishdan oldin haqiqiy Supabase'da (bo'sh, alohida loyihada) qo'llanib sinalsin. Loyihani va sirlarni asoschi yaratadi; men yaratmadim va sir so'ramadim.

Ish: `supabase/migrations/**` o'zgargan PRda (va qo'lda "Run workflow") staging'ga `supabase db push` qiladi, keyin "kutilayotgan qolmadi" tekshiruvi. Staging toza bo'lgani uchun 001-004 ham haqiqatan qo'llanadi (baseline va qo'riqchi ishlatilmaydi). Sirlar yo'q bo'lsa ish "o'tkazib yuborildi" deb yashil tugaydi va PRni to'smaydi.

**Asoschi bir marta qiladi:**
1. supabase.com > New project: nomi `hisobchi-go-staging`, bepul reja, region production bilan bir xil. Bazaga ma'lumot kiritmang (faqat soxta).
2. Account > Access Tokens: token `github-staging` (bo'lsa production tokenini ishlatish mumkin, lekin alohida token ma'qul). Database parolini saqlang.
3. GitHub > repo > Settings > Environments > New environment: **`staging`** (himoyasiz). Environment secrets (nomlari aynan): `STAGING_SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_DB_PASSWORD`, `STAGING_SUPABASE_PROJECT_REF` (loyiha ref'i).
4. Actions > "Migratsiya (staging)" > Run workflow. Kutilgan natija: 001-008 qo'llandi, "up to date".
5. Ixtiyoriy: Vercel `hisobchi-go-web` loyihasida **Preview** muhiti uchun `NEXT_PUBLIC_SUPABASE_URL` va `NEXT_PUBLIC_SUPABASE_ANON_KEY` ga staging qiymatlarini bering: PR preview havolasi staging bazasiga ulanadi, productionga emas. Supabase staging > Authentication > URL Configuration > Redirect URLs ga `https://hisobchi-go-web-*-abdulloh777.vercel.app/**` qo'shing.

**Tartib (migratsiyali ish):** SQL PR ochiladi, staging yashil, `main` ga merge, production CI qo'llaydi, shundan keyin ilova PR'i ([ISH-TARTIBI.md](ISH-TARTIBI.md)).

**Sinalmagan:** workflow GitHub'da ishga tushirilmagan (faqat YAML sintaksisi tekshirilgan, actionlint ishlatilmagan), staging loyihasi yo'q, bepul rejadagi cheklovlar (pauza) hisobga olinmagan.
