# Vazifa H-1: Android APK + AI tushunish + ovozli savdo (Q1)

Bajaruvchi: Humoyun Anvarjon (Claude Code). Topshiruvchi: Abdulloh (arxitektor-Claude orqali), 03.11.2026.

Avval o'qi: `CLAUDE.md`, `docs/TZ-MVP.md` (2-bo'lim to'liq), `docs/VAZIFALAR-ICE.md` (3-bo'lim: sening hududing), `docs/QARORLAR.md`, `docs/GEMINI-LLM.md`, `packages/core/src/parse-list.ts`, `apps/mobile/src/features/DraftContext.tsx`, `apps/mobile/src/app/(tabs)/new.tsx`.

## Maqsad
Pitchdagi 1-va'dani ishlaydigan qilish: savdogar ovozli xabar aytadi, AI ro'yxat tuzadi, savdogar tasdiqlaydi, kod hisoblaydi. Va savdogar telefoniga o'rnatiladigan APK.

## Hudud (boshqa Claude Code parallel ishlayapti)
Faqat: `supabase/functions/**`, `apps/mobile/src/app/(tabs)/new.tsx`, `apps/mobile/src/features/useVoiceInput.ts`, yangi `apps/mobile/src/features/ai*`, `apps/mobile/eas.json`, `apps/mobile/app.json`.
Tegma: `supabase/migrations/**`, `packages/core` hisob funksiyalari (faqat chaqir), `review.tsx` dizayni, `apps/web`, `apps/mcp`. Boshqa faylni o'zgartirish shart bo'lsa, alohida kichik PR qil va tavsifida sababini yoz.

## Tartib (har biri alohida PR, `main` dan branch)

### PR 1: T3 — Android APK
- `apps/mobile/eas.json`: `preview` profili (`buildType: apk`), `development` profili (dev client).
- `app.json`: mikrofon ruxsati matni o'zbekcha; `package` o'zgarmaydi (`uz.unikorumlar.hisobchigo`).
- `expo-speech-recognition` va kelajakdagi `expo-audio` dev build'da ishlashini tekshir.
- `docs/APK.md`: build qilish, APK havolasini savdogarga berish, yangilash.
- Qabul: APK Android 10+ da o'rnatiladi, kirish, savdo, sinxronizatsiya ishlaydi. Build'ni Humoyun o'zi ishga tushiradi (`eas build`), sen buyruq va sozlamani tayyorla.

### PR 2: T1 — `parse-list` Edge Function (matn)
`docs/TZ-MVP.md` 2.1 bo'yicha:
- `supabase/functions/parse-list/index.ts` (Deno). Kirish `{ shop_id, text }`. Foydalanuvchi JWT, a'zolik tekshiruvi; `client_id` claim bor token rad etiladi.
- Do'kon katalogini RLS ostida foydalanuvchi tokeni bilan o'qi (≤ 500 tovar). `service_role` ishlatma.
- Gemini chaqiruvi: structured output (JSON schema), `AI_MODEL` va `GEMINI_API_KEY` env'dan. Model nomini kodga qattiq yozma.
- Javobni schema bilan tekshir (zod yoki qo'lda). Jami, summa maydonlari bo'lsa olib tashla. Katalogda yo'q `product_id` → `null`.
- Limit: do'kon boshiga kunlik 200 chaqiruv. Buning uchun jadval kerak bo'lsa, migratsiya yozma: hozircha xotiradagi hisob yoki Supabase'dagi mavjud vositani taklif qil va `docs/AI-PARSE.md` ga yoz. Migratsiya kerak bo'lsa, asoschiga ayt.
- Log: model, token, vaqt, natija. Matn va ism logga tushmaydi.
- Mobil: `apps/mobile/src/features/aiParse.ts`: funksiyani chaqiradi, qatorlarni core bilan o'qiydi (`parseQtyMilli`, `parseUnitPriceText`), sariq qoidalarini qo'llaydi (TZ 2.2), DraftContext qatorlariga aylantiradi. Xato yoki oflayn bo'lsa, mavjud `parseProductList` ga qaytadi va xabar ko'rsatadi.
- `new.tsx`: "Tahlil qilish" avval AI, keyin zaxira. Ekran tuzilmasini kam o'zgartir.

### PR 3: T2 — Ovozli xabar
- `expo-audio` bilan yozish (≤ 60 s), m4a, `parse-list` ga `audio_base64` bilan. Funksiya audio'ni Gemini'ga beradi, `transcript` ham qaytaradi.
- Mikrofon tugmasi: bosib turish yoki bosib-to'xtatish (oddiyini tanla). Yozish vaqtida taymer. Tugagach darhol tahlil.
- Telefon ichidagi STT (`useVoiceInput`) zaxira bo'lib qoladi.
- Audio saqlanmaydi.

## Testlar
- Funksiya: schema tekshiruvi, jami e'tiborsiz qoldirilishi, boshqa do'kon katalogi kirmasligi, OAuth token rad etilishi, Gemini xatosi. Gemini'ni mock qil.
- Mobil: AI qatorlari core orqali o'qiladi; "Karim akaga o'nta chirmoq o'n uch mingdan, beshta yurak o'n besh ming, yigirmata momiq to'qqiz ming" → 3 qator, jami 385 000 (kod hisoblaydi); noaniq son → sariq; AI xatosida zaxira tahlil ishlaydi.
- **Eval to'plami:** `supabase/functions/parse-list/eval/` da 20 ta spiska (hozircha sintetik; Abdulloh haqiqiylarini beradi, telefon va to'liq ismlarsiz). Skript sonlar/narxlar aniqligini % da chiqaradi (gipoteza H2: ≥ 95%). Haqiqiy Gemini bilan faqat qo'lda ishga tushadi.
- `npm test` va `npm run typecheck` har commitdan oldin yashil.

## Hujjat
`docs/AI-PARSE.md`: qanday ishlaydi, deploy (`supabase functions deploy parse-list`), secret qo'yish (`supabase secrets set GEMINI_API_KEY=...` ni Humoyun yoki Abdulloh o'zi bajaradi), limitlar, bitta savdo narxi (so'm, o'lchab yoz). `docs/QARORLAR.md` ga qaror qatorlari qo'sh. `docs/VAZIFALAR-ICE.md` da T1, T2, T3 holatini yangila.

## Qat'iy qoidalar
- AI yig'indi hisoblamaydi, bazaga yozmaydi. Savdo faqat savdogar tasdiqlagach `post_sale` orqali.
- Kalit, parol, mijoz telefoni repoga va logga yozilmaydi. `service_role` ishlatma.
- Pul butun so'm.
- Faktni to'qima: Gemini imkoniyati (audio, structured output, narx) rasmiy hujjatda topilmasa "topilmadi" deb yoz.
- Reja va ochiq savollarni avval qisqa yoz, javob kelmasa mantiqiy defaultni tanlab davom et va tanlovni PR'da yoz.
- Kichik commitlar, tushunarli xabarlar. `main` ga o'zing merge qilma.
