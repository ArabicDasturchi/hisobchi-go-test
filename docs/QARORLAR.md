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
| 28.10.2026 | MVP: bitta oqim (kiritish → tasdiqlash → hisob → natija). **Aniqlandi 03.11:** oqim ikki: Q1 ovozli savdo, Q2 suratdan kirim | 1 kunda ko'rsatiladigan ishlaydigan narsa kerak |
| 28.10.2026 | "Birinchimiz" demaymiz | pDaftar va Linko qisman shunday qiladi (RAQIBLAR.md) |
| 28.10.2026 | Stack: **Expo (React Native, TS)** → Android, iOS, veb; Supabase (Edge Functions + Postgres); veb Vercel'da. Alohida PC ilova yo'q | Mobil-birinchi; kamera, mikrofon, Bluetooth, oflayn ishonchli. Next.js PWA rad etildi (iOS cheklovlari) |
| 28.10.2026 | Pul butun so'm, miqdor `qty_milli` butun son; yaxlitlash qator bo'yicha | Float xatosi bo'lmasin |
| 28.10.2026 | Hisob ikki yo'l: TypeScript va Postgres SQL; farq bo'lsa blok | Haqiqiy mustaqillik |
| 28.10.2026 | Sonni AI emas, kod o'qiydi; narx tarixidan ±25% chetga chiqsa sariq | AI noto'g'ri son o'qishidan himoya |
| 28.10.2026 | Qoldiq jurnaldan hisoblanadi, UPDATE/DELETE taqiqlangan | Qoldiq ketib qolmasin |
| 28.10.2026 | ~~Ovoz/rasm 30 kun saqlanadi~~ **BEKOR (03.11):** MVP da audio va rasm saqlanmaydi | Maxfiylik va xotira |
| 28.10.2026 | ~~Oflayn navbat (SQLite) MVP da yo'q~~ **O'ZGARDI (03.11):** SQLite oflayn mobil ilovada allaqachon ishlaydi, MVP ning qismi | Mobil-birinchi, lekin MVP uchun vaqt |
| 28.10.2026 | Monorepo: apps/mobile, packages/core, supabase | Hisob kodi mobil va serverda bir xil |
| 02.11.2026 | MCP kirishi: **Supabase OAuth 2.1 server** (beta) + `apps/web` da `/oauth/consent` sahifasi. O'z OAuth proksimiz va shaxsiy token (Bearer) productionda yo'q; shaxsiy token faqat lokal dev uchun. Beta ishlamasa, boshqa variantga o'tilmaydi: ish to'xtaydi va asoschiga aytiladi | ChatGPT OAuth 2.1 + DCR talab qiladi; Supabase mavjud foydalanuvchilar va RLS ni qayta ishlatadi; o'z OAuth kodi xavfsizlik yuzasini kengaytiradi |
| 02.11.2026 | Dynamic Client Registration faqat Claude/ChatGPT ulanayotgan paytda yoqiladi, ulangach o'chiriladi | DCR istalgan klientga loyihada ro'yxatdan o'tishga ruxsat beradi (Supabase hujjati ogohlantiradi) |
| 02.11.2026 | MCP server Supabase loyihasi `kfrnlkwocwpezwgytcmz` (ap-south-1, `hisobchi-go`); `BACKEND_SETUP.md` dagi boshqa ikki ref eskirgan | Veb shu loyihada ishlaydi, 001 va 003 qo'llangan |
| 02.11.2026 | MCP hosting: Vercel, `apps/web` bilan bir jamoada alohida project (root `apps/mcp`). Hobby rejasining tijoriy foydalanishga ruxsati **topilmadi** (vercel.com bu sessiyada ochilmadi); pilot davrida tekshiriladi, to'lov qarori keyin | `apps/web` allaqachon Vercel'da; stateless Streamable HTTP funksiyaga mos |
| 02.11.2026 | MCP 1-bosqich: faqat o'qish + qoralama. Qoralamani ilovada ko'rsatish va "Tasdiqlash" keyingi vazifa; u tugamaguncha MCP foydalanishga tayyor emas | Qoralama ko'rinmasa agent ishi savdogarga yetib bormaydi |
| 02.11.2026 | OAuth token (`client_id` claim bor) bazada to'siladi: `post_sale`, `reverse_sale`, `record_payment`, `void_payment`, `create_shop`, `accept/reject_agent_draft` rad etiladi; barcha ijarachi jadvallarda RESTRICTIVE `*_no_oauth` siyosati (o'qish ham, yozish ham). Agent faqat `agent_*` RPC'larini chaqiradi | Token AI klientning qo'lida: "MCP'da confirm yo'q" faqat server qatlamida kafolat bo'lardi, klient PostgREST orqali `post_sale` ni o'zi chaqira olardi. Jadval o'qishi yopilgani telefon/izoh AI provayderga chiqmasligini bazada kafolatlaydi |
| 02.11.2026 | Qoralamalar `agent_drafts` jadvalida (ledger'dan alohida). Jami PostgreSQL'da hisoblanadi va TypeScript jami bilan solishtiriladi. Tasdiqlash `accept_agent_draft` (faqat ilova/veb tokeni) mavjud `post_sale` / `record_payment` ni chaqiradi; ochiq qoralama soni do'konga 50 ta bilan cheklangan | Tasdiqlashda ikki mustaqil hisob va qarz tekshiruvi qayta ishlaydi; spam himoyasi |
| 02.11.2026 | Xavfsizlik xatosi tuzatildi (004): `customer_outstanding()` a'zolikni tekshirmasdi, istalgan kirgan foydalanuvchi UUID bilan boshqa do'kon qarzini o'qiy olardi (lokal testda tasdiqlandi). Endi a'zolik tekshiriladi. Mobil va veb uni RPC sifatida chaqirmaydi, ularga ta'sir qilmaydi | Tenant izolyatsiyasi |
| 03.11.2026 | Qoralamalar veb panelda: `/drafts`, tasdiqlash `accept_agent_draft`, rad etish `reject_agent_draft`. Yangi migratsiya kerak bo'lmadi. Idempotentlik serverda (qator qulfi + `agent-draft:<id>`); veb ikkinchi bosishni "allaqachon hal qilingan" deb ko'rsatadi | Ikki marta bosish ikki savdo yozmasligi kerak (qoida 3 va 4) |
| 03.11.2026 | Qoralamalar yuklanmasa (masalan 004 qo'llanmagan) veb ilovaning qolgan qismi ishlayveradi; faqat "Qoralamalar" sahifasi xabar ko'rsatadi | 004 ni asoschi alohida qo'llaydi: veb 004 dan oldin ham yiqilmasligi kerak |
| 03.11.2026 | Veb qoralama jamini core formulasi bilan qayta tekshiradi; mos kelmasa "Tasdiqlash" yopiladi | Qoida 2: hisob mos kelmasa to'xtaydi |
| 03.11.2026 | **MVP ta'rifi:** savdogar pul to'laydigan bitta to'liq ishlaydigan qiymat. Pitchdagi ikki va'da: Q1 ovozli savdo, Q2 suratdan kirim. TZ v2 ([TZ-MVP.md](TZ-MVP.md)) v1 o'rnini bosadi | Sardor aka (IT Park, 02.11): "Mijoz buni nima uchun sotib oladi?" |
| 03.11.2026 | Vazifalar ICE bo'yicha tartiblanadi ([VAZIFALAR-ICE.md](VAZIFALAR-ICE.md)); ishonch past bo'lsa avval HADI sinovi | HADI darsi (31.10) |
| 03.11.2026 | Q2 (suratdan kirim) qurilishidan oldin qo'lda sinaladi (G1/H3): yuk xatini biz Claude + MCP bilan kiritib beramiz | Eng og'ir ish; talabni arzon tekshirish |
| 03.11.2026 | AI provayder: Gemini API (AI Studio, pullik daraja), Supabase Edge Function ichida; model env bilan almashtiriladi. Audio va rasm MVP da saqlanmaydi (28.10 dagi "30 kun saqlanadi" qarori o'rniga) | Kalit serverda; saqlash = qo'shimcha maxfiylik xavfi va ish |
| 03.11.2026 | Ish bo'linishi: Humoyun (APK, AI, ovoz, keyin surat) va Abdulloh Claude Code (migratsiya, core, ombor, veb, MCP) alohida fayl hududlarida | Ikki Claude Code bir-birining ishini buzmasin |
| 03.11.2026 | Aniqlik: "Next.js PWA rad etildi" faqat savdogar mobil ilovasi uchun. Veb panel (`apps/web`) Next.js da qoladi | 28.10 qatori bilan joriy kod o'rtasidagi ziddiyatni yo'qotish |
| 03.11.2026 | Eskirgan hujjatlar `docs/arxiv/` ga ko'chirildi: HOLAT-HISOBOTI, PROGRESS, DEMO_ITPARK, SERVER_XAVFSIZLIK | Yangi Claude seansi eski holatga tayanmasin |
| 03.11.2026 | Migratsiyalar `main` ga merge bo'lganda GitHub Actions orqali avtomatik qo'llanadi (`.github/workflows/migrate.yml`, Supabase CLI `db push`). Tartib: testlar, reja (dry-run), qo'riqchi, qo'llash. Production'ga qo'lda SQL Editor orqali qo'llash endi faqat favqulodda yo'l. Sirlar faqat GitHub Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (`service_role` kerak emas) | Asoschi migratsiyani qo'lda joylamasin; xato bo'lsa fayl tranzaksiyada to'liq bekor qilinadi |
| 03.11.2026 | 001-004 qayta nomlanmaydi va qayta qo'llanmaydi: bir martalik `mode=baseline` (`supabase migration repair --status applied`) tarixga yozadi. Qo'riqchi 001-004 kutilayotgan bo'lsa ishni to'xtatadi. Yangi migratsiyalar `005_nom.sql`, `006_nom.sql` ... (3 xonali raqam); vaqt belgisi (`supabase migration new`) bilan aralashtirilmaydi | CLI `001_` nomlarini qabul qiladi (lokal sinov); 001 qayta ishga tushsa yiqiladi; raqamli va vaqt belgili nomlar aralashsa tartib buziladi |
| 03.11.2026 | Xavfli migratsiya (`DROP TABLE/SCHEMA/COLUMN`, `TRUNCATE`, `WHERE`siz `DELETE FROM`) `production-approval` muhitida Required reviewers tasdig'ini kutadi; qo'shuvchi migratsiyalar `production` muhitida o'zi o'tadi. Bir vaqtda bitta migratsiya (`concurrency`) | Qaytarib bo'lmaydigan amal odam ko'zidan o'tsin |
| 03.11.2026 | Zaxira: Supabase hujjatiga ko'ra avtomatik kunlik zaxira faqat Pro va undan yuqori rejalarda. Workflow `backups list` ni ma'lumot uchun chop etadi, lekin bloklamaydi va ma'lumot dump'ini GitHub'ga yuklamaydi (mijoz ma'lumoti). Loyiha rejasi va zaxira holati **topilmadi** (tekshirilmadi) | Rule 6: mijoz ma'lumoti repo/artifact'ga chiqmasin |

## Ochiq qarorlar

- ~~Baza: Supabase yoki boshqa.~~ Hal qilindi: Supabase (02.11).
- STT/OCR: Gemini sinaladi (H2, T7); natija bo'yicha tanlanadi.
- Narx: 1-oy bepul, keyin ~200 000 so'm/oy — faraz, H3 va 50 suhbatda tekshiriladi.
- Prototip kodi egaligi: Humoyun bilan yozma kelishuv kerak.
