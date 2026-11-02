# MCP / Connector: Hisobchi Go'ga tashqi AI orqali kirish

Holat: **reja** (kod yozilmagan). Vazifa Humoyun Claude'iga. Sana: 02.11.2026.

## Maqsad

Asoschi Claude / ChatGPT / Gemini orqali Hisobchi Go ichida ishlay olsin: ma'lumot to'ldirish, nazorat (savdo, qarz, hisobotni ko'rish), mayda ishlar. Ilovani tekshirishning 1-o'zgarishi.

## Qoidalar (CLAUDE.md dan, buzilmaydi)

1. AI yig'indi hisoblamaydi va bazaga o'zi yozmaydi. Savdo faqat `post_sale` RPC orqali (ikki mustaqil hisob).
2. Agent **qoralama (draft)** yaratadi; savdogar ilovada tasdiqlaydi. Tasdiqlanmaguncha hech narsa saqlanmaydi.
3. Jurnal append-only. Tuzatish teskari yozuv bilan (`reverse_sale`).
4. `service_role` kaliti MCP serverda **ishlatilmaydi**. Har so'rov foydalanuvchining o'z tokeni bilan, RLS ostida.
5. Kalit, parol, mijoz telefoni repoga yozilmaydi.

## Taklif qilingan tuzilma

- Alohida kichik **remote MCP server** (Streamable HTTP), masalan `apps/mcp` (Vercel yoki Render).
- Kirish: **OAuth 2.1** (Supabase Auth bilan; Dynamic Client Registration kerak bo'lishi mumkin, chunki ChatGPT shuni talab qiladi). Bearer-token bilan oddiy ulanish ChatGPT'da ishlamaydi.
- Token foydalanuvchiniki, shuning uchun RLS faqat uning do'koni ma'lumotini ko'rsatadi.

### Asboblar (tools)

| Asbob | Turi | Izoh |
|---|---|---|
| `list_customers`, `get_customer_balance` | o'qish | `customer_outstanding` RPC |
| `list_sales`, `get_sale` | o'qish | |
| `daily_summary` | o'qish | kod hisoblaydi, AI emas |
| `draft_sale` | qoralama | matn -> (tovar, soni, narx); saqlanmaydi, sariq holat |
| `draft_payment` | qoralama | to'lov qarzdan oshmasin |
| `confirm_*`, `reverse_*` | **MCP'da yo'q** | tasdiqlash faqat ilovada, savdogar qo'li bilan |

Birinchi bosqich: faqat o'qish + qoralama. Yozuvni tasdiqlash MCP'dan berilmaydi.

## Mijozlar (client) holati — tekshirilgan (taxminan 04.2026 manba, qayta tekshirish kerak)

- Claude: Customize > Connectors'da URL bilan qo'shiladi, OAuth bor. Pro/Max/Team/Enterprise.
- ChatGPT: custom MCP — Plus va undan yuqori, OAuth 2.1 + DCR majburiy.
- Gemini: chat ilovasida custom remote MCP **topilmadi**. Gemini CLI va Gemini API/SDK MCP'ni qo'llaydi (manba aniq emas).

## Qabul mezonlari

- Boshqa do'konning ma'lumoti ko'rinmaydi (RLS testi).
- `draft_sale` bazaga savdo yozmaydi (test).
- Token muddati tugasa, so'rov rad etiladi.
- Test: 10x13 000 + 5x15 000 + 20x9 000 = 385 000.

## Ochiq savollar

- Server qayerda turadi (Vercel yoki Render) va kim to'laydi?
- Supabase OAuth server tayyormi, yoki o'zimiz yozamizmi? Humoyun aniqlasin.
