# AI provayder qatlami (F4 suratdan kirim, F5 erkin matn / ovoz matni)

Sana: 12.11.2026 (yangilandi 13.11). Holat: **server tomoni yozilgan, unit va SQL testlari yashil; haqiqiy Gemini API bilan 3/3 sinov OK (13.11, `scripts/ai-sinov.mjs`); Deno runtime va haqiqiy Supabase'da sinalmagan** (hisobot: [reports/2026-11-12-AI-QATLAM.md](reports/2026-11-12-AI-QATLAM.md)).

Asoschi qarori (13.11.2026, 12.11 dagi «Gemini yo'q» o'rniga): **AI hozir Gemini orqali ishlaydi** (`AI_PROVIDER=gemini`). OpenRouter keyin almashtirish uchun tayyor preset (`AI_PROVIDER=openrouter`), lekin **hozir yoqilmagan**. Qatlam provayderdan mustaqil: almashtirish faqat secret'larni o'zgartirish, kodga tegilmaydi.

## 1. Asosiy qoida

AI faqat matnni (yoki yuk xati suratini) **tuzilmaga** aylantiradi: tovar nomi, katalog id'si, soni, birligi, narxi — hammasi **matn** sifatida. AI:

- yig'indi, summa, qarz hisoblamaydi (javobda bo'lsa ham kod olib tashlaydi);
- bazaga yozmaydi (savdo/kirim faqat odatdagi tasdiq oqimida, savdogar tasdiqlagandan keyin);
- sonlarni o'qimaydi: `qty_text`, `price_text`, `row_total_text` ni web core `parseQtyMilli` / `parseUnitPriceText` (yoki `line` → `parsePastedList`) bilan o'qiydi.

## 2. Arxitektura

```
web (F1 joylash oqimi) ──POST {shop_id, mode, text|image}──▶ Edge Function ai-parse (Deno)
                                                              │ foydalanuvchi JWT (service_role YO'Q)
                                                              ├─ client_id claim → 403 (OAuth/MCP tokeni)
                                                              ├─ rpc ai_begin_request  (a'zolik + kunlik limit 200)
                                                              ├─ products (RLS)  → ≤300 nomzod promptga (k1..kN)
                                                              ├─ LlmProvider.complete  (20 s)
                                                              ├─ validateExtraction    (oq ro'yxat, jami yo'q)
                                                              └─ rpc ai_finish_request (holat, token, model)
web ◀── {request_id, lines[], model, usage, warnings} ── (jami YO'Q)
```

| Fayl | Vazifa |
|---|---|
| `supabase/functions/_shared/ai/types.ts` | `LlmProvider` interfeysi, `AiError` kodlari |
| `_shared/ai/http.ts` | `fetch` + `AbortController` timeout, HTTP xatolarini kodga aylantirish (javob tanasi logga/xabarga tushmaydi) |
| `_shared/ai/providers/openaiCompatible.ts` | `POST {baseUrl}/chat/completions` (OpenAI, OpenRouter, DeepSeek, Groq, Ollama, vLLM ...); rasm `image_url` data URL |
| `_shared/ai/providers/anthropic.ts` | `POST {baseUrl}/v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`; `temperature` yuborilmaydi; faqat `text` bloklari olinadi |
| `_shared/ai/providers/mock.ts` | testlar uchun |
| `_shared/ai/provider.ts` | `createProvider(env)` |
| `_shared/ai/extract.ts` | prompt quruvchi, katalog nomzodlari, javob validatori, kanonik `line` |
| `_shared/ai/request.ts` | so'rov tanasi tekshiruvi (matn ≤ 4000, rasm ≤ 4 MB, jpeg/png/webp + sehrli baytlar) |
| `_shared/ai/handler.ts` | butun oqim (bog'liqliklar inyeksiya qilinadi, Node'da testlanadi) |
| `supabase/functions/ai-parse/index.ts` | yupqa Deno o'rami: `Deno.serve` + supabase-js (esm.sh, faqat shu faylda) |
| `supabase/migrations/017_ai_sarf.sql` | `ai_requests` jadvali, `ai_begin_request`, `ai_finish_request`, `ai_usage_summary` |

`_shared/ai` sof TypeScript: tashqi import yo'q (faqat `fetch`, `AbortController`, `atob`, `TextDecoder`), Deno va Node'da bir xil ishlaydi.

### Qarorlar (default tanlandi, `docs/QARORLAR.md` ga qo'shish kerak)

1. **Katalog kaliti promptda qisqa (`k1`, `k2`, ...), uuid emas.** Kod kalitni haqiqiy `product_id` ga qaytaradi. Sabab: 300 ta uuid ~7–8 ming token; model to'qigan uuid katalogga hech qachon mos tushmaydi. Model haqiqiy katalog uuid'ini qaytarsa ham qabul qilinadi; boshqa har qanday qiymat → `null`.
2. **Nomzod tanlash:** katalogdan ko'pi bilan 2000 faol tovar o'qiladi, matnda nomi (4 harfli boshi, o'zbek kirill → lotin moslashtirish bilan) uchraganlar birinchi, jami ko'pi bilan 300 ta promptga boradi. Rasm rejimida — nom tartibida birinchi 300 ta.
3. **200 qatordan ortig'i kesiladi** va `warnings: ["lines_truncated"]` qaytadi (xato emas: savdogar qolganini qo'lda qo'shadi).
4. **Son maydoni uzunlik chegarasidan oshsa `null`** (kesish ma'noni o'zgartiradi), nom/izoh esa kesiladi.
5. **`row_total_text` faqat kirim rejimlarida** (`purchase_text`, `purchase_image`); sotuvda doim `null`.
6. **Mijoz ismi chiqmaydi:** promptda "mijoz/ta'minotchi ismini e'tiborsiz qoldir" deyilgan; javob sxemasida mijoz maydoni yo'q.
7. **Xato so'rovlar ham limitga kiradi** (provayder baribir pul oladi). `ai_not_configured` va tana xatolari limitga kirmaydi (begin'dan oldin tekshiriladi).
8. **`input_chars`** matn uchun belgilar (Unicode code point), rasm uchun bayt soni.
9. **`purchase_image` rejimida `text` e'tiborga olinmaydi.**

## 3. Muhit o'zgaruvchilari (Supabase secrets)

| O'zgaruvchi | Majburiy | Izoh |
|---|---|---|
| `AI_PROVIDER` | yo'q | standart **`gemini`** (`AI_API_KEY` bo'lsa). Boshqalar: `openrouter` (tayyor, yoqilmagan), `openai-compatible`, `anthropic`. Noma'lum → `ai_not_configured` |
| `AI_MODEL` | gemini: yo'q (standart `gemini-2.5-flash`); boshqalar: ha | provayderdagi model nomi (`[A-Za-z0-9._:/@+-]`, ≤ 200) |
| `AI_API_KEY` | gemini, openrouter, anthropic: ha; openai-compatible: lokal serverdan tashqari amalda ha | faqat secret'da, repoga yozilmaydi. Gemini: AI Studio kaliti, **pullik daraja** (bepul darajada ma'lumotdan foydalanilishi mumkin, [GEMINI-LLM.md](GEMINI-LLM.md)). Kalit URL'ga emas, `x-goog-api-key` sarlavhasiga qo'yiladi |
| `AI_BASE_URL` | yo'q | standartlar: gemini `https://generativelanguage.googleapis.com/v1beta`; openrouter `https://openrouter.ai/api/v1`; openai-compatible `https://api.openai.com/v1`; anthropic `https://api.anthropic.com`. **https majburiy** (http faqat `localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal`) |
| `AI_JSON_MODE` | yo'q | `off` → `response_format: json_object` yuborilmaydi (qo'llamaydigan provayder uchun) |
| `AI_TEMPERATURE` | yo'q | `0..2`, faqat openai-compatible so'roviga qo'shiladi (masalan Ollama/DeepSeek uchun `0`). Berilmasa yuborilmaydi: ba'zi modellar uni rad etadi |
| `AI_MAX_OUTPUT_TOKENS` | yo'q | standart 8192 (256..32000). Fikrlovchi modellarda fikrlash ham shu chegaradan sarflanadi |
| `AI_ALLOWED_ORIGINS` | yo'q | vergul bilan origin'lar ro'yxati; bo'sh bo'lsa `*` (Bearer token bilan, cookie yo'q) |

`SUPABASE_URL` va `SUPABASE_ANON_KEY` (yoki `SUPABASE_PUBLISHABLE_KEY`) Edge Function muhitida Supabase tomonidan beriladi. `SUPABASE_SERVICE_ROLE_KEY` **ishlatilmaydi**.

Misollar (qiymatlar o'rniga o'zingiznikini qo'ying):

```bash
# HOZIR: Gemini (AI Studio, pullik daraja)
supabase secrets set AI_API_KEY=<gemini-kalit>   # AI_PROVIDER=gemini va AI_MODEL=gemini-2.5-flash standart

# KEYIN (hozir yoqilmagan): OpenRouter — faqat shu ikki qiymatni almashtirish kifoya, kod o'zgarmaydi
# supabase secrets set AI_PROVIDER=openrouter AI_MODEL=<openrouter-model> AI_API_KEY=<openrouter-kalit>

# OpenAI yoki DeepSeek (openai-compatible)
supabase secrets set AI_PROVIDER=openai-compatible AI_MODEL=<model> AI_API_KEY=<kalit> AI_BASE_URL=https://openrouter.ai/api/v1

# Anthropic
supabase secrets set AI_PROVIDER=anthropic AI_MODEL=<model> AI_API_KEY=<kalit>

# O'chirish (ilova AI'siz ishlaydi, web 503 ai_not_configured oladi va qo'lda kiritishga qaytadi)
supabase secrets unset AI_PROVIDER
```

## 4. Deploy (asoschi bajaradi)

1. Migratsiya: `017_ai_sarf.sql` `main` ga merge bo'lganda CI qo'llaydi ([MIGRATSIYA-CI.md](MIGRATSIYA-CI.md)). Qo'lda production'ga qo'llanmaydi.
2. Secret'lar: yuqoridagi `supabase secrets set ...`. Production'da `AI_ALLOWED_ORIGINS` ni ham qo'ying (veb panel domeni), masalan `supabase secrets set AI_ALLOWED_ORIGINS=https://<panel-domen>`; bo'sh qolsa `*` (Bearer token bilan xavfsiz, lekin tavsiya etilmaydi).
3. Funksiya:
   ```bash
   supabase functions deploy ai-parse
   ```
   JWT tekshiruvi yoqiq qoladi (`--no-verify-jwt` ISHLATILMAYDI): gateway imzoni tekshiradi, funksiya ichida `auth.getUser` yana tekshiradi.
4. Tekshiruv (staging): web'dan bitta `sale_text` so'rovi → `select * from ai_usage_summary('<shop>', 1)`.

**Terminalsiz yo'l (13.11):** GitHub → Actions → «Edge Function deploy (ai-parse)» → Run workflow → `staging` yoki `production`
(`.github/workflows/deploy-functions.yml`). Bu workflow quyidagilarni qiladi:
- funksiya testlarini ishga tushiradi;
- muhitdagi `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` va `AI_ALLOWED_ORIGINS` sirlarini Supabase'ga yozadi;
- deploy qiladi;
- tokensiz so'rov 401 qaytishini tekshiradi.

Kalitlarni faqat GitHub Environments → Secrets ga kiritasiz, chatga yoki repoga yozilmaydi. Workflow faqat qo'lda ishga tushadi.

## 5. Yangi provayder qo'shish

1. `_shared/ai/providers/<nom>.ts`: `LlmProvider` ni qaytaruvchi `create<Nom>Provider(cfg)`; HTTP uchun `postJson` (timeout va xato kodlari tayyor). Javobdan faqat matnni oling, `usage` ni `{inputTokens, outputTokens}` ga aylantiring, rad etish → `ai_refused`, kesilish → `ai_output_truncated`.
2. `provider.ts`: `SUPPORTED_PROVIDERS` ga nom va `createProvider` ga tarmoq.
3. `__tests__/providers.test.ts`: so'rov tanasi (fetch mock), xato kodlari, timeout; Gemini (sarlavhadagi kalit, JSON rejim, rasm `inline_data`, MAX_TOKENS/SAFETY) va OpenRouter preseti.
4. Haqiqiy provayderni lokal sinash (bazasiz): `AI_PROVIDER=gemini AI_MODEL=gemini-2.5-flash AI_API_KEY=... npx vite-node scripts/ai-sinov.mjs` — 3 ta namuna (385 000, kirill, kirim), AI o'qigan sonlar kod hisobi bilan solishtiriladi.
4. Ko'p provayder OpenAI formatini qo'llaydi: avval `openai-compatible` + `AI_BASE_URL` bilan sinab ko'ring, alohida adapter shart bo'lmasligi mumkin.

## 6. Xarajat, limit, log siyosati

- **Limit:** do'kon bo'yicha oxirgi 24 soatda 200 ta so'rov (`ai_daily_limit_per_shop()`), oshsa HTTP 429 `ai_daily_limit`. Parallel so'rovlar advisory lock bilan ketma-ket sanaladi.
- **Timeout:** butun so'rov 20 s; provayderga qolgan vaqt beriladi. Katalog/baza sekin bo'lib 1 s dan kam qolsa, provayder chaqirilmaydi (504 `ai_timeout`).
- **Ma'lum cheklov:** matndagi mijoz ismi/telefoni provayderga matn ichida ketadi (promptda faqat "e'tiborsiz qoldir" deyilgan, olib tashlanmaydi). A'zo `ai_finish_request` ni o'zi chaqirib, o'z so'rovining token ko'rsatkichini noto'g'ri yozishi mumkin (limitga ta'sir qilmaydi; o'lchov faqat ma'lumot uchun).
- Edge Function handler'ga faqat `AI_*` o'zgaruvchilari uzatiladi.
- **O'lchov:** `ai_usage_summary(shop_id, days)` — kun (Toshkent vaqti), rejim, so'rovlar, ok/xato, kirish/chiqish tokenlari. So'mdagi narx = token × provayder narxi (provayder tanlangach hisoblanadi; TZ 2.3 "bitta savdo uchun AI narxi").
- **Saqlanmaydi:** matn, rasm, mijoz ismi, model javobi. `ai_requests` da faqat uzunlik, token, model, kod, vaqt.
- **Log (console):** `{fn, status, code, http, mode, request_id, ms, model, input_tokens, output_tokens, lines, warnings, provider_http}`. Matn, rasm, tovar/mijoz nomi, `shop_id`, foydalanuvchi id'si yozilmaydi. Provayder HTTP xatosining tanasi o'qiladi, lekin hech qayerga yozilmaydi (unda kirish matni qaytishi mumkin).
- **Haqiqiy savdogar ma'lumoti** faqat ma'lumotni o'qitishga ishlatmaydigan pullik darajada yuborilsin (provayder shartlarini asoschi tekshiradi).
- Yakunlanmay qolgan (`started`) yozuv (funksiya qulasa) limitga kiradi va o'lchovda `requests - ok - error` sifatida ko'rinadi.

## 7. Web uchun API shartnomasi

`POST {SUPABASE_URL}/functions/v1/ai-parse`, sarlavhalar: `Authorization: Bearer <foydalanuvchi access_token>`, `apikey: <anon key>`, `Content-Type: application/json`.

So'rov:

```json
{ "shop_id": "<uuid>", "mode": "sale_text" | "purchase_text" | "purchase_image",
  "text": "…",                                   // matn rejimlarida majburiy, ≤ 4000 belgi
  "image": { "mime": "image/jpeg", "base64": "…" } // purchase_image da majburiy, ≤ 4 MB; "data:…;base64," prefiksi ham qabul qilinadi
}
```

Javob 200:

```json
{ "request_id": "<uuid>",
  "lines": [ { "name": "Chirmoq", "product_id": "<uuid>|null", "qty_text": "10", "unit": "ta|null",
               "price_text": "13 ming|null", "row_total_text": "130 000|null", "note": "…|null",
               "line": "Chirmoq 10 tax13 ming" } ],
  "model": "…", "usage": { "input_tokens": 642, "output_tokens": 120 },
  "warnings": [ "lines_truncated" | "invalid_lines_dropped" | "unknown_product_ids" | "fields_dropped" | "field_too_long" ] }
```

Jami/summa/qarz maydoni **yo'q**. Web: `line` larni `\n` bilan birlashtirib F1 `parsePastedList` ga beradi (yoki maydonlarni to'g'ridan-to'g'ri `parseQtyMilli`/`parseUnitPriceText` bilan o'qiydi), `product_id` bo'lsa tovarni katalogdan oladi, kirimda `qty × narx` ni kod hisoblab `row_total_text` bilan solishtiradi (farq → sariq). `name` da raqam bo'lsa (`Coca-Cola 1.5L`) `line` noaniq bo'lishi mumkin — bunday holda maydonlardan foydalaning.

Xato javobi: `{ "error": "<kod>", "message": "<o'zbekcha qisqa matn>" }`

| HTTP | `error` | Web nima qiladi |
|---|---|---|
| 400 | `invalid_request`, `invalid_shop_id`, `invalid_mode`, `text_required`, `text_too_long`, `image_required`, `unsupported_image_type`, `invalid_image`, `image_too_large` | kiritishni tuzatish |
| 401 | `unauthorized` | qayta kirish |
| 403 | `oauth_client_forbidden`, `forbidden` | ruxsat yo'q |
| 405 | `method_not_allowed` | — |
| 413 | `payload_too_large` | rasmni siqish |
| 422 | `ai_refused`, `ai_output_truncated` | qo'lda / ro'yxatni bo'lib yuborish |
| 429 | `ai_daily_limit` | bugun qo'lda kiritish |
| 500 | `catalog_unavailable`, `internal_error` | qayta urinish / qo'lda |
| 502 | `ai_provider_error`, `ai_bad_output` | qo'lda (F1 oqimi) |
| 503 | `ai_not_configured`, `ai_provider_busy` | AI tugmasini yashirish / keyinroq |
| 504 | `ai_timeout` | qayta urinish yoki qo'lda |

Har qanday xatoda web matnni F1 `parsePastedList` ga berib, "AI ishlamadi, qo'lda tekshiring" ko'rsatadi (TZ 2.2).

## 8. Testlar

```bash
npx vitest run --root supabase/functions   # _shared/ai unit testlari
npx tsc -p supabase/functions              # _shared tip tekshiruvi (index.ts Deno'ga bog'liq, kirmaydi)
```

SQL: `supabase/tests/95_ai_sarf.test.sql` (`run_local.sh` ga 017 va 95 hali qo'shilmagan — boshqa agent tahrirlayapti).
