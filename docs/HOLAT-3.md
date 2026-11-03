# HOLAT-3: Vazifa 3 (daftarlar, ombor, katalog, agent katalogi) holati

Reja: [REJA-3.md](REJA-3.md). Yangilangan: 03.11.2026. Keyingi seans shu fayldan davom etadi.

| Bosqich | Holat | Izoh |
|---|---|---|
| Reja | tayyor | `REJA-3.md` |
| S1 PR-A (DB: `005_agent_catalog.sql`) | **tayyor, PR ochiladi** | migratsiya, SQL testlar (110 tekshiruv, mutatsiya bilan tekshirilgan), qarorlar. Hali qo'llanmagan: `main` ga merge bo'lganda CI qo'llaydi |
| S1 PR-B (MCP + veb) | boshlanmagan | PR-A merge va CI qo'llagandan keyin: `add_customer`, `add_products`, `list_products`, `propose_change`; veb Qoralamalar yangi turlar; "AI qo'shdi" belgisi; `docs/MCP-AGENT.md` |
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

## Keyingi qadam
PR-A merge va 005 qo'llangach: S1 PR-B (`feat/s1-agent-catalog-app`).
