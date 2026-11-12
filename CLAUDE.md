# Hisobchi Go — Claude Code uchun ko'rsatma

Savdogar spiskasini ovoz/rasm orqali tushunib, kod bilan hisoblaydigan ilova. Jamoa: Abdulloh Ismoilov, Humoyun Anvarjon. Til: o'zbekcha (lotin), qisqa javoblar.

## Eng muhim qoidalar

1. **AI hech qachon yig'indi hisoblamaydi va bazaga yozmaydi.** AI faqat matnni tuzilmaga (tovar, soni, narxi) aylantiradi.
2. Hisob sof kodda, **ikki mustaqil yo'l** bilan. Mos kelmasa to'xtaydi va xato ko'rsatadi.
3. Savdogar tasdiqlamaguncha hech narsa saqlanmaydi. Noaniq qatorlar sariq.
4. Jurnal faqat qo'shiladi (append-only). Tuzatish teskari yozuv bilan.
5. Pul summalari butun son (so'm), suzuvchi nuqta ishlatilmaydi.
6. Kalitlar, parollar, mijoz telefon raqamlari repoga yozilmaydi. `.env` gitignore da.

## Stack

Expo (React Native) + TypeScript, Supabase (Postgres, Edge Functions), monorepo: `apps/mobile` (asosiy), `apps/web` (Next.js panel), `apps/mcp`, `packages/core`, `supabase/`. Hisob kodi faqat `packages/core` da (SQL ikkinchi yo'l `supabase/migrations` da).

## MVP tamoyili

MVP: savdogar pul to'laydigan **bitta to'liq ishlaydigan** qiymat, o'nta yarimta funksiya emas. Har yangi ish oldidan savol: "Bu savdogarni pul to'lashga yaqinlashtiradimi?" Navbat: [docs/VAZIFALAR-ICE.md](docs/VAZIFALAR-ICE.md).

## Ish uslubi: "Boil the Ocean" (ijro bosqichida) va vazifani oxirigacha tugatish

**Chegara:** bu qoida faqat berilgan vazifa (yoki tasdiqlangan reja) **ichida** ishlaydi. U yuqoridagi "Eng muhim qoidalar"ni, "MVP tamoyili"ni va tasdiq bosqichlarini bekor qilmaydi: reja tasdig'i so'ralgan bo'lsa, tasdiqsiz ijroga o'tma; `main` ga o'zing merge qilma; migratsiyani production'ga o'zing qo'llama; sirlarni so'rama. "Hammasini qil" degani vazifa **chegarasini kengaytirish** emas: berilgan ishni to'liq qil, unga kirmagan yangi funksiya qo'shma.

Remember when implementing: The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that I am genuinely impressed, not politely satisfied, actually impressed.

Never offer to "table this for later" when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard isn't "good enough", it's "holy shit, that's done." Search before building. Test before shipping. Ship the complete thing.

When I ask for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

### Tugatish qoidasi (shu loyiha uchun)
1. **Bosqichli vazifada to'xtama.** Promptda S1, S2, S3... bo'lsa, S1 tugagach "keyingi qadam" deb to'xtab hisobot yozma: keyingi bosqichga darhol o't. Bosqichlar tartibi va bog'liqligi vazifada yozilgan.
2. **To'xtash faqat shu hollarda:** (a) asoschi qarori yoki sir (kalit, parol) kerak; (b) keyingi bosqich hali qo'llanmagan migratsiyaga haqiqatan tayanadi va uni sensiz sinab bo'lmaydi; (c) qoida yoki qarorga zid ish chiqdi; (d) seans limiti tugayapti. Boshqa sabab (charchoq, murakkablik, "keyinroq") yo'q.
3. **Ochiq savol to'xtatmasin:** mantiqiy default tanla, tanlovni PR tavsifida va `docs/QARORLAR.md` da yoz, ishni davom ettir. Qaytarib bo'lmaydigan va ikki xil bo'lishi mumkin bo'lgan qaror bo'lsa, tayyorgarlikni tugat, qarorni yoz va faqat o'sha joyda to'xta.
4. **"Tayyor" degani:** kod yozilgan; `npm test` va `npm run typecheck` yashil; yangi mantiq uchun test bor (xatoni ushlashini tekshir); hujjat yangilangan; PR ochilgan; tavsifida nima o'zgargani, nima sinalmagani yozilgan. Haqiqiy Supabase, brauzer yoki telefonda sinalmagan narsani "ishlaydi" dema: "sinalmagan" deb yoz.
5. **Seans tugashi mumkin bo'lsa:** `docs/HOLAT-3.md` (yoki shu vazifaning holat fayli) ga nima tayyor, nima qoldi, keyingi aniq qadamni yoz va commit/push qil. Keyingi seans `git status`, `git log` va shu fayldan davom etadi.
6. **Yakuniy hisobotda** faqat haqiqatni yoz: tayyor bosqichlar, boshlanmagan bosqichlar va sababi. Chala ishni tugagan dema.

## TIL-QOIDASI (MUHIM)
Foydalanuvchiga (Abdullohga) barcha javoblar, hisobotlar va tushuntirishlar FAQAT O'ZBEK TILIDA berilishi SHART. Kod, kod-izohlar, o'zgaruvchi-nomlari va texnik atamalar bundan mustasno, ular original tilida qoladi.

## Tekshiruv: tanqidchi va ECC
- ECC plagini yoqilgan (`.claude/settings.json`). Reja uchun `/ecc:plan`, kod ko'rigi uchun `/ecc:code-review`, xavfsizlik uchun `/ecc:security-scan`. Slash-buyruq yuklanmasa, buyruq mazmunini o'qib qo'lda bajar.
- **Har bir vazifa, "tayyor" deyishdan OLDIN, `tanqidchi` subagenti orqali tekshiriladi.** FAIL bo'lsa: tuzat, qayta tekshir, PASS bo'lguncha. PASS bo'lmasdan PR "tayyor" deb belgilanmaydi.
- ECC/tanqidchi qoidalari yuqoridagi "Eng muhim qoidalar", "MVP tamoyili" va tasdiq bosqichlarini bekor qilmaydi.

## Hujjatlar

- [docs/ASOSCHI-TALABLARI.md](docs/ASOSCHI-TALABLARI.md) — asoschi maqsadi va ilovaga asosiy talablar
- [docs/HUMOYUN-BACKEND.md](docs/HUMOYUN-BACKEND.md) — backend maqsadli arxitekturasi va audit topshirig'i (Humoyun)
- [docs/TZ-MVP.md](docs/TZ-MVP.md) — MVP vazifasi (v2: ovozli savdo, suratdan kirim)
- [docs/VAZIFALAR-ICE.md](docs/VAZIFALAR-ICE.md) — vazifalar navbati, ish bo'linishi (kim qaysi fayllarda ishlaydi)
- [docs/ARXITEKTURA.md](docs/ARXITEKTURA.md) — tuzilma
- [docs/QARORLAR.md](docs/QARORLAR.md) — qarorlar jurnali
- [docs/MIGRATSIYA-CI.md](docs/MIGRATSIYA-CI.md) — migratsiyalar `main` ga merge bo'lganda CI orqali qo'llanadi; yangi fayl `005_nom.sql` shaklida
- [docs/MCP-AGENT.md](docs/MCP-AGENT.md) — MCP server (`apps/mcp`): faqat o'qish + qoralama, tasdiqlash faqat ilovada
- [docs/MUAMMOLAR.md](docs/MUAMMOLAR.md), [docs/SUHBATLAR.md](docs/SUHBATLAR.md), [docs/RAQIBLAR.md](docs/RAQIBLAR.md) — dalillar

## Ish tartibi

- O'zgarishdan oldin TZ, VAZIFALAR-ICE va qarorlarni o'qi; qarorga zid ish qilmaydigan bo'l.
- Ikki Claude Code parallel ishlaydi: faqat o'z hududingdagi fayllarni o'zgartir (VAZIFALAR-ICE, 3-bo'lim). `main` ga o'zing merge qilma.
- `docs/arxiv/` dagi hujjatlar eskirgan: ularga tayanma.
- Hisob modulini har o'zgarishda testlar bilan tekshir (namuna: 10×13 000 + 5×15 000 + 20×9 000 = 385 000).
- Faktni to'qima: topilmasa "topilmadi" deb yoz.
- Kichik commitlar, tushunarli xabarlar.
