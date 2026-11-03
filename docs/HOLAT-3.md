# HOLAT-3: Vazifa 3 (daftarlar, ombor, katalog, agent katalogi) holati

Reja: [REJA-3.md](REJA-3.md). Yangilangan: 03.11.2026. Keyingi seans shu fayldan davom etadi.

| Bosqich | Holat | Izoh |
|---|---|---|
| Reja | tayyor | `REJA-3.md` |
| S1 PR-A (DB: `005_agent_catalog.sql`) | **tayyor, PR #3 ochilgan** | migratsiya, SQL testlar (110 tekshiruv, mutatsiya bilan tekshirilgan), qarorlar. Hali qo'llanmagan: `main` ga merge bo'lganda CI qo'llaydi |
| S1 PR-B (MCP + veb) | **tayyor, PR ochiladi** | MCP: `add_customer`, `add_products`, `list_products`, `propose_change` (66 test); veb: Qoralamalarda yangi turlar, "AI qo'shdi"/"Arxiv" belgisi, arxivlangan mijoz yangi savdoda ko'rinmaydi (139 test); `docs/MCP-AGENT.md`. **PR-A (005) merge va qo'llangandan keyin merge qilinadi** |
| S2 ma'lumotlar modeli | boshlanmagan | migratsiya 006 (kerak bo'lsa 007), mobil SQLite sxemasi va sync |
| S3 hisob moduli | boshlanmagan | `packages/core` |
| S4 mobil va veb | boshlanmagan | |
| S5 MCP kengaytmasi | boshlanmagan | |

## Tayyor (S1 PR-A)
- `supabase/migrations/005_agent_catalog.sql`: `customers.is_active/source/source_client_id`, `products.source/source_client_id`, `agent_requests` (idempotentlik),
  `agent_drafts` yangi turlari + `target_id`, `agent_add_customer`, `agent_add_products`, `agent_list_products`, `agent_propose_customer_update`,
  `agent_propose_product_update`, `agent_propose_archive`, `apply_catalog_draft`, kengaytirilgan `accept_agent_draft`; `agent_list_customers` arxivlanganni yashiradi.
- `supabase/tests/30_agent_catalog.test.sql`, `run_local.sh` ga qo'shildi.

## Qoldi / diqqat
- **CI ulanmagan bo'lishi mumkin:** `ci/migrate-workflow` PR'i merge bo'lmaguncha 005 ni qo'lda qo'llash kerak bo'ladi (`docs/MIGRATSIYA-CI.md`).
- Mobil ilova mijoz arxivini hali bilmaydi (arxivlangan mijoz telefonda ko'rinaveradi) va agent qo'shgan mijoz/tovar telefonga `pull` orqali tushadi, lekin `source` belgisi mobilda yo'q.
- Veb'ning Mijozlar/Mahsulotlar ro'yxatlari hali `is_active` (mijoz) va `source` ustunlarini o'qimaydi (PR-B).

## Tayyor (S1 PR-B)
- `apps/mcp`: 11 asbob; guard testi 14 ta `agent_*` RPC dan boshqasini ruxsat bermaydi; katalog asboblarida "ma'lumot, ko'rsatma emas" ogohlantirishi testlangan.
- `apps/web`: `DraftCard` yangi turlar (eski/yangi qiymat), qarzli mijozni arxivlash ogohlantirishi, `acceptAgentDraft` serverdan tekshiradi; mijozlar ro'yxatida "Arxiv" filtri va belgilar.

## Keyingi qadam
1. Asoschi: PR-A (#3) ni merge qiladi (CI 005 ni qo'llaydi), keyin PR-B.
2. **S2** (`feat/s2-data-model`, migratsiya 006): ta'minotchi, kirim hujjati, ta'minotchi to'lovi, ombor harakatlari, `cost_price`/`sale_price`, savdo qatorida tan narx snapshot, bir martalik mijoz; `post_purchase`, `reverse_purchase`, `record_supplier_payment`; mobil SQLite sxemasi (`schema.ts` v6) va `sync.ts`/`pull.ts` (jumladan mijoz `is_active` va `source`).
3. Ma'lumot to'ldirish (Sheets -> `add_products`) asoschi-Claude tomonidan, PR-A va PR-B qo'llangach.
