# Hisobchi Go — loyiha holati (Claude AI uchun to'liq hisobot)

Sana: 30.10.2026. Manba: repodagi `main` va `claude/tender-noether-6mfcyg` (ikkalasi bir xil, oxirgi commit `0c9ac96`). Hisobot faqat repoda yozilgan narsaga asoslangan. Topilmagan narsa "topilmadi" deb yozilgan.

## 1. Qisqa xulosa

- **Kod hali yo'q.** Repoda faqat hujjatlar (8 ta `.md`, `.env.example`, `.gitignore`). `apps/`, `packages/`, `supabase/` papkalari yaratilmagan, `package.json` yo'q, test yo'q.
- Hujjatlar bosqichi tugagan: mahsulot g'oyasi, TZ, arxitektura v2, qarorlar jurnali, 15 ta suhbat, muammolar va raqiblar tahlili.
- Navbatdagi ish: MVP ni qurish (TZ bo'yicha "1 kunlik" doira).
- Eng katta xavf: muammolar 15 suhbatda **3 dan ko'p odamdan aniq takrorlanmagan**, "shu uchun pul to'layman" degan dalil deyarli yo'q (faqat Asilbek aka 1C uchun to'laydi). Talab hali isbotlanmagan.

## 2. Mahsulot

**Hisobchi Go** — savdogar spiskasini ovoz yoki rasm orqali tushunib, hisobni kod bilan bajaradigan ilova. Asosiy platforma: Android va iOS; veb versiya kompyuter uchun.

Shior: *AI tushunadi, savdogar tasdiqlaydi, kod hisoblaydi. Xato yozilmaydi, joyida ushlanadi.*

Jamoa "Unikorumlar": Abdulloh Ismoilov, Humoyun Anvarjon. IT Park Andijon inkubatsiyasi (1 oylik dastur), Sardor aka tasdiqlagan.

## 3. Eng muhim qoidalar (CLAUDE.md)

1. AI hech qachon yig'indi hisoblamaydi va bazaga yozmaydi. U faqat matnni (tovar, soni, narxi) tuzilmaga aylantiradi.
2. Hisob sof kodda, ikki mustaqil yo'l bilan. Mos kelmasa to'xtaydi.
3. Savdogar tasdiqlamaguncha hech narsa saqlanmaydi. Noaniq qator sariq.
4. Jurnal faqat qo'shiladi; tuzatish teskari yozuv bilan.
5. Pul butun so'm, suzuvchi nuqta yo'q.
6. Kalit, parol, mijoz telefoni repoga yozilmaydi.

Til: o'zbekcha (lotin). Hisob kodi faqat `packages/core` da. Test namunasi: 10×13 000 + 5×15 000 + 20×9 000 = **385 000**.

## 4. Qabul qilingan texnik qarorlar

| Soha | Qaror |
|---|---|
| Ilova | Expo (React Native) + TypeScript: Android, iOS, veb bitta koddan. Alohida PC ilova yo'q |
| Baza/server | Supabase: Postgres, Auth, Storage, RLS, Edge Functions |
| Veb joylash | `expo export -p web` → Vercel |
| Oflayn | SQLite navbat, **1-bosqichda** (MVP da yo'q) |
| Monorepo | `apps/mobile`, `packages/core`, `supabase/` |
| AI | Claude API, strukturalangan JSON, faqat serverda |
| STT | Aisha / Muxlisa / UzbekVoice, sinov bilan tanlanadi (`SttProvider` interfeysi) |
| Rasm | Claude vision yoki OCR, sinov bilan (`VisionProvider`) |
| Pul/miqdor | pul `bigint` so'm; miqdor `qty_milli` (1 dona = 1000) |
| Yaxlitlash | `line_total = (qty_milli × unit_price + 500) ÷ 1000`, qator bo'yicha |
| Hisob | A yo'li: server TypeScript `BigInt`. B yo'li: Postgres funksiya `calc_document()`. Farq bo'lsa `blocked` |
| Jurnal | `ledger_entries`, UPDATE/DELETE taqiqlangan (rol + trigger). Qoldiq `SUM` dan |
| Maxfiylik | Ovoz/rasm 30 kun saqlanadi, private storage |
| Hujjat holati | `captured → parsed → draft → confirmed → posted` (yoki `blocked`, `reversed`) |

## 5. AI xatosidan himoya (6 to'siq)

1. Sonni AI emas, `parseUzNumber()` o'qiydi; ikkalasi farq qilsa sariq.
2. Narx tarixidan ±25% chetga chiqsa sariq.
3. Tasdiqlash ekrani: manba matni va tushunilgan son yonma-yon, katta shrift.
4. Ixtiyoriy: ovoz bilan qaytarib o'qish.
5. Savdogar aytgan jami bilan kod hisoblagan jami solishtiriladi.
6. Ikki STT bo'lsa, raqamlari farq qilsa sariq.

Sariq qator turlari: tovar topilmadi, bir nechta mos tovar, narx kutilmagan, son ishonchsiz, birlik noaniq, miqdor yo'q. Sariq hal bo'lmaguncha "Tasdiqlayman" ishlamaydi.

Tovar moslash: normallashtirish → aniq moslik (`product_aliases`) → `pg_trgm` top-5 → AI faqat nomzoddan tanlaydi → noaniq bo'lsa savdogar tanlaydi va sinonim saqlanadi.

## 6. MVP doirasi

**Kiradi:** matn va ovoz kiritish, AI bilan qatorlarga ajratish, tasdiqlash ekrani (sariq qatorlar), ikki marta hisob, natija (jami, mijoz, sana), mijoz daftari (append-only). Veb havola (Vercel) va Expo Go.

**Kirmaydi:** rasm/OCR, ombor, kirim agenti, o'rnatish agenti, Telegram/SMS, do'kon build'lari, oflayn navbat.

**Qabul mezonlari (hammasi hali bajarilmagan):**
- [ ] Karim aka namunasi 385 000 chiqadi.
- [ ] Sariq qator tasdiqsiz yozilmaydi.
- [ ] Ikki hisob farq qilsa saqlanmaydi.
- [ ] Tasdiqdan keyin mijoz tarixida ko'rinadi.
- [ ] Ommaviy havola orqali telefondan ochiladi.

Ish taqsimoti (taklif): Abdulloh — mahsulot, namuna ma'lumot, namoyish, savdogar bilan test; Humoyun — Expo ekranlar, deploy; Claude Code — yadro va ekranlar.

## 7. Bosqichlar

| Bosqich | Mazmuni | Holat |
|---|---|---|
| Hujjatlar | TZ, arxitektura, qarorlar, tadqiqot | **Tugagan** |
| MVP | yuqoridagi bitta oqim | **Boshlanmagan** |
| 1 | Auth + rollar + RLS, tovar bazasi, narx tarixi, nasiya/to'lov, oflayn navbat, Android APK | Rejada |
| 2 | Rasm, shtrix skaner, Bluetooth chop etish, CSV, kun oxiri tekshiruvi, Google Play | Rejada |
| 3 | Telegram/SMS xabar, PDF oldi-berdi, o'rnatish agenti, App Store | Rejada |

## 8. Bozor va mijoz dalillari

**15 suhbat** (26–27.10, yoshlar 17–43, median 30). Asosiy nisha: ulgurji/optom va "dasturi bor, lekin kirim qo'lda" segmentlari (№1, 4, 8, 9 va 5, 7, 11, 12, 15).

**Eng kuchli muammolar** (T·O·P ballari taxmin, tasdiqlanmagan):
1. Ko'p tovarni qo'lda kiritish (2 suhbat) — 12
2. Kalkulyator xatosi → kamomad (1 suhbat) — 12
3. Baza ≠ haqiqiy qoldiq (1 suhbat) — 11
4. Dasturlar murakkab/qimmat (3–6 suhbat, aniq voqeasiz) — 11
5. Savatchaga bittalab terish (1 suhbat) — 10

**Raqiblar:** "hech kimda yo'q" deb bo'lmaydi. **pDaftar** (ovozli kiritish AI orqali, nakladnoyni rasmdan o'qish) va **Linko** (yuk xatini rasmdan o'qiydi) g'oyaning bir qismini qiladi. Billz, Sales Doctor, Smartup uchun AI funksiyasi topilmadi (yo'q degani emas). Pitchda "birinchimiz" deyilmaydi; farq: ulgurji spiskaga moslashgan va hisobi kod bilan ikki marta tekshiriladi. Narx farazi 200 000 so'm/oy bozor oralig'ining o'rtasida, narx bilan ajralib bo'lmaydi.

**Dalil sifati haqida ogohlik:** raqib narxlari asosan MoySklad va Billz bloglaridan (manfaatdor manba); internetdagi maqolalar (M11–M15) faqat sarlavhasi bo'yicha, o'qilmagan; T1–T6 faqat taxmin.

## 9. Ochiq masalalar

**Qarorlar jurnalidagi ochiq:**
- Baza: Supabase yoki boshqa. (Arxitekturada Supabase [QAROR] deyilgan, jurnalda esa hali ochiq. Bu nomuvofiqlikni hal qilish kerak.)
- STT/OCR provayderi (100 ta sinov spiskasi bilan).
- Narx modeli: 1-oy bepul, keyin ~200 000 so'm/oy — faraz.
- **Prototip kodi egaligi: Humoyun bilan yozma kelishuv kerak.**

**Arxitekturadagi:** kirish usuli (telefon OTP yoki email); Supabase tarifida kunlik zaxira; ±25% chegarasi; Bluetooth printer modeli; Google Play/Apple hisob narxi va egasi; PC versiyada qaysi ekranlar moslanadi.

**Tadqiqot qarzlari:** pDaftar va Linko'ni o'zimiz sinash (eng muhim); raqib narxlarini rasmiy saytdan tekshirish; Billz'da AI bormi; Zifra, Calnot, Adinex haqida ma'lumot; internet maqolalarini to'liq o'qish; 50 suhbat o'tkazish (Sardor akaning 5 savoli bo'yicha); Aslbek aka (10) va Asilbek aka (8) bitta odammi.

**Aniqlik maqsadlari (taxmin):** son ≥95%, tovar moslash ≥90%, jimgina xato ≤1%, sariq ulushi ≤25%. 100 ta sinov spiskasi (30 ovoz, 30 rasm, 40 matn) hali yig'ilmagan.

## 10. Xavflar va kuzatuvlar

1. **Talab isbotlanmagan.** 50 suhbat kerak; hozircha pul to'lash niyati dalili yo'q.
2. **"Ikki mustaqil yo'l" mustaqilligi cheklangan:** A (TS) va B (SQL) ni bir jamoa bir xil qoida bo'yicha yozadi. Ular dasturlash xatosini ushlaydi, lekin spetsifikatsiya xatosini (masalan yaxlitlash qoidasi noto'g'ri) emas. Testlar shu sababli muhim.
3. **MVP da B yo'li (Postgres) uchun Supabase kerak,** TZ esa "Supabase yoki shunga o'xshash" deydi; MVP uchun baza tanlovi tezda yopilishi kerak.
4. **Kalit xavfsizligi:** `.env.example` da `ANTHROPIC_API_KEY`, `SUPABASE_*`, `STT_*` bor; qiymatlar bo'sh, `.gitignore` `.env` ni yopadi. Yaxshi.
5. **Xarajat o'lchanmagan:** faqat Aisha ~425 so'm/daqiqa (tekshirilmagan). AI va rasm narxi noma'lum.
6. **Mulk/huquq:** prototip kodi egaligi bo'yicha yozma kelishuv yo'q.

## 11. Keyingi qadamlar (tavsiya)

1. Supabase tanlovini jurnalda yopish va egalik kelishuvini rasmiylashtirish.
2. `packages/core` ni yozish **birinchi**: `parseUzNumber`, `calc` (BigInt), yaxlitlash, testlar (385 000 va chegara holatlari). AI va UI dan oldin.
3. `supabase/migrations`: jadvallar, `calc_document()`, append-only trigger.
4. Edge Function `parse-capture` (Claude → JSON), keyin Expo ekranlar: kiritish → tasdiqlash → natija → daftar.
5. Vercel'ga veb deploy, Expo Go bilan telefonda tekshirish.
6. Parallel: pDaftar/Linko sinovi va suhbatlarni davom ettirish.

## 12. Hujjat xaritasi

| Fayl | Mazmuni |
|---|---|
| `README.md` | Qisqa tavsif, holat |
| `CLAUDE.md` | Claude Code qoidalari |
| `docs/TZ-MVP.md` | MVP vazifasi, qabul mezonlari, 3 daqiqalik namoyish |
| `docs/ARXITEKTURA.md` | v2 arxitektura: model, jurnal, himoya, oflayn, xavfsizlik |
| `docs/QARORLAR.md` | Qarorlar jurnali (28.10.2026) |
| `docs/MUAMMOLAR.md` | M1–M15 muammolar, T1–T6 taxminlar |
| `docs/SUHBATLAR.md` | 15 suhbat, segmentlar, takliflar |
| `docs/RAQIBLAR.md` | Raqiblar xaritasi, top 10 |
| `.env.example` | Sozlama nomlari (qiymatsiz) |

## Git tarixi

```
0c9ac96 Mobil-birinchi: Expo stack, monorepo, oflayn 1-bosqichga, mobil imkoniyatlar
ab4ce21 Arxitektura v2: ma'lumotlar modeli, nasiya jurnali, AI xato himoyasi, moslash, oflayn, xavfsizlik, sinov to'plami
166f22e Hujjatlar: TZ, arxitektura, muammolar, suhbatlar, raqiblar, qarorlar, CLAUDE.md, .env.example
59fb92d Initial commit: README va .gitignore
```
