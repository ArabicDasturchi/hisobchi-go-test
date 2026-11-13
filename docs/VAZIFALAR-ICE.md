# Vazifalar navbati (ICE)

Sana: 03.11.2026. Manba: HADI darsi (IT Park, 31.10), Sardor akaning MVP savoli (02.11), [TZ-MVP.md](TZ-MVP.md).

**ICE:** Ta'sir (I), Ishonch (C), Osonlik (E), har biri 1-10. Ball = o'rtacha. Ballarni arxitektor-Claude qo'ydi: **bular taxmin**, jamoa o'zgartiradi. Ishonch past bo'lsa, avval kichik sinov (HADI), keyin qurish.

- **Ta'sir:** savdogar pul to'lashiga qanchalik yaqinlashtiradi.
- **Ishonch:** dalil bormi (suhbatlar, Rahim aka daftari, raqiblar).
- **Osonlik:** ish hajmi (Claude Code seanslarida, taxmin).

## 1. Navbat

| # | Vazifa | I | C | E | Ball | Egasi | Bog'liqlik | Holat |
|---|---|---|---|---|---|---|---|---|
| G1 | **Pul sinovi (kod emas):** 10 savdogarga ovozli savdo demo; 3 ta "ilova ishlatadigan" savdogarning yuk xatini biz qo'lda (Claude + MCP) kiritib beramiz. Kim to'laydi? | 10 | 6 | 8 | **8.0** | Abdulloh | — | navbatda |
| T3 | **Android APK** (EAS `preview`): savdogar telefoniga o'rnatiladi, mikrofon ishlaydi | 8 | 9 | 7 | **8.0** | Humoyun | — | navbatda |
| T4 | **Haqiqiy tovarlar bazasi**: Sheets "Tovarlar" dan aniq qatorlarni kiritish; noaniq narxlarni asoschi tasdiqlaydi | 6 | 9 | 9 | **8.0** | arxitektor-Claude | PR #3, #4 merge | navbatda |
| T11 | PR'larda testlar (`ci.yml`), migratsiya CI ni yoqish | 5 | 9 | 9 | **7.7** | Abdulloh Claude Code | CI PR merge | qisman tayyor |
| T1 | **AI tushunish (Q1):** `ai-parse` Edge Function (12.11: `parse-list` o'rniga), matndan qatorlar | 8 | 7 | 7 | **7.3** | Humoyun | — | navbatda |
| T5 | Tezkor savdo, bir martalik mijoz, ixcham tovar kartochkasi | 7 | 8 | 7 | **7.3** | Abdulloh Claude Code | — | `PROMPT-3` S4 |
| T2 | **Ovozli xabar (Q1):** brauzer nutqni tanish → matn → `ai-parse` (12.11) | 8 | 5 | 6 | **6.3** | Humoyun | T1 | navbatda |
| T6 | Kirim, ombor, ta'minotchi modeli (`post_purchase`) | 7 | 7 | 5 | **6.3** | Abdulloh Claude Code | — | `PROMPT-3` S2-S3 |
| T7 | **Suratdan kirim (Q2):** `ai-parse` `purchase_image` (12.11: `parse-invoice` o'rniga), yuk xati → savatga kirim qoralamasi | 9 | 6 | 4 | **6.3** | Humoyun | T1, T6 | G1 natijasidan keyin |
| T8 | Qarz eslatmasi (Telegram) | 5 | 4 | 6 | 5.0 | — | — | keyin |
| T9 | Chek chop etish (Bluetooth) | 4 | 4 | 4 | 4.0 | — | — | keyin |
| T10 | Ommaviy MCP (mijoz o'z Claude/ChatGPT'si bilan) | 3 | 3 | 6 | 4.0 | — | — | to'xtatilgan |

**Nega T7 eng katta ta'sirga ega, lekin birinchi emas:** pul to'laydigan segment (1C, Zifra, Billz ishlatadiganlar: suhbatlar 5, 7, 8, 12, 15), ulardan uchtasi (5, 7, 8) aynan shu og'riqni aytgan. Lekin u ombor modeli va vision'ga bog'liq, eng og'ir ish. Shuning uchun avval G1 da **qo'lda** sinaymiz: savdogar talabi tasdiqlansa, T7 ning ishonchi 6 dan 8 ga ko'tariladi va u T1 dan keyin darhol boshlanadi.

## 2. HADI gipotezalari (shu hafta, 1-3 ta)

| № | Gipoteza | Harakat | Maqsad (taxmin) | Muddat |
|---|---|---|---|---|
| H1 | Ovozli savdoni ko'rsatsak, 10 savdogardan ≥ 6 tasi 1 hafta sinashga rozi bo'ladi | Telefonda demo, bozorda | ≥ 6/10 rozi | 7 kun |
| H2 | 20 ta haqiqiy spiskani ovozda aytsak, AI sonlar va narxlarning ≥ 95% ini to'g'ri chiqaradi | T1+T2 eval to'plami | ≥ 95% | T2 tugagach 3 kun |
| H3 | 3 ta ilova ishlatadigan savdogarning yuk xatini biz bepul kiritib bersak, ≥ 1 tasi oyiga 200 000 so'm to'lashga rozi bo'ladi | Telegramda surat olamiz, Claude + MCP bilan kiritamiz, vaqtni o'lchaymiz | ≥ 1/3 to'lov roziligi | 7 kun |

Natija har hafta shu jadvalga yoziladi: tasdiqlandi / rad etildi / noaniq va xulosa. Rad etilgan gipoteza ham yoziladi.

## 3. Ishni bo'lish (ikki Claude Code bir-biriga xalal bermasin)

| Kim | Hudud (fayllar) | Tegmaydi |
|---|---|---|
| **Humoyun** (T3, T1, T2, keyin T7) | `supabase/functions/**`, `apps/mobile/src/app/(tabs)/new.tsx`, `apps/mobile/src/features/useVoiceInput.ts`, yangi `apps/mobile/src/features/ai*`, `apps/mobile/eas.json`, `app.json` | `supabase/migrations/**`, `packages/core` hisob funksiyalari (faqat chaqiradi), `review.tsx` dizayni |
| **Abdulloh Claude Code** (`PROMPT-3`: T5, T6, T11) | `supabase/migrations/**`, `packages/core`, `apps/mcp`, `apps/web`, mobil ombor/daftar/katalog ekranlari, `review.tsx` | Humoyun hududi |
| **Arxitektor-Claude** | `docs/**`, ma'lumot kiritish (MCP) | kod |

Ikkalasiga kerak bo'lgan o'zgarish (masalan `DraftContext.tsx` ga AI qatorlarini qo'shish): kichik alohida PR, tavsifida "Humoyun/Abdulloh tasdiqlasin" deb yoziladi.

## 4. Humoyun uchun: qayerdan boshlash

Claude Code'ga bering: [prompts/HUMOYUN-1.md](prompts/HUMOYUN-1.md). Tartib: T3 (APK), T1, T2. Har biri alohida PR.

Siz qiladigan (Claude Code qila olmaydigan) ishlar:
1. Expo akkaunt va `eas login` (EAS build uchun).
2. AI provayder kaliti: **Gemini** (AI Studio, pullik daraja; QARORLAR 13.11.2026). OpenRouter keyin almashtirish uchun tayyor, hozir yoqilmagan. Kalitni chatga yoki repoga yozmang; `supabase secrets set AI_PROVIDER=gemini AI_MODEL=gemini-2.5-flash AI_API_KEY=...` (yoki GitHub Actions «Edge Function deploy») ni o'zingiz terminalda bajaring ([AI-PROVAYDER.md](AI-PROVAYDER.md)).
3. Edge Function deploy: `supabase functions deploy ai-parse` (bitta funksiya: matn, ovoz matni va rasm; [AI-PROVAYDER.md](AI-PROVAYDER.md) 4-bo'lim).

Supabase loyihasida (`kfrnlkwocwpezwgytcmz`) a'zo bo'lmasangiz, 2- va 3-qadamni Abdulloh bajaradi yoki sizni tashkilotga qo'shadi.
