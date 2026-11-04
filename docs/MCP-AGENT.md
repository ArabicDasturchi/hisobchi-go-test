# MCP / Connector: Hisobchi Go'ga tashqi AI orqali kirish

Holat (03.11.2026): **kod yozilgan va lokal sinalgan; Claude/ChatGPT bilan ulanish haqiqiy muhitda sinalmagan.** 004 va 005 migratsiyalari `main` ga merge bo'lganda CI qo'llaydi (`docs/MIGRATSIYA-CI.md`).

> **Katalog (03.11.2026, 005):** agent mijoz va tovarni **qo'sha oladi** (tasdiqsiz); o'zgartirish va arxiv faqat **tasdiqlash so'rovi**.
> Savdo, to'lov va (keyingi bosqichda) kirim hamon faqat qoralama. 2-bandga qarang.

> **Qoralamalar veb panelda ko'rinadi** (`/drafts`): ro'yxat, "Tasdiqlash" va "Rad etish". **Mobil ilovada hali yo'q**: savdogar
> qoralamani faqat veb panelda hal qila oladi (9-bo'lim). Veb panel va 004 migratsiyasi birga qo'llanishi kerak; 004
> qo'llanmagan bo'lsa "Qoralamalar" sahifasi xabar ko'rsatadi, qolgan sahifalar ishlayveradi.

## 1. Maqsad

Asoschi Claude / ChatGPT orqali Hisobchi Go ichida ishlay oladi: ko'rish (mijoz, qarz, savdo, kunlik hisobot) va qoralama
yaratish. Tasdiqlash faqat ilovada, savdogar qo'li bilan.

## 2. Qoidalar (CLAUDE.md dan, buzilmaydi)

1. AI yig'indi hisoblamaydi. AI bazaga o'zi yozmaydi, **faqat katalog (mijoz, tovar) QO'SHISH bundan mustasno** (asoschi qarori, 03.11.2026): u zararsiz va qaytariladi. Katalogni o'zgartirish/arxivlash faqat tasdiqlash so'rovi; savdo faqat `post_sale` orqali, MCP uni chaqirmaydi.
2. Pul va qarzga tegadigan hamma narsada (savdo, to'lov) agent **qoralama** yaratadi; savdogar ilovada tasdiqlaydi. Tasdiqlanmaguncha jurnalga hech narsa tushmaydi. Haqiqiy o'chirish (DELETE) hech qayerda yo'q: "o'chirish" = arxiv.
3. Jurnal append-only. Tuzatish teskari yozuv bilan.
4. `service_role` kaliti ishlatilmaydi. Har so'rov foydalanuvchining o'z tokeni bilan, RLS ostida.
5. Kalit, parol, mijoz telefoni repoga yozilmaydi.

## 3. Nima qilingan

| Qism | Joyi | Mazmuni |
|---|---|---|
| MCP server | `apps/mcp` | Streamable HTTP (stateless, JSON javob), rasmiy MCP SDK, 13 asbob (7 + katalog uchun 4 + `list_suppliers`, `draft_purchase`) |
| Migratsiya | `supabase/migrations/004_mcp_agent.sql` | OAuth tokenni yozuvdan to'sish, `agent_drafts`, `agent_*` RPC'lar, `customer_outstanding` tuzatildi. **Asoschi ko'rib chiqib o'zi qo'llaydi** |
| Migratsiya (katalog) | `supabase/migrations/005_agent_catalog.sql` | `agent_add_customer`, `agent_add_products`, `agent_list_products`, `agent_propose_*`, `agent_requests`, `is_active`/`source` ustunlari, `accept_agent_draft` kengayishi |
| Migratsiya (kirim qoralamasi) | `supabase/migrations/008_agent_purchases.sql` (alohida PR) | `agent_list_suppliers`, `agent_draft_purchase`, `agent_list_products` (qoldiq, tan narx), `agent_draft_sale` (bir martalik mijoz, to'lov), `accept_agent_draft` kengayishi. **Asoschi o'zi qo'llaydi (CI merge'dan keyin)** |
| SQL testlar | `supabase/tests/20_agent_mcp.test.sql`, `30_agent_catalog.test.sql`, `60_agent_purchases.test.sql` | `bash supabase/tests/run_local.sh` (lokal PostgreSQL, Supabase stub) |
| Rozilik sahifasi | `apps/web/src/app/oauth/consent` | Supabase OAuth server uchun "ruxsat berish / rad etish" |
| Qoralamalar (veb) | `apps/web/src/app/(app)/drafts`, `components/DraftCard.tsx`, `lib/data/agentDrafts.ts` | Ro'yxat, tasdiqlash (`accept_agent_draft`), rad etish (`reject_agent_draft`), menyuda belgi |
| Qarorlar | `docs/QARORLAR.md` | 02.11.2026 qatorlari |

## 4. Arxitektura

```
Claude / ChatGPT ──OAuth 2.1 (PKCE)──► Supabase Auth (OAuth server, beta) ──► /oauth/consent (apps/web)
       │  access token (JWT, client_id claim bor)
       ▼
apps/mcp  (POST /mcp)
  1. token imzosi JWKS bilan (ES256/RS256/EdDSA), iss, aud=authenticated, exp, sub tekshiriladi
  2. client_id yo'q token productionda rad etiladi (403)
  3. foydalanuvchi tokeni bilan Supabase klienti (publishable kalit) ──► faqat agent_* RPC
       ▼
Supabase Postgres:  agent_whoami, agent_list_customers, agent_customer_balance, agent_list_sales,
                    agent_get_sale, agent_day_rows, agent_draft_sale, agent_draft_payment
```

Kashf (discovery): `GET /.well-known/oauth-protected-resource[/mcp]` → `authorization_servers: [<SUPABASE_URL>/auth/v1]`.
401 javobida `WWW-Authenticate: Bearer resource_metadata="…"` bor (RFC 9728). Supabase kashf manzili:
`https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`.

## 5. Xavfsizlik kafolatlari va ularning joyi

OAuth tokeni oddiy foydalanuvchi JWT'si, unda `client_id` claim bor (Supabase hujjati). Token AI klientning qo'lida, shuning
uchun "MCP'da confirm yo'q" degan qoida **yetarli emas**: klient PostgREST'ga o'zi `post_sale` yuborishi mumkin edi.
Kafolat **bazada** (004):

| Kafolat | Qanday |
|---|---|
| OAuth token savdo/to'lov yozolmaydi, bekor qila olmaydi, do'kon yarata olmaydi | `require_shop_member()` va `create_shop()` ichida `assert_first_party()`: `client_id` bor bo'lsa `oauth_client_forbidden`. Barcha yozuv RPC'lari (`post_sale`, `reverse_sale`, `record_payment`, `void_payment`) shuni ishlatadi |
| OAuth token jadvallarni o'qiy ham, yoza ham olmaydi | Har ijarachi jadvalda RESTRICTIVE `<jadval>_no_oauth` siyosati. Test: yangi RLS jadvalida bu siyosat bo'lmasa yiqiladi |
| Telefon va izoh AI ga chiqmaydi | Agent faqat `agent_*` RPC'larni chaqiradi; ular `phone`, `notes`, xom matn, to'lov izohini qaytarmaydi. MCP'da yana zod bilan ma'lum maydonlar qoldiriladi |
| Tasdiqlash faqat ilovada | `accept_agent_draft` / `reject_agent_draft` OAuth tokenga yopiq va MCP'da yo'q. Tasdiq mavjud `post_sale` / `record_payment` orqali o'tadi (ikki mustaqil hisob, qarz tekshiruvi qayta ishlaydi) |
| Qoralama jami ikki yo'l bilan | Core (BigInt) hisoblaydi, PostgreSQL `calculate_line_total` qayta hisoblaydi; farq bo'lsa qoralama yaratilmaydi |
| Spam | Do'konda 50 tadan ortiq ochiq qoralama bo'lmaydi |
| MCP kodi chegarasi | `apps/mcp/__tests__/guard.test.ts`: `.rpc()` faqat `db.ts` da, faqat 8 ta `agent_*`; `post_sale`, `accept_agent_draft`, `.from()`, `service_role` yo'q |
| Server noto'g'ri sozlansa ishga tushmaydi | `service_role`/`sb_secret_*` kalit rad etiladi; `MCP_ALLOW_FIRST_PARTY_TOKEN` productionda rad etiladi |

**Xavfsizlik xatosi tuzatildi:** `customer_outstanding()` a'zolikni tekshirmasdi, istalgan kirgan foydalanuvchi UUID bilan boshqa
do'kon qarzini o'qiy olardi. Lokal testda tasdiqlandi (B foydalanuvchi A do'koni mijozining 130 000 qarzini ko'rdi), 004 da tuzatildi.
Mobil va veb uni RPC sifatida chaqirmaydi (qarzni o'zlari hisoblaydi), shuning uchun ularga ta'sir qilmaydi.

**Ma'lum cheklovlar (halol ro'yxat):**
- Token MCP serverga **bog'lanmagan** (audience = `authenticated`). Supabase'da resource indicator (RFC 8707) qo'llab-quvvatlanishi **topilmadi**. Boshqa joyga berilgan token ham shu serverda ishlaydi. Zarar chegarasi: DB darajasidagi to'siqlar (agent baribir faqat o'qiy va qoralama yarata oladi).
- OAuth ruxsati **butun do'kon** bo'yicha; scope bo'yicha bo'linmagan.
- Dynamic Client Registration istalgan klientga ro'yxatdan o'tishga ruxsat beradi (Supabase hujjati ogohlantiradi). Rozilik sahifasi klient nomi va qaytish manzilini ko'rsatadi, lekin nom soxta bo'lishi mumkin: qaytish manzili (host) shuning uchun alohida ko'rsatiladi.
- MCP serverda so'rovlar soniga cheklov yo'q (faqat bazada 50 qoralama). Hosting darajasida cheklash keyin.
- Ruxsatni qaytarib olish (revoke) uchun ilovada ekran yo'q. SDK'da `listGrants`/`revokeGrant` tiplari bor, lekin ishlatilmagan.
- Qoralama paytida narx tarixi (±25%) tekshiruvi yo'q; faqat core validatsiyasi ogohlantirishlari qoralamaga yoziladi.

### 5.1. Katalog: agent yozadigan yagona joy

| Nima | Qanday cheklangan |
|---|---|
| Qo'shish | Faqat `agent_add_customer` / `agent_add_products` (SECURITY DEFINER, a'zolik tekshiruvi). OAuth token `customers`/`products` ga to'g'ridan-to'g'ri INSERT/UPDATE/DELETE qila olmaydi (`*_no_oauth`) |
| Nimani qo'yadi | Mijozda faqat nom; tovarda nom, birlik, narx. **Telefon va izoh imzoda yo'q** |
| Dublikat | Nom normallashtiriladi (kichik harf, bo'shliq, apostrof variantlari); bor bo'lsa yangisi yaratilmaydi, mavjud qaytariladi, mavjud narx o'zgarmaydi. Kirill va lotin moslashtirilmaydi |
| Takror | `request_id`: bir xil so'rov avvalgi natijani qaytaradi; boshqa mazmun bilan `request_id_conflict` |
| Hajm | Bir chaqiriqda <= 100 tovar (atomik: bitta qator xato bo'lsa hech narsa qo'shilmaydi); do'kon boshiga kuniga **500 tovar va 100 mijoz** (Toshkent kuni) |
| Belgi | `source = 'agent'` va `source_client_id`: ilovada "AI qo'shdi" |
| O'zgartirish/arxiv | Faqat `agent_propose_*` -> `agent_drafts` (`customer_update`, `product_update`, `customer_archive`, `product_archive`). Savdogar eski va yangi qiymatni ko'rib `accept_agent_draft` (faqat oddiy sessiya). Yozuv so'rovdan keyin o'zgargan bo'lsa `draft_stale`: jim ustidan yozilmaydi. Bir yozuvga bitta ochiq so'rov |
| O'chirish | Yo'q. Arxiv = `is_active = false`; savdo tarixi, qarz va to'lovlar saqlanadi. Arxivlangan yozuv agent ro'yxatida ko'rinmaydi |

**Xavf: noto'g'ri qo'shilgan yozuv.** Agent chalkash/yolg'on nom qo'shishi mumkin (jumladan "o'zingni o'chir" kabi matn). Pul va qarzga ta'sir qilmaydi (qo'shilgan mijozda qarz yo'q, tovarda tarix yo'q). **Yechim:** ilovada "AI qo'shdi" belgisi bilan ajratiladi; `propose_change` (action=archive) so'rovi yuboriladi va savdogar tasdiqlaydi; limitlar ommaviy ifloslanishni cheklaydi. Mijoz/tovar nomlari AI ga qaytganda ular ma'lumot, ko'rsatma emas: asbob tavsiflarida shunday yozilgan va testda tekshiriladi.

**Qolgan xavflar:** mobil ilova mijoz arxivini hali bilmaydi (arxivlangan mijoz telefonda ko'rinaveradi; S2/S4); ruxsat etilgan chegaradan tashqari ommaviy spam kunlik limit bilan cheklanadi, lekin limit ichida ham 500 tovar noto'g'ri bo'lishi mumkin (hammasini birdaniga arxivlash ommaviy so'rovi hali yo'q).

## 6. Asboblar

| Asbob | Turi | Izoh |
|---|---|---|
| `list_customers` | o'qish | Ism bo'yicha qidiruv; `id`, `name`, `outstanding` (so'm) |
| `get_customer_balance` | o'qish | `customer_outstanding` qoidasi: savdolar (bekor qilinmaganlar) − to'lovlar (bekor qilinmaganlar) |
| `list_sales`, `get_sale` | o'qish | Sana Toshkent vaqti (UTC+5). `raw_input`/`raw_text` qaytarilmaydi |
| `daily_summary` | o'qish | Jami kodda (BigInt) hisoblanadi, bazaning mustaqil yig'indisi bilan solishtiriladi, farq bo'lsa hisobot berilmaydi |
| `draft_sale` | qoralama | `qty` va `price` MATN (masalan "10", "13 ming"): core o'qiydi, AI emas. Noaniq qator bo'lsa qoralama yaratilmaydi, savdogardan so'rash aytiladi. **Bir martalik mijoz:** `walkin: true` + `payment_method` (mijoz bermang; qarzga olmaydi, jami to'liq to'lanadi). Doimiy mijozda ixtiyoriy `paid` + `payment_method` (jamidan oshmaydi). Tizim mijozini agent yaratmaydi: u tasdiqlashda yaratiladi |
| `draft_payment` | qoralama | Summa matn ("50 ming"); qarzdan oshmasin (tasdiqda yana tekshiriladi) |
| `list_products` | o'qish | Tovar: nom, birlik, sotuv narxi, **ombor qoldig'i** (`stock_milli`, 1000 = 1 birlik, manfiy bo'lishi mumkin, `negative_stock`), **tan narx** (`cost_price`, oxirgi kirim; yo'q = null), arxiv va manba. 008 qo'llanmaguncha qoldiq/tan narx `null` ("noma'lum", nol emas) |
| `list_suppliers` | o'qish | Ta'minotchi: `id`, `name`, `outstanding` (biz unga qarz, so'm). Telefon va izoh qaytarilmaydi. Arxivlanganlar ko'rinmaydi |
| `draft_purchase` | qoralama | Ta'minotchidan **kirim** qoralamasi: `supplier_id` (list_suppliers), qatorlar `product_id` + `qty` + `unit_cost` (MATN, core o'qiydi), ixtiyoriy `doc_date`, `paid` + `payment_method`, `note`. Jami kodda (core) hisoblanadi va PostgreSQL mustaqil qayta hisoblaydi. Kirim, ombor, tan narx va ta'minotchi qarzi **o'zgarmaydi**; savdogar ilovada/veb panelda tasdiqlaydi (`post_purchase`). Noaniq qator bo'lsa qoralama yaratilmaydi |
| `add_customer` | **qo'shadi** (tasdiqsiz) | Faqat nom. Dublikat bo'lsa mavjud qaytariladi. Kuniga 100 |
| `add_products` | **qo'shadi** (tasdiqsiz) | 1-100 tovar; narx MATN ("13 ming") core bilan o'qiladi; mavjud tovar o'zgarmaydi. Kuniga 500 |
| `propose_change` | so'rov (qoralama) | `target` customer/product, `action` update/archive. Mijozda faqat nom; tovarda nom, birlik, narx. Hech narsa o'zgarmaydi: savdogar ilovada tasdiqlaydi |
| `confirm_*`, `reverse_*`, har qanday o'chirish | **yo'q** | Tasdiqlash, bekor qilish faqat ilovada; DELETE yo'q |

Bir nechta do'kon bo'lsa `shop_id` talab qilinadi. `request_id` bir xil bo'lsa takroriy qoralama yaratilmaydi.

### 6.1. Kirim qoralamasi va bir martalik savdo (S5)

- Agent faqat **qoralama** yaratadi va **o'qiydi**; `post_purchase`, `post_sale`, `adjust_stock`, `ensure_walkin_customer` MCP kodida yo'q (`guard.test.ts` tekshiradi).
- `agent_drafts.kind = 'purchase'`: ta'minotchi `target_id` da, qatorlar tovar id bilan (nom va birlik serverda tovardan olinadi, agent yubormaydi). Qoralama ledger, ombor, tan narx va qarzga tegmaydi (SQL testi).
- Tasdiqlash (faqat birinchi tomon sessiyasi): `accept_agent_draft` -> mavjud `post_purchase` (ikki mustaqil hisob, to'lov qarzdan oshmasligi). Qoralama yaratilgandan keyin ta'minotchi yoki tovar arxivlansa `draft_stale`: hech narsa yozilmaydi.
- Bir martalik savdo: qoralamada `walkin: true`, mijoz id yo'q; tizim mijozi tasdiqlash paytida `ensure_walkin_customer` bilan olinadi. To'lov jamiga teng bo'lishi shart (`walkin_requires_full_payment`).
- Veb `/drafts` yangi turlarni ko'rsatadi (kirim jadvali, bir martalik mijoz, to'lov) va core bilan qayta tekshiradi; mos kelmasa "Tasdiqlash" yopiladi.
- **Eski baza bilan moslik:** MCP yangi ixtiyoriy argumentlarni faqat kerak bo'lganda yuboradi; 008 qo'llanmaguncha `list_products` qoldiq/tan narxsiz ishlaydi, `list_suppliers` va `draft_purchase` xato qaytaradi (RPC yo'q).
- Sinalmagan: haqiqiy Supabase va haqiqiy MCP klientlari (Claude/ChatGPT) bilan.

## 7. Sinov holati

**Katalog (005), lokal:** `bash supabase/tests/run_local.sh`: `30_agent_catalog.test.sql` (110 tekshiruv): OAuth to'g'ridan-to'g'ri INSERT/UPDATE/DELETE rad etiladi, `agent_add_*` ishlaydi; boshqa do'konga qo'shib bo'lmaydi; dublikat va `request_id` takrori ikkinchi yozuv yaratmaydi; limit (100/500); o'zgartirish/arxiv tasdiqlanmaguncha qo'llanmaydi, rad etilsa va `draft_stale` bo'lsa qo'llanmaydi; savdo/to'lov hamon faqat qoralama (385 000). Mutatsiya bilan tekshirilgan (dublikat, limit, `draft_stale`). `npm test -w apps/mcp` (66 test), `npm test -w apps/web` (139 test).

**Sinalgan (lokal):**
- `bash supabase/tests/run_local.sh`: 001, 003, 004 (ikki marta), mavjud xavfsizlik testlari va yangi `20_agent_mcp` testlari o'tadi. Ikkita mutatsiya (OAuth to'sig'ini olib tashlash; bitta jadvalda `_no_oauth` siyosatini tushirish) testlar tomonidan ushlandi.
  - boshqa do'kon ma'lumoti ko'rinmaydi (agent RPC'lar va `customer_outstanding`);
  - `draft_sale` hujjat, qator, jurnal, qarzni o'zgartirmaydi; jami 385 000;
  - OAuth bilan `post_sale`, `reverse_sale`, `record_payment`, `void_payment`, `create_shop`, `accept/reject` rad etiladi;
  - OAuth jadvallarni o'qiy olmaydi; agent RPC natijasida telefon, izoh, xom matn yo'q;
  - tasdiqlangan qoralama mavjud `post_sale`/`record_payment` orqali yoziladi.
- `npm test -w apps/mcp` (51 test): muddati o'tgan token, noto'g'ri imzo/issuer/audience, HS256, `client_id` yo'q token, `draft_sale` 385 000, noaniq qatorda qoralama yaratilmasligi, telefon sizib chiqmasligi, hisob mos kelmasligi, asboblar ro'yxati aynan 7 ta.
- `npm run build -w apps/mcp` va yig'ilgan `api/index.js` lokal chaqirildi (health, metadata, 401).
- `apps/web` build va `/oauth/consent` yig'iladi.

**SinalMAGAN (haqiqiy muhit kerak):**
- Haqiqiy Supabase'da 004 qo'llanishi; PostgREST orqali RPC (bigint parametr, `#variable_conflict`, `auth.jwt()`).
- **Haqiqiy OAuth tokenda `client_id` claim borligi** (hujjatga tayanilgan). Bu 5-bo'limdagi barcha to'siqlarning asosi: ulangandan keyin birinchi ish shuni tekshirish (13-bo'lim).
- Supabase OAuth server (beta) bilan to'liq oqim, JWKS bo'yicha tekshiruv (asimmetrik kalit yoqilgandan keyin).
- Vercel'ga deploy: `apps/mcp/vercel.json` va `api/index.js` ni build vaqtida yaratish usuli Vercel'da tekshirilmagan (bu sessiyada vercel.com ochilmadi). Funksiya imzosi (`export default { fetch }`) Vercel hujjatida tasdiqlangan.
- Claude va ChatGPT bilan ulanish (pastdagi mijoz holati qayta tekshirilmagan).
- Vercel Hobby rejasi tijoriy foydalanishga ruxsat beradimi: **topilmadi**.

## 8. Ishga tushirish (asoschi qadamlari)

Tartib muhim. Beta ishlamasa yoki qadam bajarilmasa, boshqa variantga o'tmang: to'xtang va xabar bering (QARORLAR.md).

1. **004 ni ko'rib chiqing va qo'llang.** Loyiha: `kfrnlkwocwpezwgytcmz`. 001 va 003 qo'llangan bo'lishi kerak. Supabase SQL Editor'ga `supabase/migrations/004_mcp_agent.sql` mazmunini joylab ishga tushiring (qayta ishga tushirish xavfsiz). Tekshirish:
   ```sql
   select count(*) from pg_proc where proname in ('agent_draft_sale','accept_agent_draft','assert_first_party');  -- 3
   select policyname from pg_policies where tablename = 'customers';  -- customers_no_oauth ham bo'lsin
   ```
   Mobil va veb ishlashi qo'llangandan keyin tezda tekshirilsin (kirish, savdo saqlash, to'lov): `require_shop_member` endi OAuth tokenni rad etadi, oddiy sessiyaga ta'sir qilmaydi.
2. **Imzo kaliti:** Supabase JWT imzo kalitini asimmetrik (ES256 yoki RS256) ga o'tkazing. MCP server faqat JWKS bilan tekshiradi, HS256 qabul qilinmaydi. Dashboard'dagi aniq menyu nomi bu hujjatda ko'rsatilmagan (Supabase "JWT Signing Keys" hujjatiga qarang). O'tgandan keyin ilova va veb kirishi ishlashini tekshiring.
3. **OAuth server:** Dashboard > Authentication > OAuth Server: yoqing, **Authorization Path** = `/oauth/consent`.
4. **Site URL:** rozilik sahifasi manzili = *Site URL + Authorization Path* (Supabase hujjati). Site URL veb panelning ommaviy manzili bo'lishi kerak (`apps/web` ning Vercel domeni). Eslatma: `BACKEND_SETUP.md` da Site URL `hisobchigo://auth/callback` deyilgan (mobil zaxira). Hozirgi qiymat bu sessiyada tekshirilmagan. Mobil ilova har doim `emailRedirectTo` yuboradi, shuning uchun o'zgartirish xavfsiz bo'lishi kerak, lekin email tasdiqlash oqimini o'zgartirgandan keyin sinab ko'ring.
5. **Vercel:** `apps/web` bilan bir jamoada yangi project, **Root Directory = `apps/mcp`**. Environment Variables (qiymatlarni o'zingiz kiritasiz, repoga yozilmaydi): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (faqat publishable/anon kalit; `service_role` KIRITMANG, server rad etadi), `MCP_PUBLIC_URL` (deploy manzili, `https://…`, oxirida `/` siz). Deploy qiling; `https://<mcp>/health` → `{"ok":true}`.
6. **Dynamic Client Registration:** Dashboard > Authentication > OAuth Server da yoqing, **faqat** Claude/ChatGPT ulanayotgan paytda.
7. **Ulash:** Claude: Customize > Connectors > URL `https://<mcp>/mcp`. ChatGPT: custom MCP connector (Plus va undan yuqori). Brauzerda `/oauth/consent` sahifasi ochiladi: klient nomi va qaytish manzilini tekshirib "Ruxsat berish" bosing.
8. **DCR ni o'chiring** (Dashboard > OAuth Server). Dashboard > Authentication > OAuth Apps (Manage bo'limi) da ro'yxatdan o'tgan klientlarni ko'ring; tanish bo'lmaganini o'chiring. Ixtiyoriy: `client_id` larni Vercel'da `MCP_ALLOWED_CLIENT_IDS` ga (vergul bilan) yozing, shunda boshqa klientlar MCP'ga kira olmaydi.
9. **Tekshirish (13-bo'lim).**

Lokal dev (production'ga chiqmaydi): `cp apps/mcp/.env.example apps/mcp/.env`, to'ldiring, `MCP_ALLOW_FIRST_PARTY_TOKEN=true`, `npm run dev -w apps/mcp` (port 8787). Bu rejimda oddiy sessiya tokeni qabul qilinadi; DB to'siqlari (`client_id`) bunday tokenga qo'llanmaydi, shuning uchun faqat o'zingizning dev loyihangizda ishlating.

## 9. Qoralamalar veb panelda (bajarildi) va qolgan ish

**Veb (`/drafts`):**
- Standart ko'rinish: tasdiqlanmagan qoralamalar (sariq kartochka). Filtr: tasdiqlangan, rad etilgan (oxirgi 100 ta).
- Kartochka: tur, mijoz, qatorlar (miqdor, narx, summa), jami, kim yaratgan (OAuth klient nomi), vaqt. Core ogohlantirishi bor qator sariq.
- Klient nomi `auth.oauth.listGrants()` dan olinadi (haqiqiy Supabase'da sinalmagan); topilmasa `Agent <qisqa id>`. Qaytarib olingan ruxsat nomi chiqmaydi.
- **Tasdiqlash** `accept_agent_draft(id)` ni chaqiradi. Server mavjud `post_sale` / `record_payment` orqali yozadi: jami PostgreSQL'da qayta hisoblanadi, mos kelmasa (`calc_mismatch`) yoki to'lov qarzdan oshsa hech narsa yozilmaydi va qoralama ro'yxatda qoladi, sabab kartochkada ko'rinadi. Muvaffaqiyatdan keyin veb savdo/to'lovni serverdan qayta o'qib summani tekshiradi.
- **Rad etish** `reject_agent_draft(id, sabab)`; sabab ixtiyoriy.
- Veb ham qoralama jamini core formulasi bilan qayta tekshiradi; mos kelmasa "Tasdiqlash" yopiladi. Buzilgan `payload` ilovani yiqitmaydi (`unreadable`, faqat rad etish mumkin).
- **Ikki marta bosish:** veb tugmani darhol bloklaydi; server qatorni `FOR UPDATE` bilan qulflaydi va ichki `client_op_id` = `agent-draft:<id>`. Ikkinchi chaqiruv `draft_already_decided` oladi, veb buni "allaqachon hal qilingan" deb ko'rsatadi. Parallel ikki sessiya bilan lokal sinaldi: 1 savdo, 1 jurnal yozuvi.
- Faqat oddiy sessiya: OAuth token `accept/reject` ni chaqira olmaydi (SQL testi). Veb OAuth token bilan ishlamaydi.
- Menyuda "Qoralamalar" va ochiq qoralamalar soni belgisi (yuklashda bitta qo'shimcha so'rov).
- Tasdiqlangan savdoning `id` si qoralama `id` siga teng: `/sales/<id>`.

**Qolgan:**
- Mobil: qoralamalarni ko'rsatish va tasdiqlash. Mobil SQLite'ni asosiy manba qiladi (bir tomonlama push), shuning uchun veb/agent orqali tasdiqlangan savdo telefonda ko'rinishi uchun serverdan telefonga tushirish (pull) kerak; hozir bu hal qilinmagan.
- Tasdiqlashdan oldin qatorlarni tahrirlash (alohida vazifa).
- Ruxsatlarni ko'rish va qaytarib olish ekrani.
- Brauzerda haqiqiy ko'rinish (dizayn) tekshirilmagan: komponent server-render testi bilan sinalgan, ekranda ko'rilmagan.

## 10. Mijozlar (client) holati — avvalgi tekshiruv (taxminan 04.2026 manba, qayta tekshirish kerak)

- Claude: Customize > Connectors'da URL bilan qo'shiladi, OAuth bor. Pro/Max/Team/Enterprise.
- ChatGPT: custom MCP: Plus va undan yuqori, OAuth 2.1 + DCR majburiy.
- Gemini: chat ilovasida custom remote MCP **topilmadi**. Gemini CLI va Gemini API/SDK MCP'ni qo'llaydi (manba aniq emas).

## 11. Qabul mezonlari

- [x] Boshqa do'konning ma'lumoti ko'rinmaydi (SQL testi, `20_agent_mcp`).
- [x] `draft_sale` bazaga savdo yozmaydi (SQL va MCP testlari).
- [x] Muddati o'tgan token rad etiladi (`auth.test.ts`, `handler.test.ts`).
- [x] 10×13 000 + 5×15 000 + 20×9 000 = 385 000 (core + MCP + SQL).
- [x] OAuth token bilan `post_sale` rad etiladi (SQL testi).
- [ ] Haqiqiy Supabase OAuth tokeni bilan yuqoridagilar (13-bo'lim).
- [x] Qoralama veb panelda ko'rinadi, tasdiqlanadi va rad etiladi (testlar; haqiqiy Supabase'da sinalmagan).
- [ ] Qoralama mobil ilovada ko'rinadi (keyingi vazifa).

## 12. Ochiq savollar

- Vercel Hobby tijoriy foydalanishga ruxsat beradimi (pilot davrida tekshiriladi, to'lov qarori keyin).
- Supabase OAuth server beta'dan chiqishi va shartlari o'zgarishi.
- Supabase tokenni resource (MCP server) ga bog'lashni qo'llaydimi (topilmadi).
- Revoke ekrani va so'rovlar cheklovi (rate limit).

## 13. Ulangandan keyingi tekshiruv (asoschi, 10 daqiqa)

1. Claude'da: "Mijozlarimni ko'rsat" → ro'yxat chiqadi, telefon yo'q.
2. "Karim aka uchun 10 ta chirmoq 13 ming, 5 ta yurak 15 ming, 20 ta momiq 9 ming qoralama qil" → jami **385 000**, holat `draft`. Ilovada savdolar soni va Karimning qarzi O'ZGARMAGAN bo'lishi shart.
3. SQL Editor: `select count(*) from documents;` va `select kind, status, total, client_id from agent_drafts order by created_at desc limit 3;` → hujjat soni o'zgarmagan, qoralama `draft`, `client_id` to'ldirilgan (bu `client_id` claim haqiqiy tokenda borligini isbotlaydi; `first_party` yozilgan bo'lsa — to'siqlar ishlamaydi, to'xtang va xabar bering).
4. Mashq: Claude'dan "savdoni tasdiqla" deb so'rang. U buni qila olmasligini aytishi kerak (asbob yo'q).
