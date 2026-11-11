# AI agent: xavfsiz integratsiya rejasi (mavjud MCP asosida)

Sana: 11.11.2026. Holat: **reja, implementatsiya boshlanmagan**. Asos: [MCP-AGENT.md](MCP-AGENT.md), `apps/mcp/src/tools.ts`, `supabase/migrations/004,005,008`, [BACKEND-AUDIT.md](BACKEND-AUDIT.md), [WEB-AUDIT.md](WEB-AUDIT.md) D-bo'lim.

## 0. Buzilmaydigan qoidalar (CLAUDE.md)

1. **AI hisoblamaydi.** Jami, qarz, qoldiq, foyda faqat kodda (`packages/core`) va SQL'da. AI javobida summa maydoni bo'lsa ham u faqat ko'rsatish uchun; server qayta hisoblaydi.
2. **AI moliyaviy yozuv qilmaydi.** Savdo, to'lov va kirim faqat **qoralama** (`agent_drafts`). Tasdiq faqat ilovada, savdogar sessiyasi bilan (`accept_agent_draft`). OAuth token `post_sale`, `record_payment`, `accept_agent_draft` ni chaqira olmaydi; bu SQL testlarida tasdiqlangan (`assert_first_party`, `RESTRICTIVE *_no_oauth`).
3. Istisno (asoschi qarori 03.11): AI katalogga mijoz yoki tovar **qo'sha oladi**. O'zgartirish va arxivlash faqat tasdiq so'rovi orqali.

## 1. Hozir nima bor

| Qatlam | Bor | Holat |
|---|---|---|
| MCP server `apps/mcp` | 13 tool: 7 o'qish, 2 katalogga qo'shish, 4 qoralama/so'rov | Testlar 76/76; haqiqiy Claude/ChatGPT bilan **sinalmagan** |
| OAuth 2.1 (Supabase) | `client_id` claim, `MCP_ALLOWED_CLIENT_IDS` | Bo'sh bo'lsa istalgan klient (S8) |
| Tasdiq UI | web «Qoralamalar» (tasdiqlash, rad etish, qidiruv) | Ishlaydi (demo); qatorlarni tahrirlab bo'lmaydi |
| Ilova ichidagi LLM | yo'q | Edge Function yo'q |
| Ovoz / rasm | yo'q | — |

## 2. Xavfsiz ishlatiladigan RPC'lar (AI uchun)

- **O'qish:** `agent_list_customers`, `agent_customer_balance`, `agent_list_sales`, `agent_get_sale`, `agent_daily_summary`, `agent_list_products`, `agent_list_suppliers`, `customer_outstanding`, `supplier_outstanding`, `partner_statement`.
- **Qoralama:** `agent_draft_sale`, `agent_draft_payment`, `agent_draft_purchase`, `agent_propose_*`.
- **Katalogga qo'shish:** `agent_add_customer`, `agent_add_products` (asoschi qarori).
- **HECH QACHON AI'ga berilmaydi:** `post_sale`, `reverse_sale*`, `record_payment`, `void_payment`, `post_purchase`, `reverse_purchase`, `record_supplier_payment`, `post_supplier_debt`, `post_supplier_opening_balance`, `adjust_stock`, `accept_agent_draft`, `reject_agent_draft`, `admin_*`.

## 3. Bosqichlar

### A1. Mavjud MCP'ni tayyorlash (kod, 1–2 kun)
- **S1:** `agent_draft_sale` ga `one_time` mijoz id'si berilsa rad etish (hozir abadiy `draft` qoladi).
- **S3:** arxivlangan mijozga qoralama tasdiqlanmasin (`draft_stale`).
- **B7:** kirim qoralamasi izohi yo'qolmasin.
- **S7:** MCP `p_client_total` ni string sifatida yuborsin.
- **S8:** production'da `MCP_ALLOWED_CLIENT_IDS` majburiy; bo'sh bo'lsa server ishga tushmasin.
- **W13:** OAuth rozilik matni haqiqiy imkoniyatga mos bo'lsin ("mijoz va tovar qo'sha oladi, savdo faqat qoralama").
- **Test:** har biri SQL yoki MCP unit testi bilan.

### A2. Qoralamani tahrirlash (SQL + web, 1–2 kun)
- RPC `update_agent_draft_lines(p_draft_id, p_lines, p_client_total)`:
  - faqat `draft` holatida;
  - jami serverda qayta hisoblanadi (`calculate_line_total`), mos kelmasa `calc_mismatch`;
  - audit izi.
- Web «Qoralamalar»: qatorni joyida tuzatish va sariq «noaniq» qatorlar.
- Avval SQL PR, keyin web PR (ISH-TARTIBI 4-band).

### A3. Haqiqiy aylanma sinovi (staging)
- Claude Desktop yoki ChatGPT → MCP (staging) → `draft_sale` → web tasdiq → savdo.
- OAuth token bilan to'g'ridan-to'g'ri `post_sale` rad etilishini haqiqiy Auth'da tekshirish.
- [STAGING-TEKSHIRUV.md](STAGING-TEKSHIRUV.md) S17.

### A4. Ilova ichidagi matnli agent (keyin, asoschi qarori bilan)
- Supabase Edge Function `parse-list`:
  - kirish: foydalanuvchi JWT va do'kon a'zoligi; OAuth rad etiladi;
  - chiqish: JSON schema (`product_id | null`, `qty_text`, `price_text`), **jami, summa va qarz maydonlari yo'q**.
- Sonlarni kod o'qiydi (`parseQtyMilli`, `parseUnitPriceText`). Tovar faqat do'kon katalogidagi nomzodlardan.
- Natija oddiy savdo formasiga sariq qatorlar bilan tushadi. Saqlash odatdagi tasdiq bilan.
- Provayderga bog'liq bo'lmagan adapter: Gemini bugun, boshqasi ertaga ([GEMINI-LLM.md](GEMINI-LLM.md)). Kalit faqat Supabase secret'da. Haqiqiy ma'lumot bilan faqat pullik daraja ishlatiladi.
- Limitlar: do'kon bo'yicha kunlik (taklif: 200), timeout 20 s. Logga matn yoki ism yozilmaydi.
- Baholash: 20 ta haqiqiy spiska, son va narx bo'yicha ≥ 95% (gipoteza H2).

### A5. Ovoz, keyin rasm (MVP'dan keyin)
- Ovoz: STT → matn → A4.
- Rasm (nakladnoy): `parse-invoice` → kirim qoralamasi.
- Ikkalasi ham faqat qoralama beradi, tasdiq ilovada.

## 4. Kerakli qarorlar va resurslar (asoschi)

- Gemini (yoki boshqa) API kaliti: billing ulangan, pullik daraja. Claude Code kalit so'ramaydi.
- `MCP_ALLOWED_CLIENT_IDS` qiymatlari (Claude va ChatGPT klientlari).
- A4 ni MVP'ga kiritish-kiritmaslik: MVP tamoyili bo'yicha avval A1–A3.

## 5. Tayyorlik mezoni (har bosqich)

- `npm test`, `npm run typecheck`, `bash supabase/tests/run_local.sh` yashil.
- Yangi mantiq uchun test bor va u eski kodda yiqiladi.
- Tanqidchi PASS.
- PR tavsifida nima sinalmagani yozilgan.
- Staging'da haqiqiy aylanma sinalmaguncha "ishlaydi" deyilmaydi.
