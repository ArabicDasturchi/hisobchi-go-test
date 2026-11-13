# Holat: F1–F5 va backend (B2, B3, B5)

Yangilangan: 12.11.2026.

Ish joyi:
- branch `feat/f1-ruyxat-joylash`, ishchi nusxa: `C:\Users\humoy\Desktop\hg-ready`;
- asos `origin/main` @ `14c0462`, #57 qo'shimcha qo'llangan;
- **hech narsa commit qilinmagan** (asoschi ruxsati kutilmoqda).

## Tayyor (lokal, testlar yashil)

- **F1** joylash
- **F2** Savat
- **B3** qoralamani savatga olish
- **F3** audit va kirimni to'lovi bilan bekor qilish
- **F4/F5**: provayderdan mustaqil `ai-parse` + web oynasi
- **B2** 015
- **B5** eksport, zaxira va tiklash skriptlari, production hujjati

Hisobotlar: `docs/reports/2026-11-12-*.md`.

Oxirgi natijalar:

| Tekshiruv | Natija |
|---|---|
| `npm test` | core 288, mobile 182, web 576, admin 38, mcp 76, functions 84, ci 23 |
| typecheck, lint, build | OK |
| `run_local.sh` (001–019) | 910 PASS |

## Qolgan (asoschi kerak)

1. Commit va PR'lar: reja `docs/reports/2026-11-12-F2-F5-BACKEND.md` 6-bo'limda.
2. ~~AI provayder~~ — 13.11: Gemini (adapter tayyor). Kerak: Gemini kaliti (pullik daraja) staging/production sirlariga.
3. ~~K3 qarori~~ — 13.11 da hal qilindi (qulf saqlanadi, web himoyasi).
4. Staging loyihasi va sirlar, keyin 015–019 staging, keyin production.
5. Narxda nuqta qarori (F1).
6. ~~Rollar~~ — 13.11: 019 (sotuvchi bekor qila olmaydi), bazada majburiy.

## Keyingi aniq qadam

Asoschi ruxsat bersa:
1. `main` dan PR branch'lar (6-bo'lim tartibi).
2. Har birida `npm test`, `typecheck`, `run_local.sh`.
3. PR tavsifida "Humoyun/Abdulloh tasdiqlasin" va "sinalmagan" bo'limi.

Staging tayyor bo'lsa: `docs/PRODUCTION-TAYYORLIK.md` 3-bo'lim ro'yxati.

## 13.11.2026 bosqichi

- K3: qulf saqlanadi, web oldindan to'xtatadi (products sahifasi), mobilga talab.
- Rollar: `019_rollar.sql` + `94_rollar.test.sql`; web bekor qilish tugmalari rolga bog'landi.
- K4: rad etilgan kirimdan keyin yangi tovarlar arxivlanadi.
- AI deploy: `.github/workflows/deploy-functions.yml` (qo'lda, sirlar GitHub'da).
- Qolgan yagona to'siq (asoschi): AI provayder nomi va kaliti; staging loyihasi sirlari; commit/PR ruxsati.

## 13.11.2026 (2) — AI Gemini orqali

- `supabase/functions/_shared/ai/providers/gemini.ts`: generateContent, kalit `x-goog-api-key` sarlavhasida, JSON rejim, rasm inline_data, MAX_TOKENS/SAFETY xatolari.
- `provider.ts`: `AI_PROVIDER=gemini` (hozirgi), `openrouter` preset (tayyor, yoqilmagan).
- `scripts/ai-sinov.mjs`: haqiqiy provayderni bazasiz sinash (`npx vite-node scripts/ai-sinov.mjs`). Haqiqiy Gemini (asoschi terminalida, 13.11): 3/3 OK — 385 000, 205 000, 170 000 kod hisobi bilan mos.
- Testlar: functions 89, web ai-lines 14 — o'tdi.
- Bloklovchi: staging Supabase loyihasi va GitHub sirlari (Gemini kaliti staging sirlariga).

## 13.11.2026 (3) — Gemini standart, surat siqish

- Haqiqiy Gemini sinovi (asoschi): 3/3 OK, hisobotlarga yozildi.
- `provider.ts`: AI_PROVIDER berilmasa va AI_API_KEY bo'lsa — Gemini, model standart `gemini-2.5-flash`; OpenRouter faqat aniq tanlansa. Deploy uchun yagona sir: `AI_API_KEY`.
- F4: `apps/web/src/lib/imagePrep.ts` — katta yoki HEIC surat brauzerda JPEG'ga siqiladi (≤ 4 MB, ≤ 2000 px), `AiAssist` unga ulandi. Haqiqiy telefon/brauzerda sinalmagan.
- Testlar: functions 90, image-prep + ai-lines 20 — o'tdi.
- Bloklovchi: staging Supabase loyihasi va GitHub `staging` sirlari (STAGING_SUPABASE_ACCESS_TOKEN, STAGING_SUPABASE_DB_PASSWORD, STAGING_SUPABASE_PROJECT_REF, AI_API_KEY); commit/PR/deploy ruxsati.
