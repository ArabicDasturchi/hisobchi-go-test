# Admin panel (platforma egalari uchun)

Holat (09.11.2026): **A4** (Voronka, Jurnal) va **A3** (Do'konlar ro'yxati, do'kon sahifasi) ham tayyor. **A1** (migratsiya `011_platform_admin.sql` + SQL testlar + shu hujjat) va **A2** (`apps/admin` skeleti, kirish, ruxsat himoyasi, demo, Umumiy ko'rinish) tayyor. Do'konlar, voronka, jurnal sahifalari A3-A4 da.
Haqiqiy Supabase'da **sinalmagan**: SQL testlar lokal PostgreSQL emas, PGlite (WASM Postgres) da o'tdi; CI'da `supabase/tests/run_local.sh` haqiqiy PostgreSQL'da ishlaydi.

Admin panel do'kon egasi ilovasidan (`apps/web`) alohida: faqat asoschilar, faqat o'qish.

## Nima ko'rinadi / nima ko'rinmaydi

| Ko'rinadi | KO'RINMAYDI |
|---|---|
| Do'kon nomi, ochilgan sana | Mijoz nomi, telefoni, izohi |
| Do'kon egasining **ismi va emaili** (qo'llab-quvvatlash uchun) | Egasining telefoni |
| Tovar / mijoz / ta'minotchi / savdo / kirim **soni** | Ta'minotchi nomi, telefoni |
| Oxirgi faollik, voronka bosqichi va qadamlar sanalari | Savdo qatorlari, tovar nomlari |
| Kunma-kun savdo **soni** | Har qanday **summa**, qarz, foyda, qoldiq |

Bu `supabase/tests/80_platform_admin.test.sql` da tekshiriladi (natija kalitlari ro'yxati va maxfiy matn yo'qligi).

## Xavfsizlik modeli

- `platform_admins` va `admin_audit` jadvallarida RLS yoqilgan, **siyosat yo'q**, `anon`/`authenticated` huquqlari olib tashlangan: to'g'ridan-to'g'ri o'qib bo'lmaydi (admin ham o'qiy olmaydi).
- Hamma ma'lumot `SECURITY DEFINER` RPC orqali, `search_path = public, pg_temp`. Har RPC birinchi qadamda `is_platform_admin()` ni tekshiradi, aks holda `not_platform_admin` (42501).
- `EXECUTE` faqat `authenticated` ga; `anon` va PUBLIC ga yo'q. Ichki funksiyalar (`_admin_gate`, `_admin_shop_facts`, `_admin_stage_of`) hech kimga ochiq emas.
- OAuth/agent tokeni (`client_id` claim) admin foydalanuvchiniki bo'lsa ham admin hisoblanmaydi.
- Audit: har muvaffaqiyatli RPC chaqiruvi `admin_audit(admin_id, action, target, at)` ga yoziladi; jadval append-only. `target` faqat do'kon id yoki umumiy belgi (`list`/`search`); **qidiruv matni yozilmaydi** (u email bo'lishi mumkin).
- Hamma sanash SQL'da; UI faqat ko'rsatadi.

## RPC'lar

| RPC | Qaytaradi (jsonb) |
|---|---|
| `is_platform_admin()` | boolean |
| `admin_overview(p_days default 14)` | `shops, users, new_shops_today/7d/30d, sales_today, active_shops_7d, daily[{day,new_shops,sales}]` |
| `admin_shops(search, limit, offset, sort)` | `{total, rows[{id,name,owner_name,owner_email,created_at,last_activity_at,is_stale,products,customers,suppliers,sales,purchases,stage}]}`; `sort` = `activity` \| `new` |
| `admin_shop_detail(shop_id)` | `{...do'kon, counts{...,sales_7d}, activity{payments,supplier_payments,drafts_pending,drafts_accepted} (012), daily_sales[14 kun], steps[{key,at}]}` |
| `admin_funnel()` | `{users, shops, users_without_shop, steps[{key,stage,count,pct_of_registered,pct_of_prev}], stuck{"1".."5": [{id,name}]}}` |
| `admin_my_audit(limit)` | adminning o'z harakatlari (oxirgi 100) |
| `admin_shop_stage(shop_id)` | int (1..6) |

## Ta'riflar (yagona joyda: `_admin_stage_of`, `_admin_shop_facts`)

- **Savdo** = `documents.status = 'posted'` (bekor qilingan `reversed` sanalmaydi). **Kirim** = `purchase_documents` (`kind='purchase'`, `posted`; boshlang'ich qarz kirim emas). **Mijoz** = `kind='regular'` (tizimdagi «Bir martalik mijoz» sanalmaydi).
- **Oxirgi faollik** = `greatest(savdo, kirim, to'lov (mijoz va ta'minotchi), tovar yaratilishi, egasining oxirgi kirishi)`.
- **Faol do'kon (7 kun)** = oxirgi faolligi oxirgi 7 kunda. **Faolsiz (sariq)** = oxirgi faollik (bo'lmasa, ochilgan sana) 7 kundan eski.
- **Bosqich** (erishilgan eng yuqori qadam): 1 do'kon yaratdi · 2 tovar qo'shdi · 3 ta'minotchi qo'shdi · 4 kirim yozdi · 5 birinchi savdo · 6 faol (oxirgi 7 kunda 5+ savdo). 6-bosqich joriy holat: savdo to'xtasa 5 ga qaytadi.
- Voronka: «Ro'yxatdan o'tdi» = barcha `auth.users`; keyingi qadamlar = bosqichi shu qadamga teng yoki yuqori do'konlar. «To'xtagan» = bosqichi aynan shu qadamga teng. Do'kon ochmaganlar faqat son (ularning emaili ko'rsatilmaydi).
- Kunlar `Asia/Tashkent` bo'yicha.

## Adminni qo'shish (qo'lda, SQL Editor'da)

Ro'yxat repoga yozilmaydi. Migratsiya jadvalni bo'sh yaratadi. Avval asoschi ilovada (yoki Supabase Auth'da) email bilan ro'yxatdan o'tadi, keyin:

```sql
insert into platform_admins (user_id)
select id from auth.users where email = 'ASOSCHI@EMAIL.UZ'
on conflict do nothing;
```

Olib tashlash:

```sql
delete from platform_admins where user_id = (select id from auth.users where email = 'ASOSCHI@EMAIL.UZ');
```

Tekshirish: shu foydalanuvchi bilan kirib `select is_platform_admin();` → `true`.

## Production'ga qo'llash

`011` qo'shuvchi migratsiya (xavfli buyruq yo'q), `main` ga merge bo'lganda CI qo'llaydi (`docs/MIGRATSIYA-CI.md`). Merge va qo'llashni asoschi/arxitektor qiladi.

## Ilova (`apps/admin`)

Next.js 16 + React 19 + Tailwind 4, `apps/web` bilan bir xil stack, lekin alohida ilova va alohida sessiya (alohida domen). Umumiy kod `apps/web` dan ko'chirilmagan: admin o'zining kichik komponentlariga ega (`QARORLAR.md`).

```bash
npm run demo:admin          # http://localhost:3100  (soxta 6 do'kon, Supabase'siz; faqat dev serverda)
npm run dev:admin           # haqiqiy rejim: apps/admin/.env.local kerak (.env.example)
npm run build:admin
npm run screenshots:admin   # docs/ekranlar/admin/ (telefon va kompyuter)
```

Kirish: email + parol (ro'yxatdan o'tish yo'q). `src/proxy.ts`: sessiya yo'q → `/login`; sessiya bor, lekin `is_platform_admin()` false → `/forbidden` («Ruxsat yo'q», «Chiqish» tugmasi). Bu birinchi qatlam; haqiqiy himoya RPC ichida.
Ma'lumot faqat `admin_*` RPC orqali (`src/lib/api.ts`); jadvallarga to'g'ridan-to'g'ri so'rov yo'q (testda tekshiriladi).

## Vercel (asoschi qiladi)

1. Yangi loyiha `hisobchi-go-admin`, **Root Directory = `apps/admin`** (`vercel.json` tayyor).
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (faqat public kalit).
3. Supabase → Auth → URL Configuration: admin domenini ruxsat ro'yxatiga qo'shing.
4. `NEXT_PUBLIC_ADMIN_DEMO` production'da e'tiborga olinmaydi (demo orqali kirib bo'lmaydi).

## Migratsiya 012

`012_admin_shop_activity.sql`: faqat `admin_shop_detail` qayta yoziladi (imzo o'sha, eski maydonlar o'zgarmagan), yangi kalit `activity`: to'lov sonlari (bekor qilinganlarsiz) va agent qoralamalari (`draft` = kutayotgan, `accepted` = tasdiqlangan; rad etilganlar sanalmaydi). Faqat sonlar. 012 qo'llanmaguncha ilova do'kon sahifasida bu to'rt kartani ko'rsatmaydi (kalit ixtiyoriy).
