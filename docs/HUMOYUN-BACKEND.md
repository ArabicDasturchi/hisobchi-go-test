# Humoyun uchun: Hisobchi Go backend, maqsadli arxitektura va audit topshirig'i

Sana: 10.11.2026. Kimdan: Abdulloh (asoschi) va arxitektor-Claude. Kimga: Humoyun Anvarjon.
Vazifa: **backendni to'liq o'qib chiq, xatolarini tuzat, kamchiliklarini to'ldir, ilovani yaxlit loyihaga aylantir.** Asoschi qarori: oynalarni bittalab tuzatish ishlamadi, shuning uchun poydevordan boshlaymiz.

Bu hujjat o'zi yetarli bo'lsin deb yozilgan. Fayl nomlari repo ildizidan (`hisobchi-go`). Ishonchlilik belgisi: **[O'QILDI]** kod yoki bazani o'zim o'qiganman; **[HUJJAT]** repodagi hujjatda yozilgan, qayta tekshirilmagan; **[TOPILMADI]** qidirdim, topmadim. Taxmin alohida belgilangan.

---

## 0. Mahsulot bir gapda

Bozor savdogari gapirib yoki yozib savdo/kirim/to'lov kiritadi, **AI matnni tushunadi, kod hisoblaydi, savdogar tasdiqlaydi.** Qarz daftari, ombor, hisobot shundan chiqadi. Savdogar texnik odam emas. To'liq talablar: `docs/ASOSCHI-TALABLARI.md`.

## 1. Buzilmaydigan qoidalar (har qaror shularga tekshiriladi)

1. **AI yig'indi hisoblamaydi va bazaga yozmaydi.** U faqat matnni tuzilmaga aylantiradi. Istisno (asoschi qarori 03.11): AI katalogga mijoz/tovar **qo'sha oladi**; o'zgartirish va arxiv faqat tasdiq so'rovi.
2. **Hisob ikki mustaqil yo'l:** TypeScript (`packages/core`) va PostgreSQL SQL. Mos kelmasa yozilmaydi.
3. **Tasdiqlamaguncha saqlanmaydi.** Pul va qarzga tegadigan hamma narsa avval qoralama.
4. **Jurnal faqat qo'shiladi.** `UPDATE/DELETE` taqiqlangan (trigger + huquq). Tuzatish teskari yozuv bilan, sabab majburiy.
5. **Pul butun so'm (`bigint`), miqdor `qty_milli` (1 dona = 1000).** Yaxlitlash: `line_total = (qty_milli × unit_price + 500) / 1000`, qator bo'yicha.
6. **Har jadvalda `shop_id`, RLS yoqilgan.** Bir do'kon boshqasini ko'rmaydi.
7. **Idempotentlik:** har amalda `client_op_id`; takror yuborilsa ikki marta yozilmaydi.
8. Kalit, parol, mijoz telefoni repoga yozilmaydi. `service_role` ilovada ishlatilmaydi.
9. Migratsiyani production'ga **faqat asoschi so'zi bilan** qo'llash. Qo'llangan faylni tahrirlama, yangi fayl yoz.

## 2. Hozirgi arxitektura [O'QILDI, kod va baza]

```
Savdogar (veb /dashboard)         Asoschi (Claude/ChatGPT)       Platforma egalari
   apps/web  (Next.js, Vercel)       apps/mcp  (MCP server)         apps/admin (Next.js)
        │  supabase-js (foydalanuvchi JWT)  │  OAuth 2.1 token (client_id claim)   │  faqat admin_* RPC
        └───────────────┬───────────────────┴──────────────────────────────────────┘
                        ▼
        Supabase: Auth + Postgres (RLS + SECURITY DEFINER RPC)    loyiha: kfrnlkwocwpezwgytcmz
                        ▲
        packages/core  (TS hisob: calculation, ledger, stock, purchase, cross-check...)
        apps/mobile    (Expo; MUZLATILGAN, faqat o'qiladi: docs/VEB-DAN-MOBILGA.md)
```

- **Yozish faqat RPC orqali.** Veb ishlatadigan RPC'lar: `post_sale`, `reverse_sale`, `record_payment`, `void_payment`, `post_purchase`, `reverse_purchase`, `record_supplier_payment`, `void_supplier_payment`, `post_supplier_opening_balance`, `adjust_stock`, `partner_statement`, `create_shop`, `accept_agent_draft`, `reject_agent_draft`. Jadvallarga to'g'ridan-to'g'ri yozish yopilgan: `stock_movements` da `REVOKE INSERT/UPDATE/DELETE` ko'rdim (006); `003` da `documents, document_lines, ledger_entries, audit_log...` uchun `REVOKE INSERT/UPDATE/DELETE` va `ledger_entries_insert` siyosatini olib tashlash bor (qolgan jadvallar 004–012 uchun audit'da tekshir). Eslatma: 003 `anon` dan hamma funksiyani `REVOKE` qilgan, lekin advisor `is_shop_member` hozir `anon` ga ochiq deb ko'rsatyapti: keyingi `CREATE OR REPLACE` (004) huquqni qaytargan bo'lishi mumkin, sababini top.
- **Agent yo'li:** `agent_*` RPC'lar (`agent_draft_sale`, `agent_draft_purchase`, `agent_draft_payment`, `agent_add_customer`, `agent_add_products`, `agent_propose_*`, ro'yxat/ko'rish RPC'lari) va `accept_agent_draft` (qoralamani savdogar tasdiqlaydi). OAuth tokenli so'rov asosiy jadvallarga yozolmaydi: har jadvalda `RESTRICTIVE` siyosat `NOT is_oauth_client_token()`.
- **Hisob:** `post_sale` serverda qatorlarni `calculate_line_total` bilan qayta hisoblaydi, mijoz yuborgan `p_client_total` bilan solishtiradi, mos kelmasa `calc_mismatch` bilan tranzaksiyani bekor qiladi (`supabase/migrations/006_partners_stock.sql`).
- **Qoldiq:** `stock_movements` (append-only) → `product_stock` view (`security_invoker`). **Mijoz qarzi:** `ledger_entries` + `payments` dan `customer_outstanding()`. **Ta'minotchi:** `supplier_outstanding()`. **Daftar:** `partner_statement()` (ikkinchi yo'l) va `packages/core/src/ledger.ts` (birinchi yo'l).
- **Admin:** `011/012` migratsiyalar, `platform_admins`, `admin_audit`, `admin_*` RPC'lar (faqat sonlar va holatlar, summa va mijoz nomi yo'q): `docs/ADMIN.md`.

### Baza holati (10.11.2026, Supabase MCP, faqat o'qildi) [O'QILDI]
- Migratsiyalar **001–012 hammasi production'da qo'llangan** (`list_migrations`).
- 23 ta public jadvalning hammasida RLS yoqilgan. Jadvallar: `shops, shop_members, products, product_aliases, customers, suppliers, documents, document_lines, ledger_entries, document_reversals, payments, payment_voids, stock_movements, purchase_documents, purchase_lines, purchase_reversals, supplier_payments, supplier_payment_voids, agent_drafts, agent_requests, audit_log, platform_admins, admin_audit`.
- Bazada **haqiqiy ma'lumot bor** (6 do'kon, 62 tovar, 17 kirim hujjati, 16 ta'minotchi to'lovi, 50 qoralama va h.k.). `DROP`, `TRUNCATE`, ommaviy `UPDATE` ehtiyotkorlik bilan; zaxira holati [TOPILMADI] (reja va PITR tekshirilmagan).
- `supabase/functions/` papkasi **yo'q**: bironta Edge Function qurilmagan.
- Testlar: `supabase/tests/10..85_*.test.sql` (SQL), `npm test` (core, veb, mcp, mobil). CI: `.github/workflows/ci.yml` (har PR) va `migrate.yml` (main'ga merge'da). Hujjatlarga ko'ra testlar yashil (HOLAT hujjatlari, PR #38/#39 CI), lekin **haqiqiy Supabase'da bironta yangi oqim sinalmagan** (pastga qarang).

## 3. Maqsadli arxitektura (qanday bo'lishi kerak)

Maqsad: mavjud poydevorni (RPC-faqat yozish, append-only, ikki hisob) saqlab, quyidagi qatlamlarni to'ldirish.

1. **Server tomonida AI qatlami (Edge Functions)** `supabase/functions/`: `parse-list` (matn/ovoz → qatorlar), keyin `parse-invoice` (surat → kirim qatorlari). Kirish: foydalanuvchi JWT, do'kon a'zoligi tekshiriladi, OAuth token rad etiladi. Chiqish: JSON schema; **jami, summa, qarz maydonlari yo'q**. Tovarni faqat do'kon katalogidagi nomzodlardan tanlaydi (`product_id` katalogda bo'lmasa `null`). Sonni AI emas, kod o'qiydi (`parseQtyMilli`, `parseUnitPriceText`, `parseUzNumber`). Do'kon bo'yicha kunlik limit (taklif: 200), timeout 20 s, logga matn/audio/ism yozilmaydi. Kalit `GEMINI_API_KEY` faqat Supabase secret'da; haqiqiy ma'lumot bilan **faqat pullik daraja** (`docs/GEMINI-LLM.md`). Batafsil: `docs/TZ-MVP.md` 2–3-bo'limlar.
2. **Yagona yozish yo'li = RPC.** Har yangi amal uchun: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, birinchi qadam `require_shop_member`, `client_op_id`, ikki yo'l hisob, `RESTRICTIVE` OAuth siyosati, SQL testi.
3. **Qoralama oqimi to'liq:** `agent_drafts` → savdogar qatorlarni tahrirlaydi → tasdiq. Hozir `accept_agent_draft(p_draft_id)` faqat id oladi (tahrirlangan qatorlarni qabul qilmaydi). Kerak: tahrirlangan qatorlarni qabul qiladigan RPC (masalan `p_lines jsonb`) va qayta hisob/tekshiruv.
4. **Rollar:** DB da `owner/admin/member` bor, lekin veb `PERMISSIONS` jadvalida deyarli hammasi `ALL`. `staff` uchun narx, tan narx va teskari yozuv cheklovi (ARXITEKTURA 8-bo'lim) RLS/RPC darajasida **yo'q**.
5. **Zaxira va chiqish erkinligi:** kunlik zaxira (tarifga bog'liq, tekshirilmagan) + savdogar o'zi CSV/Excel yuklab olishi (daftar, jurnal). 
6. **Kuzatuv:** Edge Function va RPC xatolari uchun log, AI xarajati (bitta savdoga so'm) o'lchovi.
7. **Oflayn (mobil, keyingi bosqich):** `client_op_id` allaqachon bor; mobil hozir muzlatilgan.

## 4. Reja va hozirgi kod orasidagi farq [O'QILDI]

`docs/ARXITEKTURA.md` (v2, 28.10) quyidagilarni nazarda tutgan, kodda **yo'q** yoki boshqacha:

| Rejada | Haqiqatda |
|---|---|
| `memberships` jadvali | `shop_members` (`owner/admin/member`) |
| `captures` (xom kirish: ovoz/rasm/matn) | yo'q; qoralama `agent_drafts` da |
| `price_history`, `product_units` | yo'q (narx `products` da; `products_sync_prices` trigger) |
| `ledger_entries.kind` ko'p turli (payment, purchase, stock_in...) | `entry_type` faqat `sale/reversal/adjustment`; to'lov `payments`, kirim `purchase_*`, qoldiq `stock_movements` alohida jadvallarda |
| Edge Functions (`parse-capture`, `post-document`, `stt`) | yo'q |
| `staff` roli cheklovlari | yo'q (yuqoriga qarang) |
| Ma'lumot saqlash 30 kun (ovoz/rasm) | ovoz/rasm hozircha saqlanmaydi (MVP qarori) |

Bu farq xato emas, evolyutsiya natijasi: **qaysi biri yangi arxitekturada saqlanadi, qaysi biri reja bo'yicha qayta quriladi, o'zing hal qil va `docs/QARORLAR.md` ga yoz.**

## 5. Ma'lum kamchiliklar va xavflar

### 5.1 Supabase xavfsizlik/ish unumdorligi tekshiruvi (`get_advisors`, 10.11) [O'QILDI]
- **9 funksiyada `search_path` o'rnatilmagan:** `calculate_line_total`, `get_document_pg_total`, `products_sync_prices`, `prevent_ledger_modification`, `calculate_document_total`, `update_updated_at`, `prevent_append_only_change`, `agent_drafts_guard`, `catalog_norm`. Yangi migratsiyada `ALTER FUNCTION ... SET search_path = public, pg_temp`.
- **`is_shop_member(uuid)` `anon` roli uchun ham chaqiriladi** (`SECURITY DEFINER`). Siyosatlarda ishlatiladi, shuning uchun `REVOKE` qilishdan oldin siyosatlar ta'siri tekshirilsin.
- **41 ta `SECURITY DEFINER` RPC `authenticated` roliga ochiq** (loyiha dizayni shunday). **Audit vazifasi: har biri ichida a'zolik yoki admin tekshiruvi birinchi qadamda borligini birma-bir tasdiqla** (`require_shop_member`, `is_platform_admin`), ayniqsa `agent_*`, `accept_agent_draft`, `reject_agent_draft`, `ensure_walkin_customer`, `create_shop`, `admin_*`.
- **Auth: "Leaked password protection" o'chirilgan.** Supabase Auth sozlamasi (kod emas).
- RLS: `shops_update` siyosatida `auth.<fn>()` har qatorda qayta hisoblanadi (`(select auth.uid())` ga o'tkazish).
- 11 ta tashqi kalitda indeks yo'q (`document_lines.product_id/shop_id`, `payments.customer_id`, `purchase_documents.supplier_id`, `purchase_lines.product_id`, `stock_movements.product_id` va b.). Hozir ma'lumot kam, lekin o'sishda kerak.

### 5.2 Hujjatlarda tan olingan cheklovlar [HUJJAT: `docs/HOLAT-3.md`, `HOLAT-PANEL-3.md`]
- Qoralamada qatorni joyida tuzatib bo'lmaydi (yuqoridagi 3.3).
- Kirim sanasi tanlanmaydi: server bugungi sanani qo'yadi.
- Kirim bekor qilinsa, u bilan berilgan to'lov bekor qilinmaydi (ortiqcha to'lov bo'lib qoladi).
- `post_sale` da tovarsiz qator ombor qoldig'iga tegmaydi (`product_id` ham, nom bo'yicha moslik ham topilmasa); bu jim holat, savdogarga ko'rsatilmaydi.
- Ombor tuzatishlari (`stock_adjustments`) mobilga pull qilinmaydi.
- Mobil "Yangi savdo" (`new.tsx`, Humoyun hududi) tovar id va tan narx bog'lamaydi.
- AI tushunish (erkin gap, ovoz, surat) umuman yo'q.

### 5.3 Haqiqiy Supabase'da **sinalmagan** oqimlar [HUJJAT]
Veb orqali: Kirim, Ta'minotchiga to'lov, Daftarga yozish, savdoni bekor qilish va qayta yozish, qoldiq tuzatish, mahsulot/mijoz/ta'minotchi tahriri saqlashi. MCP haqiqiy Claude/ChatGPT bilan. RLS `client_id` claim va OAuth tokenlar haqiqiy Auth bilan. CI `migrate.yml` GitHub'da hali ishlatilmagan (Secrets kiritilmagan, hujjat bo'yicha). Staging loyihasi [TOPILMADI].

### 5.4 Asoschi aytgan: "ilovada xatolar juda ko'p"
Aniq xato ro'yxati menda yo'q: bu **sening audit natijang bo'lishi kerak**. Birinchi vazifa shuni topish va hujjatlash (6-bo'lim, B0).

## 6. Topshiriq (tartib bilan)

**B0. Audit (hech narsani o'zgartirmasdan).** Chiqish: `docs/BACKEND-AUDIT.md`.
1. `supabase/migrations/001..012` ni o'qi: har RPC uchun a'zolik tekshiruvi, `client_op_id`, ikki yo'l hisob, `search_path`, huquqlar (`GRANT/REVOKE`).
2. `packages/core` va SQL hisobi bir xil natija beradimi: namuna 10×13 000 + 5×15 000 + 20×9 000 = 385 000; kasr miqdor; yaxlitlash; chegirma holatlari. Ikki yo'l ataylab farq qilsa tizim to'xtashini tekshir.
3. RLS: ikki do'kon bilan sinov, bir do'kon ikkinchisining ma'lumotini ko'rolmasligi (jadvallar va RPC). OAuth token yozolmasligi.
4. Har oqim uchun yurish yo'li: savdo, to'lov, kirim, ta'minotchi to'lovi, bekor qilish, qoldiq tuzatish. Qaerda jim xato (silent) bo'lishi mumkinligi.
5. Natija jadvali: **topilma, joyi (fayl:qator), xavfi (yuqori/o'rta/past), tuzatish, test**.

**B1. Haqiqiy Supabase'da sinov.** Avval **staging** (bo'sh alohida loyiha; `docs/MIGRATSIYA-CI.md` 10-bo'lim). 5.3 dagi oqimlarni boshidan oxirigacha o'tkaz va natijani yoz. Production'da faqat o'qish.

**B2. Xavfsizlik va barqarorlik migratsiyasi** `013_*.sql` (5.1: `search_path`, indekslar, `shops_update`; `is_shop_member` ta'siri bo'yicha qaror; yo'qolgan tekshiruvlar). Avval alohida SQL PR + testlar, `staging`, keyin asoschi so'zi bilan production.

**B3. Qoralama tahriri RPC** (3.3) + veb qismi alohida PR (veb panelda `Qoralamalar` sahifasi tayyor).

**B4. AI qatlami:** `parse-list` (matn), keyin ovoz, keyin `parse-invoice`. Gemini kalitini Abdulloh bilan birga Supabase secret'ga qo'yasan (chatga/repoga yozilmaydi). Baholash to'plami: 20 haqiqiy spiska, son/narx ≥ 95% (gipoteza H2).

**B5. Rollar, zaxira, eksport, kuzatuv** (3.4–3.6).

Har bosqich oxirida: `npm test`, `npm run typecheck`, `bash supabase/tests/run_local.sh` yashil; hujjat yangilangan; PR tavsifida **nima sinalmagani** yozilgan.

## 7. Ish qoidalari

- Hamma `main` dan alohida kichik branch/PR, **squash merge**, merge'ni asoschi qiladi. Migratsiyali ish ikkiga bo'linadi: avval faqat SQL, keyin ilova (`docs/ISH-TARTIBI.md`).
- Yangi migratsiya `013_nom.sql` shaklida (3 xonali, ketma-ket; `supabase migration new` ishlatma). Qayta ishga tushirishga xavfsiz yoz (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- Hudud: `docs/VAZIFALAR-ICE.md` 3-bo'lim. Mobil muzlatilgan (`apps/mobile` ga tegmaysan, kerak bo'lsa `docs/VEB-DAN-MOBILGA.md` ga qator qo'shiladi). Frontend (`apps/web`) panel maketi: `HisobchiGo-oynalar-V3.pdf` va `docs/ASOSIY-SAHIFA.md`; ular boshqa Claude Code seansida; to'qnashuv bo'lsa Abdulloh bilan kelishasan.
- Faktni to'qima: topilmasa "topilmadi" deb yoz. Haqiqiy Supabase/telefonda ko'rmagan narsani "ishlaydi" dema.

## 8. Kirish huquqlari

- GitHub: repo a'zoligi bor (`ArabicDasturchi`, QARORLAR 28.10).
- Supabase loyihasi `kfrnlkwocwpezwgytcmz`: a'zoligi [TOPILMADI]. Yo'q bo'lsa, Abdulloh sizni tashkilotga qo'shadi.
- Sizdan (Claude Code qila olmaydi): Expo/EAS akkaunt, Gemini kaliti (billing ulangan), `supabase secrets set` va Edge Function deploy.

## 9. Claude Code'ga berish uchun qisqa prompt

> `docs/HUMOYUN-BACKEND.md`, `docs/ASOSCHI-TALABLARI.md`, `CLAUDE.md`, `docs/QARORLAR.md`, `docs/ISH-TARTIBI.md`, `docs/MIGRATSIYA-CI.md` ni o'qi. Faqat B0 (audit) ni bajar: hech narsani o'zgartirmasdan `supabase/migrations/001..012`, `packages/core` va `apps/mcp` ni o'qib `docs/BACKEND-AUDIT.md` yoz (topilma, joyi, xavfi, tuzatish, test). Faktni to'qima; production'ga yozma; sir so'rama. Tugagach to'xta va hisobot ber.
