# HOLAT — ADMIN-1 (09.11.2026)

| Bosqich | Holat | PR |
|---|---|---|
| A1 Migratsiya 011 + SQL testlar + ADMIN.md | tayyor | #30 |
| A2 apps/admin skeleti, kirish, demo, Umumiy ko'rinish | tayyor | #31 (baza: A1) |
| A3 Do'konlar + do'kon sahifasi | tayyor | #33 (baza: A2) |
| A4 Voronka + Jurnal | tayyor | A4 PR (baza: A3) |
| A5 Xatolar va murojaatlar (`012_`, apps/web qo'shimchalari) | **boshlanmadi** | — |

PR'lar stacked (sabab: `QARORLAR.md`). Merge tartibi: #30 → #31 → #33 → A4; har merge'dan keyin keyingi PR bazasi `main` ga o'tadi.

## Sinalgan
- SQL testlar (`80_platform_admin.test.sql`) PGlite (WASM Postgres) da o'tdi; mutatsiya sinovida (admin tekshiruvi buzilsa) qizil bo'ldi.
- `apps/admin`: typecheck, lint, 32 test, build yashil. Demo'da hamma ekran ko'rildi, skrinshotlar `docs/ekranlar/admin/`.

## Sinalmagan
- Haqiqiy PostgreSQL'da `run_local.sh` (bu mashinada psql yo'q; CI'da ishlaydi) va haqiqiy Supabase `auth.users` ustunlari.
- Haqiqiy Supabase bilan kirish / `/forbidden`, Vercel deploy, haqiqiy telefon.
- `apps/web` testi `auth-and-io › sinxronlash holati` to'liq yugurishda ba'zan 5s timeout beradi (yakka o'tadi; admin ishiga aloqasi yo'q).

## Asoschiga qoldi
1. PR'larni merge qilish; 011 migratsiyasi `main` ga tushganda CI production'ga qo'llaydi.
2. Vercel `hisobchi-go-admin` (Root Directory `apps/admin`), env, Supabase Auth'da admin domeni.
3. Adminlarni qo'shish: `docs/ADMIN.md` dagi SQL.

## Keyingi qadam
A5: `012_` migratsiya (`app_errors`, `feedback`), `apps/web` da global xato ushlagich va «Fikr bildirish», adminda «Xatolar»/«Murojaatlar» (faqat o'qish). Avval A1-A4 merge qilinsin.
