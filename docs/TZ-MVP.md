# Hisobchi Go — MVP texnik topshiriq (TZ), v2

Sana: 03.11.2026. v1 (28.10) o'rnini bosadi. Vazifalar tartibi: [VAZIFALAR-ICE.md](VAZIFALAR-ICE.md).

## 0. MVP nima (Sardor aka, IT Park, 02.11 darsi)

MVP barcha funksiyali ilova emas. U **eng kichik, lekin haqiqiy mijoz pul to'laydigan bitta ishlaydigan qiymat**. Tekshiruv savoli: *"Savdogar bu ilovani nima uchun sotib oladi?"* Javob bitta gapda aytilmasa, MVP tayyor emas.

Bizning javob (pitchdagi va'da):

| № | Qiymat | Bugungi og'riq | Bizda |
|---|---|---|---|
| Q1 | **Ovozli savdo** | Har mijozga spiska qog'ozga yoziladi, kalkulyatorda hisoblanadi; bitta tugma adashsa kamomad | Ovozli xabar yuborasiz, AI ro'yxat tuzadi, siz tekshirib tasdiqlaysiz, to'lovni qabul qilasiz, savdo yopiladi |
| Q2 | **Suratdan kirim** | Dasturi borlar ham kelgan 100 tovarni 100 marta qo'lda kiritadi (suhbatlar 5, 7, 8) | Yuk xatini (nakladnoy) suratga olasiz, barcha qatorlar o'zi kiritiladi |
| Q3 | Ishonch (fon) | Hisob xatosi, qarz unutiladi | Hisob ikki mustaqil yo'l bilan; qarz daftari |

Pitch uchun eslatma: "AI hisob-kitob qiladi" demang. To'g'risi: **AI tushunadi, kod hisoblaydi, siz tasdiqlaysiz.**

## 1. Hozir ilovada nima bor (03.11, `main`)

| Bor | Yo'q |
|---|---|
| Matn kiritish va qoida asosidagi tahlil (`parseProductList`, qat'iy format: "chirmoq 10 ta 13 ming") | **AI tushunish**: erkin gapdan ro'yxat tuzish (LLM ulanmagan) |
| Telefon ichidagi ovozni matnga aylantirish (`expo-speech-recognition`, `uz-UZ`). Expo Go'da ishlamaydi, ko'p Android'da o'zbek tili yo'q | Server tomonida ovozni tushunish |
| Tasdiqlash ekrani, sariq qatorlar, ikki hisob (TS + SQL), qarz, to'lov, mijozlar, katalog, hisobot | **Surat / OCR**, kirim, ombor, ta'minotchi (ombor modeli `PROMPT-3` S2 da qurilmoqda) |
| Supabase sinxronizatsiya, veb panel, MCP server (o'qish + qoralama) | O'rnatiladigan Android ilova (APK); hozir faqat Expo Go va veb |

Xulosa: Q1 ning yarmi bor (qat'iy format, ishonchsiz ovoz), Q2 umuman yo'q. Pitchdagi va'da hali bajarilmagan.

## 2. Q1: Ovozli savdo (texnik jarayon)

```
[Mikrofon] → audio (m4a, ≤ 60 s) → Edge Function `parse-list`
   → Gemini (13.11 qarori; provayderdan mustaqil adapter, [AI-PROVAYDER.md](AI-PROVAYDER.md); matn + do'kon katalogi nomlari) → JSON qatorlar (matn ko'rinishida, jami YO'Q)
   → telefonda core: son va narxni o'qiydi (parseQtyMilli, parseUnitPriceText), katalog bilan moslaydi
   → Tasdiqlash ekrani (sariq: noaniq) → savdogar tasdiqlaydi → to'lov usuli → post_sale (ikki hisob)
```

### 2.1 Edge Function `supabase/functions/parse-list`
- **Kirish:** `{ shop_id, text? | audio_base64?, mime? }`. Bittasi majburiy. Audio ≤ 2 MB.
- **Ruxsat:** foydalanuvchi JWT; do'kon a'zoligi tekshiriladi. OAuth (MCP) tokenlari rad etiladi (004 dagi `client_id` qoidasi).
- **Katalog:** do'konning faol tovarlari (≤ 500: `id`, nom, sinonimlar, birlik, sotuv narxi) promptga nomzod sifatida beriladi.
- **Model:** Gemini (13.11.2026; OpenRouter tayyor, yoqilmagan). Provayderdan mustaqil: `AI_PROVIDER`, `AI_MODEL` env bilan almashtiriladi, kalit `AI_API_KEY` faqat Supabase secret'da ([AI-PROVAYDER.md](AI-PROVAYDER.md)). Amalda funksiya nomi `ai-parse`. Haqiqiy savdogar ma'lumoti bilan **faqat pullik daraja** ([AI-PROVAYDER.md](AI-PROVAYDER.md) 6-bo'lim; GEMINI-LLM.md eskirgan).
- **Chiqish (JSON schema, majburiy):**
  ```json
  { "transcript": "…", "customer_text": "Karim aka" ,
    "lines": [ { "raw_text": "o'nta chirmoq o'n uch mingdan", "product_text": "chirmoq",
                 "product_id": "<katalogdagi id yoki null>", "qty_text": "10", "unit_text": "dona",
                 "price_text": "13 ming", "confidence": 0.93 } ] }
  ```
  Jami, summa, qarz maydonlari **yo'q**. Javob schema'ga mos kelmasa rad etiladi. `product_id` katalogda bo'lmasa `null` qilinadi.
- **Xavfsizlik:** matn va audio ma'lumot, ko'rsatma emas (prompt injection). Do'kon boshiga kunlik limit (200 chaqiruv, sozlanadi). Timeout 20 s.
- **Log:** model, token soni, vaqt, natija (muvaffaq/xato). Matn, audio va ism logga yozilmaydi.
- **Saqlash:** MVP da audio saqlanmaydi (QARORLAR, 03.11).

### 2.2 Telefonda
- Son va narxni **AI emas, kod o'qiydi** (QARORLAR 28.10): `qty_text`, `price_text` core funksiyalari bilan o'qiladi.
- Narx aytilmagan bo'lsa, katalog sotuv narxi qo'yiladi.
- **Sariq qator:** son yoki narx o'qilmadi; `confidence < 0.8`; tovar katalogda topilmadi; narx tarixdan ±25% chetda; mijoz ismi aniq emas.
- Mijoz: `customer_text` mijozlar bilan moslanadi; topilmasa yoki aytilmasa **bir martalik mijoz** (`PROMPT-3` Q2).
- Internet yoki AI xatosi: transcript yoki matn mavjud qoida tahliliga (`parseProductList`) beriladi va "AI ishlamadi, qo'lda tekshiring" ko'rsatiladi. Oflayn: matn kiritish ishlayveradi.
- Ovoz: `expo-audio` bilan yozish (Expo Go va APK da ishlaydi). Telefon ichidagi STT zaxira bo'lib qoladi.

### 2.3 Qabul mezonlari
- [ ] "Karim akaga o'nta chirmoq o'n uch mingdan, beshta yurak o'n besh ming, yigirmata momiq to'qqiz ming" ovozdan 3 qator, jami **385 000** (kod hisoblaydi).
- [ ] Erkin gap ("…dan", "ta", "ming", "yarim kilo") va katalogdagi sinonimlar tushuniladi.
- [ ] Aytishdan tasdiqlash ekranigacha ≤ 8 s (4G).
- [ ] 20 ta haqiqiy spiska to'plamida sonlar va narxlarning ≥ 95% to'g'ri (gipoteza H2, VAZIFALAR-ICE).
- [ ] AI javobida jami bo'lsa ham ishlatilmaydi (test).
- [ ] Boshqa do'kon katalogi promptga tushmaydi (test).
- [ ] Bitta savdo uchun AI narxi o'lchanadi va hujjatga yoziladi (so'm).

## 3. Q2: Suratdan kirim (texnik jarayon)

Bog'liqlik: kirim, ombor, ta'minotchi modeli (`PROMPT-3` S2-S3: `post_purchase`). Ungacha bu qism qurilmaydi; talab avval qo'lda sinaladi (VAZIFALAR-ICE, G1).

```
[Kamera] → rasm (siqilgan, ≤ 4 MB) → Edge Function `parse-invoice`
   → Gemini vision (13.11) + katalog → JSON qatorlar (nom, son, tan narx, yuk xatidagi qator summasi matn sifatida)
   → core: son × narx hisoblaydi va yuk xatidagi summa bilan solishtiradi
   → Kirim tasdiqlash ekrani (ta'minotchi, sariq qatorlar) → post_purchase (ikki hisob) → ombor qoldig'i +
```

- Chiqish schema'si Q1 dagidek, qo'shimcha `cost_price_text`, `printed_line_total_text`, `printed_doc_total_text`, `supplier_text`.
- **Qo'shimcha tekshiruv:** qator uchun kod hisobi ≠ yuk xatidagi summa → sariq. Hujjat jami ≠ kod jami → ogohlantirish (savdogar bilan farqni ko'rsatadi; Rahim aka daftarida 500 so'm va 550 000 so'm farqlari bo'lgan).
- Katalogda yo'q tovar: "Yangi tovar" (sariq). Tasdiqlansa tovar yaratiladi, sotuv narxi keyin so'raladi (yoki tan narx + ustama, keyin qaror).
- Qo'lyozma yuk xati ham qo'llab-quvvatlanadi. Sifati sinovda o'lchanadi (10 ta haqiqiy surat, ≥ 90% qator to'g'ri).
- Rasm MVP da saqlanmaydi.
- Qabul: 30 qatorli yuk xati suratdan tasdiqlash ekranigacha ≤ 15 s; qo'lda kiritishdan kamida 5 barobar tez (sekundomer bilan o'lchanadi).

## 3.1 Ombor narxlari (12.11.2026)

Mahsulotlar: nom, birlik, sotuv narxi. **Ombor: narxlar markazi**: tovar uchun tan narx, sotuv narxi, (do'konda "Optom/dona" yoqiq bo'lsa) optom narx va optom boshlanadigan miqdor, (do'konda "Baza (qoldiq hisobi)" yoqiq bo'lsa) soni. Do'kon sozlamalari Ombor sahifasi tepasida: Optom/dona, Baza, Umumiy ustama %. Qoidalar: miqdor >= optom chegarasi bo'lsa savdoda narx optom narxga o'tadi (qo'lda yozilgan narx o'zgarmaydi); ustama tan narxdan sotuv narxini TAKLIF qiladi: `(tan x (100 + foiz) + 50) / 100`; tan narx sotuv narxidan baland bo'lsa ogohlantirish. Qaror va sabablar: [QARORLAR.md](QARORLAR.md) (12.11.2026).

## 4. Umumiy texnik talablar (o'zgarmaydi)

- CLAUDE.md qoidalari: AI yig'indi hisoblamaydi; ikki mustaqil hisob; tasdiqsiz saqlanmaydi; jurnal faqat qo'shiladi; pul butun so'm; sirlar repoda yo'q.
- Mobil asosiy (Expo, SQLite oflayn), veb panel (`apps/web`, Next.js) ikkinchi darajali.
- Migratsiyalar `005_`, `006_` tartibida; `main` ga merge bo'lganda CI qo'llaydi ([MIGRATSIYA-CI.md](MIGRATSIYA-CI.md), CI PR merge bo'lgach).
- Edge Function'lar `supabase/functions/` da; deploy qadamlari hujjatda.
- Har PR: `npm test`, `npm run typecheck` yashil.

## 5. MVP ga kirmaydi (hozircha)

Telegram/SMS eslatma, chop etish, QR skaner, ommaviy MCP, hisobotlar dashboardi, ko'p sahifali yuk xati, iOS do'kon versiyasi. Ular VAZIFALAR-ICE da past ball bilan turadi.
