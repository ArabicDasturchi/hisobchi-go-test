# MCP / Connector: Hisobchi Go'ga tashqi AI orqali kirish

Holat (02.11.2026): **kod yozilgan va lokal sinalgan; Supabase'ga qo'llanmagan, hostingga joylanmagan, Claude/ChatGPT bilan ulanmagan.**

> **Qoralama ko'rinmaguncha MCP foydalanishga tayyor emas.** Agent yaratgan qoralama bazada turadi (`agent_drafts`),
> lekin veb va mobil ilovada hali ro'yxat va "Tasdiqlash" tugmasi yo'q. Bu keyingi vazifa (9-bo'lim). Shu tugamaguncha
> asoschiga MCP ni ishlatishni tavsiya etmaymiz: qoralamani savdogar ko'ra olmaydi.

## 1. Maqsad

Asoschi Claude / ChatGPT orqali Hisobchi Go ichida ishlay oladi: ko'rish (mijoz, qarz, savdo, kunlik hisobot) va qoralama
yaratish. Tasdiqlash faqat ilovada, savdogar qo'li bilan.

## 2. Qoidalar (CLAUDE.md dan, buzilmaydi)

1. AI yig'indi hisoblamaydi va bazaga o'zi yozmaydi. Savdo faqat `post_sale` orqali; MCP uni chaqirmaydi.
2. Agent **qoralama** yaratadi; savdogar ilovada tasdiqlaydi. Tasdiqlanmaguncha jurnalga hech narsa tushmaydi.
3. Jurnal append-only. Tuzatish teskari yozuv bilan.
4. `service_role` kaliti ishlatilmaydi. Har so'rov foydalanuvchining o'z tokeni bilan, RLS ostida.
5. Kalit, parol, mijoz telefoni repoga yozilmaydi.

## 3. Nima qilingan

| Qism | Joyi | Mazmuni |
|---|---|---|
| MCP server | `apps/mcp` | Streamable HTTP (stateless, JSON javob), rasmiy MCP SDK, 7 asbob |
| Migratsiya | `supabase/migrations/004_mcp_agent.sql` | OAuth tokenni yozuvdan to'sish, `agent_drafts`, `agent_*` RPC'lar, `customer_outstanding` tuzatildi. **Asoschi ko'rib chiqib o'zi qo'llaydi** |
| SQL testlar | `supabase/tests/20_agent_mcp.test.sql` | `bash supabase/tests/run_local.sh` (lokal PostgreSQL, Supabase stub) |
| Rozilik sahifasi | `apps/web/src/app/oauth/consent` | Supabase OAuth server uchun "ruxsat berish / rad etish" |
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

## 6. Asboblar

| Asbob | Turi | Izoh |
|---|---|---|
| `list_customers` | o'qish | Ism bo'yicha qidiruv; `id`, `name`, `outstanding` (so'm) |
| `get_customer_balance` | o'qish | `customer_outstanding` qoidasi: savdolar (bekor qilinmaganlar) − to'lovlar (bekor qilinmaganlar) |
| `list_sales`, `get_sale` | o'qish | Sana Toshkent vaqti (UTC+5). `raw_input`/`raw_text` qaytarilmaydi |
| `daily_summary` | o'qish | Jami kodda (BigInt) hisoblanadi, bazaning mustaqil yig'indisi bilan solishtiriladi, farq bo'lsa hisobot berilmaydi |
| `draft_sale` | qoralama | `qty` va `price` MATN (masalan "10", "13 ming"): core o'qiydi, AI emas. Noaniq qator bo'lsa qoralama yaratilmaydi, savdogardan so'rash aytiladi |
| `draft_payment` | qoralama | Summa matn ("50 ming"); qarzdan oshmasin (tasdiqda yana tekshiriladi) |
| `confirm_*`, `reverse_*` | **yo'q** | Tasdiqlash va bekor qilish faqat ilovada |

Bir nechta do'kon bo'lsa `shop_id` talab qilinadi. `request_id` bir xil bo'lsa takroriy qoralama yaratilmaydi.

## 7. Sinov holati

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

## 9. Keyingi vazifa (darhol shundan keyin)

- Veb panelda "Qoralamalar" ro'yxati: `agent_drafts` (RLS bilan o'qiladi), sariq ko'rinish, qator tafsiloti va ogohlantirishlar.
- "Tasdiqlash" → `accept_agent_draft(id)`; "Rad etish" → `reject_agent_draft(id, sabab)`. Ikkalasi faqat oddiy sessiya bilan. Qabul qilinganda hujjat/to'lov id si = qoralama id si.
- Mobil: tasdiqlangan savdo serverda paydo bo'ladi, mobil esa SQLite'ni asosiy manba qiladi (bir tomonlama push). Serverdan telefonga tushirish (pull) mavjudligi va qoralamalarni mobilda ko'rsatish alohida hal qilinadi.
- Ruxsatlarni ko'rish va qaytarib olish ekrani.

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
- [ ] Qoralama ilovada ko'rinadi va tasdiqlanadi (keyingi vazifa).

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
