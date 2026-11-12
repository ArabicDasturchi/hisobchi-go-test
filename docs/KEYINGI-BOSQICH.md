# Keyingi bosqich: backend integratsiyasi, server, AI agent

Sana: 11.11.2026. Holat: **reja**. Boshlanish sharti: web staging'da tasdiqlangan ([STAGING-CHECKLIST.md](STAGING-CHECKLIST.md) S1–S15 ✅) va #42–#51 merge qilingan.
Asos: [WEB-AUDIT.md](WEB-AUDIT.md), [BACKEND-AUDIT.md](BACKEND-AUDIT.md), [AI-AGENT-REJA.md](AI-AGENT-REJA.md), asoschining 10.11 backend topshirig‘i (HUMOYUN-BACKEND.md, repoda yo‘q).
Qoidalar o'zgarmaydi: AI hisoblamaydi va yozmaydi; yozish faqat RPC orqali (`SECURITY DEFINER`, `require_shop_member`, `client_op_id`, ikki yo'l hisob); append-only; production migratsiya faqat asoschi so'zi bilan, avval staging; mobil muzlatilgan.

## 1. Maqsadli arxitektura (qisqa)

```
Savdogar (veb)        AI klient (Claude/ChatGPT)        Ilova ichidagi AI (keyin)
  apps/web              apps/mcp (OAuth 2.1)              supabase/functions/parse-list
     │ JWT                  │ OAuth token                     │ JWT, kalit faqat secret'da
     └──────────────┬───────┴────────────────────────────────┘
                    ▼
   Supabase Postgres: RLS + SECURITY DEFINER RPC (yagona yozish yo'li)
     ├─ moliya: post_sale, reverse_sale_with_payments, record_payment, post_purchase, ...
     ├─ qoralama: agent_draft_* → accept_agent_draft (faqat ilova sessiyasi)
     └─ hisob: calculate_line_total (SQL) = packages/core (TS)  ← ikki yo'l
```

O'zgarmaydigan tamoyil: **har yangi pul amali = bitta RPC = bitta tranzaksiya**. Klientda ikki RPC ketma-ket chaqirish yo'q (W1/W3 saboqlari).

## 2. Vazifalar (ustuvorlik bo'yicha)

Har vazifa: alohida kichik PR, `main` dan; migratsiyali ish — avval SQL PR, keyin ilova PR; regression test (eski kodda yiqiladi); tanqidchi PASS; staging'da sinov.

### P0 — MVP'dan keyin darhol (pul va ma'lumot to'g'riligi)

| ID | Vazifa | Tur | Sabab | Bog'liq |
|---|---|---|---|---|
| K1 | Mijoz «Daftarga yozish» → `post_sale(p_paid)` (savdo + to'lov bitta) | web | W3 ning qolgan joyi (`usePanelActions` customer) | #50 merge |
| K2 | `014` xavfsizlik migratsiyasi: B8 (`is_shop_member` PUBLIC), B9 (9 funksiya `search_path`), B10/S6 (parallel idempotentlik va `idempotency_conflict`), S4 (ustun darajasida UPDATE huquqi: `kind`, `source`, `cost_price`), S5 (walk-in to'lovini alohida void taqiqlash), S10, H2 (11 FK indeks, `shops_update`) | SQL | BACKEND-AUDIT 4-bo'lim | — |
| K3 | Tovar birligini harakat bo'lsa bloklash (B4/W8): trigger yoki `change_product_unit` RPC | SQL + web | Eski harakatlar yangi birlikda o'qiladi | K2 bilan bir migratsiyada bo'lishi mumkin |
| K4 | `post_purchase` yangi tovarlarni ham bitta tranzaksiyada yaratsin (`p_new_products`) | SQL + web | W5 qoldig'i: yetim tovar | — |
| K5 | `products` UNIQUE (`shop_id, catalog_norm(name), unit) WHERE is_active`: **avval production'dagi takrorlarni faqat o'qib topish**, asoschi qarori bilan birlashtirish/arxivlash | SQL | W4 klient tekshiruvi yetarli emas (MCP, mobil, ikki oyna) | K2 |
| K6 | Kredit/qaytarish (W11): `refund_payment` RPC yoki kreditni keyingi savdoga ishlatish — **asoschi qarori** | SQL + web | Manfiy qarz qotib qoladi | qaror |

### P1 — Server va ishonchlilik

| ID | Vazifa | Sabab |
|---|---|---|
| K7 | Zaxira: Supabase tarifi, PITR/kunlik backup holatini tekshirish va hujjatlash; savdogar uchun CSV eksport (daftar, jurnal) | [TOPILMADI] zaxira holati; ma'lumot yo'qotish xavfi |
| K8 | Kuzatuv: RPC xatolari (kod bo'yicha) va Edge Function loglari; logga shaxsiy ma'lumot yozilmaydi | Hozir xato faqat foydalanuvchida ko'rinadi |
| K9 | Unumdorlik (W14): `ShopDataProvider` butun tarixni yuklamasin — sahifalash yoki server agregat RPC (`shop_summary`); `hasColumn` probalari bir marta | 1–2 oydan keyin sekinlashadi |
| K10 | CI: admin lint, `actionlint` workflow'lar uchun; branch himoyasida 4 ish majburiy | — |
| K11 | Auth: leaked password protection (H1), production Redirect URLs, `NEXT_PUBLIC_SITE_URL`, `metadataBase` (W18) | — |

### P2 — AI agent ([AI-AGENT-REJA.md](AI-AGENT-REJA.md))

| ID | Vazifa | Bog'liq |
|---|---|---|
| A1 | MCP tayyorlash: S1 (walk-in id ni rad etish), S3 (arxiv mijoz `draft_stale`), B7 (kirim izohi), S7 (summa string), S8 (`MCP_ALLOWED_CLIENT_IDS` majburiy), W13 (rozilik matni) | K2 bilan SQL qismi birga bo'lishi mumkin |
| A2 | Qoralama qatorlarini tahrirlash: `update_agent_draft_lines` (server qayta hisoblaydi) + web «Qoralamalar» tahriri | A1 |
| A3 | Staging'da haqiqiy aylanma: Claude/ChatGPT → MCP → qoralama → web tasdiq (STAGING S17) | A1, P8 |
| A4 | `supabase/functions/parse-list` (matn → qatorlar, jami yo'q), provayderga bog'liq bo'lmagan adapter, kunlik limit, kalit secret'da — **asoschi qarori va pullik kalit** | A3 |
| A5 | Ovoz (STT), keyin rasm (`parse-invoice`) — faqat qoralama | A4 |

### P3 — Web yaxshilash (MVP'dan keyin)

W7 (mijoz ismi takrori), W9 (bog'lanmagan qator sariq + birlik tanlovi), W12 (onboarding'da birliklar), W15 (takliflar paneli yopilmaydi), W19 (chegirma — mahsulot qarori), demo seed'da W1 belgisi.

## 3. Ketma-ketlik (taklif)

1. **Juma (MVP):** staging S1–S15 → merge #42–#51 → nazoratli pilot (1–3 savdogar).
2. **Pilotdan keyingi 1-hafta:** K1, K2 (+K3), K11, K7 (tekshiruv), A1.
3. **2-hafta:** K4, K5 (takrorlar tozalangach), K8, A2, A3.
4. **3-hafta:** K9, K6 (qaror bo'lsa), A4 (kalit va qaror bo'lsa).

## 4. Asoschi qarorlari kerak

- #45: kassa faqat naqd (05.11 qarori o'zgaradi) — **kutilmoqda**.
- K5: production'dagi takror tovarlar bilan nima qilish.
- K6: ortiqcha to'lov — qaytarish yoki kredit.
- A4: LLM provayderi, pullik kalit, MVP'ga kiritish vaqti.
- Hudud: `apps/web`, `packages/core`, `supabase/migrations`, `apps/mcp` — VAZIFALAR-ICE bo'yicha Abdulloh hududi; Humoyun bu vazifalarni bajarsa har PR'da «Humoyun/Abdulloh tasdiqlasin».

## 5. Bajarilmagan va sinalmagan

Bu hujjatdagi hech narsa implementatsiya qilinmagan. Taxminiy muddatlar reja, va'da emas. Production ma'lumoti o'qilmagan.
