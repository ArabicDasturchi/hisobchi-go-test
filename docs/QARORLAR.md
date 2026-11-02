# Qarorlar jurnali

Har qaror: sana, nima, nega. Yangi qaror pastga qo'shiladi.

| Sana | Qaror | Sabab |
|---|---|---|
| 28.10.2026 | Loyiha Hisobchi Go, Sardor aka (IT Park Andijon) tasdiqladi, jamoa "Unikorumlar" | Inkubatsiya 1 oylik dasturi |
| 28.10.2026 | Jamoa: Abdulloh Ismoilov + Humoyun Anvarjon (GitHub: ArabicDasturchi) | Loyiha egalari repoga a'zo bo'ladi |
| 28.10.2026 | Ilova nomi **Hisobchi Go** qoladi | Boshqa nomlar (Munshi, Mirob va b.) mos topilmadi; nom birinchi eshitishda tushunarli bo'lishi kerak |
| 28.10.2026 | Mobil asosiy (Android+iOS), PC uchun veb versiya, umumiy baza | Savdogar telefonda va kompyuterda ishlaydi |
| 28.10.2026 | AI tushunadi, kod hisoblaydi; AI hech qachon yig'indi yozmaydi | Hisob xatosi pitchdagi asosiy va'da |
| 28.10.2026 | Telegram/SMS faqat mijozga xabar uchun | Savdogar ilovaning o'zida ishlaydi |
| 28.10.2026 | Google Sheets bazasi bekor; haqiqiy baza | Ikki qurilma, tezlik, ishonchlilik |
| 28.10.2026 | MVP: bitta oqim (kiritish → tasdiqlash → hisob → natija) | 1 kunda ko'rsatiladigan ishlaydigan narsa kerak |
| 28.10.2026 | "Birinchimiz" demaymiz | pDaftar va Linko qisman shunday qiladi (RAQIBLAR.md) |
| 28.10.2026 | Stack: **Expo (React Native, TS)** → Android, iOS, veb; Supabase (Edge Functions + Postgres); veb Vercel'da. Alohida PC ilova yo'q | Mobil-birinchi; kamera, mikrofon, Bluetooth, oflayn ishonchli. Next.js PWA rad etildi (iOS cheklovlari) |
| 28.10.2026 | Pul butun so'm, miqdor `qty_milli` butun son; yaxlitlash qator bo'yicha | Float xatosi bo'lmasin |
| 28.10.2026 | Hisob ikki yo'l: TypeScript va Postgres SQL; farq bo'lsa blok | Haqiqiy mustaqillik |
| 28.10.2026 | Sonni AI emas, kod o'qiydi; narx tarixidan ±25% chetga chiqsa sariq | AI noto'g'ri son o'qishidan himoya |
| 28.10.2026 | Qoldiq jurnaldan hisoblanadi, UPDATE/DELETE taqiqlangan | Qoldiq ketib qolmasin |
| 28.10.2026 | Ovoz/rasm 30 kun saqlanadi | Maxfiylik va xotira |
| 28.10.2026 | Oflayn navbat (SQLite) 1-bosqichda, MVP da yo'q | Mobil-birinchi, lekin MVP uchun vaqt |
| 28.10.2026 | Monorepo: apps/mobile, packages/core, supabase | Hisob kodi mobil va serverda bir xil |
| 02.11.2026 | MCP kirishi: **Supabase OAuth 2.1 server** (beta) + `apps/web` da `/oauth/consent` sahifasi. O'z OAuth proksimiz va shaxsiy token (Bearer) productionda yo'q; shaxsiy token faqat lokal dev uchun. Beta ishlamasa, boshqa variantga o'tilmaydi: ish to'xtaydi va asoschiga aytiladi | ChatGPT OAuth 2.1 + DCR talab qiladi; Supabase mavjud foydalanuvchilar va RLS ni qayta ishlatadi; o'z OAuth kodi xavfsizlik yuzasini kengaytiradi |
| 02.11.2026 | Dynamic Client Registration faqat Claude/ChatGPT ulanayotgan paytda yoqiladi, ulangach o'chiriladi | DCR istalgan klientga loyihada ro'yxatdan o'tishga ruxsat beradi (Supabase hujjati ogohlantiradi) |
| 02.11.2026 | MCP server Supabase loyihasi `kfrnlkwocwpezwgytcmz` (ap-south-1, `hisobchi-go`); `BACKEND_SETUP.md` dagi boshqa ikki ref eskirgan | Veb shu loyihada ishlaydi, 001 va 003 qo'llangan |
| 02.11.2026 | MCP hosting: Vercel, `apps/web` bilan bir jamoada alohida project (root `apps/mcp`). Hobby rejasining tijoriy foydalanishga ruxsati **topilmadi** (vercel.com bu sessiyada ochilmadi); pilot davrida tekshiriladi, to'lov qarori keyin | `apps/web` allaqachon Vercel'da; stateless Streamable HTTP funksiyaga mos |
| 02.11.2026 | MCP 1-bosqich: faqat o'qish + qoralama. Qoralamani ilovada ko'rsatish va "Tasdiqlash" keyingi vazifa; u tugamaguncha MCP foydalanishga tayyor emas | Qoralama ko'rinmasa agent ishi savdogarga yetib bormaydi |
| 02.11.2026 | OAuth token (`client_id` claim bor) bazada to'siladi: `post_sale`, `reverse_sale`, `record_payment`, `void_payment`, `create_shop`, `accept/reject_agent_draft` rad etiladi; barcha ijarachi jadvallarda RESTRICTIVE `*_no_oauth` siyosati (o'qish ham, yozish ham). Agent faqat `agent_*` RPC'larini chaqiradi | Token AI klientning qo'lida: "MCP'da confirm yo'q" faqat server qatlamida kafolat bo'lardi, klient PostgREST orqali `post_sale` ni o'zi chaqira olardi. Jadval o'qishi yopilgani telefon/izoh AI provayderga chiqmasligini bazada kafolatlaydi |
| 02.11.2026 | Qoralamalar `agent_drafts` jadvalida (ledger'dan alohida). Jami PostgreSQL'da hisoblanadi va TypeScript jami bilan solishtiriladi. Tasdiqlash `accept_agent_draft` (faqat ilova/veb tokeni) mavjud `post_sale` / `record_payment` ni chaqiradi; ochiq qoralama soni do'konga 50 ta bilan cheklangan | Tasdiqlashda ikki mustaqil hisob va qarz tekshiruvi qayta ishlaydi; spam himoyasi |
| 02.11.2026 | Xavfsizlik xatosi tuzatildi (004): `customer_outstanding()` a'zolikni tekshirmasdi, istalgan kirgan foydalanuvchi UUID bilan boshqa do'kon qarzini o'qiy olardi (lokal testda tasdiqlandi). Endi a'zolik tekshiriladi. Mobil va veb uni RPC sifatida chaqirmaydi, ularga ta'sir qilmaydi | Tenant izolyatsiyasi |

## Ochiq qarorlar

- Baza: Supabase yoki boshqa.
- STT/OCR xizmati: sinab tanlanadi.
- Narx: 1-oy bepul, keyin ~200 000 so'm/oy — faraz, 50 suhbatda tekshiriladi.
- Prototip kodi egaligi: Humoyun bilan yozma kelishuv kerak.
