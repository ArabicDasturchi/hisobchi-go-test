# HOLAT-3: Vazifa 3 (daftarlar, ombor, katalog, agent katalogi) holati

Reja: [REJA-3.md](REJA-3.md). Yangilangan: 04.11.2026. Keyingi seans shu fayldan davom etadi.

**Hammasi kodda tayyor, 7 ta PR ochiq (hech biri merge qilinmagan, hech bir migratsiya qo'llanmagan).** Quyidagi "sinalmagan" bandi o'qilsin.

## PR zanjiri (merge tartibi muhim)

| # | PR | Mazmun | Bog'liq |
|---|---|---|---|
| 3 | S1-DB `005_agent_catalog.sql` | agent katalogi (migratsiya) | main |
| 4 | S1-kod MCP + veb | `add_customer`, `add_products`, `propose_change`, veb belgilar | #3 |
| 6 | `006_partners_stock.sql` | ta'minotchi, `customers.kind`, bir martalik mijoz, tan/sotuv narxi, ombor harakati, `post_sale` v2 | #3 |
| 7 | `007_purchases.sql` | kirim, `post_purchase`, `reverse_purchase`, ta'minotchi to'lovi, `partner_statement` | #6 |
| 8 | S3 core | kirim, ostatka, oldi-berdi, qoldiq, foyda, bir martalik qoida, ikki yo'l solishtirish | #7 |
| 9 | S2-mobil | SQLite v7, `purchasing.ts`, bir martalik mijoz, sync push/pull | #8 |
| 10 | S4-mobil UI | katalog bosh sahifa, tezkor savdo, ombor, kirim, daftarlar, ta'minotchilar | #9 |
| 11 | S4-veb | Kirim/Chiqim daftari, Ombor, Ta'minotchilar (ko'rish), bir martalik mijoz yashirin | #10 |
| 12 | `008_agent_purchases.sql` | agent kirim qoralamasi, qoldiq/tan narx, bir martalik savdo qoralamasi | #7 |
| 13 | S5 MCP + veb qoralamalar | `list_suppliers`, `draft_purchase`, `draft_sale` walkin/to'lov, veb `/drafts` yangi turlar | #11 |

Migratsiyalar (#3, #6, #7, #12) alohida PR'larda; CI (`ci/migrate-workflow`, merge bo'lmagan) `main` ga merge'dan keyin qo'llaydi. Men hech birini production'ga qo'llamadim.

## Bajarilgan sinovlar
- `npm test`: core 188, mobil 182, veb 159, mcp 76 (jami 605); `npm run typecheck` va `next build --webpack` yashil; Android Metro bundle (`expo export`) xatosiz.
- SQL: `bash supabase/tests/run_local.sh` (lokal PostgreSQL + Supabase stub), 001–008 ikki marta qo'llanib, testlar 10–60 yashil.
- Migratsiya qo'riqchisi 008 uchun `dangerous=false`.
- Har yangi mantiq mutatsiya bilan tekshirilgan (amalga ataylab xato kiritilib, testlar yiqilishi ko'rilgan): SQL 006/007/008, core, mobil data/sync/pull, UI modellari, MCP, veb. Bu jarayonda haqiqiy xatolar topilib tuzatilgan (masalan mobil `stockOf` da parametrlar soni).
- Asosiy raqamlar hamma qatlamda: sotuv 10×13 000 + 5×15 000 + 20×9 000 = 385 000; kirim 100×9 000 + 50×11 000 = 1 450 000, berildi 1 000 000 → ostatka 450 000; foyda 10×13 000 − 10×11 000 = 20 000; bir martalik savdo qarz yaratmaydi; manfiy qoldiq ogohlantiradi; bekor qilish qoldiq va ostatkani qaytaradi; hisob mos kelmasa to'xtaydi.

## SINALMAGAN (halollik)
- **Haqiqiy Supabase**: hech bir migratsiya real loyihada qo'llanmagan/sinalmagan; RLS, `client_id` claim, OAuth tokenlar faqat lokal PostgreSQL stub'da.
- **Telefon / Expo Go**: mobil ekranlar (katalog, tezkor savdo, ombor, kirim, daftarlar) qurilmada ko'rilmagan: joylashuv, klaviatura, "bir ekranda 8 qator", 2 bosishli tezlik. Faqat mantiq modullari testlangan va bundle yig'iladi.
- **Brauzer**: yangi veb sahifalar (`/books/*`, `/warehouse`, `/suppliers`, qoralama kartalari) brauzerda ko'rilmagan; server-render va `next build` bilan sinalgan.
- **Sync haqiqiy bulut bilan**: push/pull soxta klient bilan; `post_sale`/`post_purchase` argumentlari SQL imzolariga testda moslangan, lekin real RPC chaqirilmagan.
- **MCP haqiqiy klientlar** (Claude, ChatGPT) bilan sinalmagan.

## Ma'lum cheklovlar (qarorlarda yozilgan)
- Ombor tuzatishlari (`stock_adjustments`) boshqa qurilmadan mobilga pull qilinmaydi (serverda `stock_movements`, mobilda hujjatlardan hisoblanadi). Bir qurilmada ishlaganda ta'siri yo'q.
- Mobil "Yangi savdo" (matn/ovoz) oqimi (`new.tsx`, Humoyun hududi) tovar id va tan narx bog'lamaydi: bunday savdo ombor qoldig'iga tegmaydi. Tezkor savdo bog'laydi.
- Veb hech narsa yozmaydi (kirim/tuzatish/to'lov mobilda); web faqat qoralamani tasdiqlaydi/rad etadi.
- Mobil "Qoralamalar" faqat tugallanmagan hisobni ko'rsatadi; agent qoralamalari veb panelda.
- Kirim bilan berilgan to'lov kirim bekor qilinsa bekor qilinmaydi (ta'minotchining hisobi bor, ortiqcha to'lov bo'lib qoladi).

## Keyingi qadam (asoschi)
1. `ci/migrate-workflow` PR'ini merge qiling (yoki migratsiyalarni tartib bilan qo'lda: 005, 006, 007, 008), keyin PR'larni zanjir tartibida merge qiling: #3, #4, #6, #7, #8, #9, #10, #11, #12, #13.
2. Migratsiyalar qo'llangach: haqiqiy Supabase'da sinab ko'ring: (a) telefonda bir martalik savdo + sinxron, (b) kirim + sinxron, (c) veb `/books/in`, (d) MCP `draft_purchase` -> veb Tasdiqlash.
3. Telefonda ekranlarni ko'rib, joylashuv xatolarini ayting (men ko'ra olmadim).
4. Keyingi vazifa nomzodlari: ombor tuzatishini pull qilish; `new.tsx` oqimida tovar bog'lash (Humoyun bilan kelishilgan holda).
