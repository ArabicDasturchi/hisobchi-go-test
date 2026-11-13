# F1 hisoboti: ro'yxatni joylab savdo/kirim kiritish

Sana: 12.11.2026. Branch: `feat/f1-ruyxat-joylash` (`origin/main` @ `14c0462` dan). Topshiriq: `HUMOYUN-FUNKSIYALAR.md` F1.
Holat: **kod va testlar tayyor, lokal**. Commit, push va PR qilinmagan (topshiriq bo'yicha, avval hisobot). Migratsiya yo'q. Production Supabase'ga ulanilmagan.

## 1. Asoschining xatosi: sababi

**Belgi:** boshqaruv panelida Savdo yoki Kirim tanlanib, 10 qatorli ro'yxat joylanganda takliflar chiqmagan, yuborilganda xato chiqqan.

**Sabab:** `apps/web/src/components/sale/SaleComposer.tsx` (o'zgarishdan oldin, 88–89-qatorlar):

```tsx
maxLength={120}
onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
```

1. Brauzer joylangan matnni `maxLength` bo'yicha **120 belgida kesadi**.
2. Yangi qatorlar bo'shliqqa almashadi: butun ro'yxat **bitta qidiruv so'zi** bo'lib qoladi.
3. Bu so'zga katalogda hech narsa mos kelmaydi, shuning uchun takliflar chiqmaydi (#54 dan keyin panelda faqat «yangi tovar sifatida» qatori turadi).
4. Enter yoki strelka bosilganda `addNew(query)` ishlaydi: nomi 120 belgili matn, soni 1, narxsiz **bitta** «yangi tovar» qatori paydo bo'ladi. Savdoda u sariq qoladi, Tasdiqlash yopiq. Kirimda birlik tanlanmagan bo'ladi va kirim xato beradi.
5. Ro'yxatni ajratadigan kod umuman yo'q edi: `packages/core/src/parse-list.ts` bor, lekin `apps/web` uni hech qayerda ishlatmasdi.

**Qayta chiqarish (tuzatishdan oldin, jsdom + `@testing-library/user-event`, vaqtinchalik test):**

```
LIST uzunligi: 164 qator: 10
textarea qiymati uzunligi: 120
textarea qiymati: "Chirmoq 10x13 000 Yurak 5x15 000 Momiq 20x9 000 Joynamoz Turk 3x13000 Joynamoz Eron 2x15000 Tasbeh 10x5000 Qur'on 1x4500"
```

8–10-qatorlar yo'qolgan, «Qur'on 1x45000» esa «1x4500» bo'lib qolgan, ya'ni narx jimgina 10 baravar kamaygan. Shu xato endi `apps/web/__tests__/panel-paste.test.tsx` da regressiya testi sifatida turibdi. Tuzatishdan oldingi holat haqiqiy brauzerda alohida sinalmadi. Xato jsdom testi va kod bilan tasdiqlangan.

**#53/#54 bilan aloqasi:** #53 takliflar panelini butunlay olib tashlagan, #54 uni «faqat nom yozilganda» shartida qaytargan. Ularning hech biri asl sababga tegmagan (kesish va bitta qatorga aylantirish). Endi joylangan ro'yxat qidiruv oynasiga umuman yozilmaydi, shuning uchun takliflar paneli ochilmaydi (testda tekshirilgan: `listbox` yo'q). #54 xatti-harakati o'zgarmagan.

## 2. Nima qilindi

| # | Talab | Qanday |
|---|---|---|
| 1 | Ko'p qatorli matnni joylash | `SaleComposer`: `onPaste` hodisasi (clipboard `text/plain`) va zaxira yo'l (ba'zi telefon klaviaturalari paste hodisasisiz yangi qatorli matn kiritadi). `maxLength` olib tashlandi, bitta qatorli yozuv chegarasi (120) kodda saqlandi. Bitta qatorli joylash avvalgidek qidiruvga ketadi |
| 2 | Har qator — alohida mahsulot | `core` `parsePastedList`: faqat yangi qator bo'yicha bo'linadi (`\n`, `\r\n`, `\r`); bo'sh qatorlar tashlanadi; `1.`, `2)`, `-`, `•` belgilari olinadi; asl qator raqami va matni saqlanadi |
| 3 | Shakllar | `3 ta non 4000 so'mdan`, `Chirmoq 13x15.000`, `13x15000`, `13 x 15 000`, `13×15000`, `13*15000`, Kirill `13х15000`, `2,5x12000`, `10x13 ming`, `Chirmoq 13` (savdo: nomi + soni, narx katalogdan) |
| 4 | Birlik va narx so'zlari | Mavjud core qoidalari: `ta`, `dona`, `kg`, `litr`... (miqdor), `so'm`, `so'mdan`, `ming`, `mln` (narx). Narxda `15.000` = `15 000` = `15000` (yangi qaror). Miqdorda `1.500` noaniq, avvalgidek rad etiladi |
| 5 | Katalog bilan solishtirish | `apps/web/src/lib/pasteList.ts` `matchCatalog`: mavjud `looseKey` (Kirill → Lotin, kichik harf, apostrof turlari, ortiqcha bo'shliq). Arxivdagi tovar hisobga olinmaydi |
| 6 | Bitta aniq moslik | Tovar id, katalog nomi va birligi bilan bog'lanadi. Narx ro'yxatdan, yozilmagan bo'lsa katalogdan (kirimda oxirgi kirim narxi) |
| 7 | Bir nechta moslik | Egizak nomlar (masalan, bir xil nom ikki birlikda) yoki o'xshash nomlar: variant tugmalari (nomi · birligi · narxi). Ro'yxatda birlik yozilgan bo'lsa, egizaklar birlik bo'yicha ajratiladi |
| 8 | Moslik yo'q | «Yangi tovar sifatida qo'shish» tugmasi. Bir bosish shart: imlo xatosi jimgina yangi tovarga aylanmasin |
| 9 | Holat | Har kartada belgi: **Aniq** (yashil) / **Noaniq** (sariq) / **Xato** (qizil) + sabab matni + asl qator («3-qator: «...»») |
| 10 | Tasdiqlash qulfi | Hal qilinmagan qator `lineStatus` da sariq, shuning uchun `SaleSummaryBar` Tasdiqlashni yopadi. Ikkinchi himoya: `buildSalePlan` / `buildPurchasePlan` ham rad etadi. Kirimda `PurchaseView` qulfi |
| 11 | TS ↔ SQL jami | Yangi formula yo'q. Qator jami core `calculateLineTotal` (`buildSalePlan`), server `post_sale` / `post_purchase` qayta hisoblab `p_client_total` bilan solishtiradi, mos kelmasa `calc_mismatch` va hech narsa saqlanmaydi (mavjud, o'zgarmagan) |

Qo'shimcha:
- Joylashdan keyin xabar chiqadi: «Ro'yxatdan 10 ta qator qo'shildi: 6 ta aniq, 4 ta tekshirish kerak».
- Bo'sh panelda ro'yxat joylash mumkinligi haqida yo'riq bor.
- «+» menyusidagi «Ro'yxat yopishtirish — Tez orada» olib tashlandi (endi ishlaydi).
- Tahlilchi ogohlantirishlari «To'g'ri» tugmasi bilan yoki **o'sha maydonni** tahrirlash bilan yechiladi. Ular: `10 130` kabi bo'shliqli son, belgisiz ikki son, birlik farqi, `Plitka 30x60` (narx 60 so'm — o'lcham emasmi?), nomga qo'shilgan son (`Atir, 50 ml 2x20000`). Masalan, narx tahrirlansa soni haqidagi savol qoladi. Nom tahrirlansa hamma savol yechiladi. Soni yoki narx tahrirlansa «xato» yechiladi, variant tanlash esa qoladi.
- Nomdagi son bo'lagi saqlanadi: `Un 1-nav 2x50000` → nom «Un 1-nav». Qator oxiridagi nuqta olib tashlanadi (`Yurak 5x15.000.`). Yopishgan `3ta×4000` ham tushuniladi. Ishlatilmay qolgan `x` (`2x3x4`) jim yutilmaydi, xato bo'ladi.

## 3. O'zgartirilgan fayllar

> **Hudud eslatmasi:** `packages/core` va `apps/web` `docs/VAZIFALAR-ICE.md` 3-bo'limiga ko'ra **Abdulloh hududi**. F1 shu fayllarga tegmasdan bajarilmaydi. PR tavsifida «Humoyun/Abdulloh tasdiqlasin» yozilishi kerak. `docs/ISH-SHARTNOMASI.md` bo'yicha `packages/core` o'zgarishi (pul hisobi moduli paketi) asoschi tasdig'isiz merge qilinmaydi. Hisob formulasi o'zgarmagan, faqat matn tahlili o'zgargan.

| Fayl | O'zgarish |
|---|---|
| `packages/core/src/parse-list.ts` | `x`/`×` belgisi, narxdagi nuqtali ming, nomdagi son bo'lagi, `SPACED_QTY`, yangi `parsePastedList`, `isMultiLineList` |
| `packages/core/src/index.ts` | yangi eksportlar |
| `packages/core/__tests__/parse-list.test.ts` | ikki eski test yangi qarorga moslandi (`13.000` narxda endi 13000; miqdorda `1.500` rad etilishi qo'shildi) |
| `packages/core/__tests__/parse-pasted-list.test.ts` | **yangi**, 41 test |
| `apps/web/src/lib/pasteList.ts` | **yangi**: katalog moslash, qator savollari, hal qilish funksiyalari |
| `apps/web/src/components/sale/ReviewActions.tsx` | **yangi**: holat belgisi va hal qilish tugmalari (savdo va kirim uchun umumiy) |
| `apps/web/src/components/sale/SaleComposer.tsx` | paste ushlash, `maxLength` o'rniga kodda 120 |
| `apps/web/src/components/sale/SaleLineCard.tsx` | belgi, savol va tugmalar; xato/tekshirish qatorida narx tahriri |
| `apps/web/src/components/panel/PurchaseView.tsx` | belgi, savol va tugmalar; hal qilinmagan qator tasdiqni yopadi |
| `apps/web/src/components/panel/PanelWorkspace.tsx` | `pasteList` oqimi, hal qilish handlerlari, bo'sh paneldagi yo'riq |
| `apps/web/src/lib/saleForm.ts`, `purchaseForm.ts` | `pasted`, `reviews` maydonlari; rejada ikkinchi himoya |
| `apps/web/src/lib/lineStatus.ts` | `review` sababi |
| `apps/web/src/lib/panelState.ts` | «Tez orada» ro'yxatidan «Ro'yxat yopishtirish» olindi |
| `apps/web/__tests__/paste-list.test.ts` | **yangi**, 24 test |
| `apps/web/__tests__/panel-paste.test.tsx` | **yangi**, 10 test (jsdom integratsiya: PanelWorkspace, savdo, kirim, to'lov amalida joylash ro'yxat bo'lmasligi) |
| `docs/QARORLAR.md` | 2 qator: F1 oqimi, narxda nuqta qarori |

`apps/mobile`, `apps/admin`, `apps/mcp`, `supabase/migrations` ga tegilmagan.

## 4. Testlar va haqiqiy natijalar (lokal, Node 24.12.0, Windows)

| Tekshiruv | Natija |
|---|---|
| `npm test` (hammasi) | core **288**, mobile **182**, web **525**, admin **38**, mcp **76**, migration-guard **23**: hammasi o'tdi |
| `npm run typecheck` (core, mobile, web, admin, mcp) | 5/5 OK |
| `npm run build:web` | OK (Compiled successfully, 27/27 sahifa) |
| `npm run lint` (web) | OK, 0 ogohlantirish |
| `bash supabase/tests/run_local.sh` (lokal PostgreSQL 16, Supabase stub) | **651 PASS**, 0 FAIL |
| TS ↔ SQL jami (vaqtinchalik lokal bazada `calculate_line_total`) | namuna **385 000** = TS 385 000; 9 qatorli ro'yxat **617 000** = TS; 10 qatorli **1 009 000** = TS; `2,5×12 000` = 30 000 |

**Testlar xatoni ushlashi tekshirildi (mutatsiya, kod vaqtincha buzilib, so'ng qaytarildi):**

| Buzilgan joy | Yiqilgan testlar |
|---|---|
| Composer paste ushlash o'chirildi (eski xatti-harakat) | panel 7/9 |
| `lineStatus` savolni e'tiborsiz qoldiradi | 3 |
| `buildSalePlan` ikkinchi himoya o'chirildi | 1 (avval tirik qolgan edi: alohida test qo'shildi) |
| `buildPurchasePlan` savolni e'tiborsiz qoldiradi | 1 |
| core `x` belgisi o'chirildi | 16 |
| core narxdagi nuqtali ming o'chirildi | 8 |
| `matchCatalog` Kirill/Lotin moslash o'chirildi | 5 |
| `PurchaseView` qulfi savolni e'tiborsiz qoldiradi | 1 |
| Qator oxiridagi nuqtani olib tashlash o'chirildi | 1 |
| `NAME_HAS_NUMBER` ogohlantirishi o'chirildi | 2 |
| Nomga son qo'shish mobil `parseProductList` da ham yoqildi | 1 |
| `SMALL_PRICE` (`30x60`) o'chirildi | 1 |
| Ishlatilmagan `x` jim yutildi | 1 |
| «Tekshiring» savoli maydondan qat'i nazar yechildi | 1 |
| Yopishgan `3ta×4000` ajratish o'chirildi | 1 |

## 4.1. Mustaqil tekshiruv (`tanqidchi`)

1-tekshiruv: **FAIL**. Topilmalar va tuzatishlar:

| # | Topilma | Tuzatish |
|---|---|---|
| 1 (o'rta) | `Yurak 5x15.000.`: oxiridagi nuqta tufayli narx jimgina yo'qolardi, nom «Yurak 15.000.» bo'lardi | Joylangan qator oxiridagi `.` olib tashlanadi. Ichki `x` tokeni foydalanuvchi yozmaydigan belgi bo'ldi, ishlatilmasa `UNCLEAR_TIMES` xatosi chiqadi |
| 2 (o'rta) | Nomga son qo'shish taxmin edi va mobil `parseProductList` xatti-harakatini testsiz o'zgartirardi | Faqat joylangan ro'yxatda ishlaydi, `NAME_HAS_NUMBER` ogohlantirishi bilan (noaniq). Mobil avvalgidek `UNCLEAR_NUMBER` beradi (test bor) |
| 3 (past/o'rta) | Narx tahriri soni haqidagi «tekshiring» savolini ham yopardi | Savolda `field` bor, faqat o'sha maydon tahriri yechadi |
| 4 (past) | `Plitka 30x60` → narx 60 so'm, savolsiz | `x` bilan o'qilgan narx < 100 so'm bo'lsa `SMALL_PRICE` «tekshiring» |
| 5 (past) | `non 3ta×4000` → nom «non ta×4000» | Birlik + `x` + son yopishgan token ajratiladi. `1.500 ming` / `1.500` eslatmasi QARORLAR ga yozildi |
| ixtiyoriy | To'lov amalida ko'p qatorli joylash testi yo'q edi | Test qo'shildi |

2-tekshiruv: **PASS**. Yangi jiddiy topilma yo'q. Bloklamaydigan ikki kuzatish:
- `15000 so'm x3 non` → nom «x3 non» bo'ladi (`x` sonlar orasida emas, bu avvaldan bor xatti-harakat). Nom katalogga mos kelmaydi, shuning uchun qator baribir savol bilan sariq bo'ladi.
- `UNCLEAR_TIMES` mobil `parseProductList` da ham ishlaydi (qattiqroq va xavfsizroq; mobil testlari 182/182 o'tdi).

## 5. Haqiqiy brauzerda sinov

**Sinalgan** (`npm run demo`, ichki brauzer, soxta ma'lumot, Supabase'siz). Bu sinov `tanqidchi` tuzatishlaridan **oldin** qilingan. Tuzatishlar faqat tahlilchi va savol yechish mantig'ida (UI o'zgarmagan), ular unit va jsdom testlari bilan tekshirilgan:
- Savdo: 10 qatorli ro'yxat haqiqiy `paste` hodisasi (DataTransfer) bilan joylandi. 10 karta chiqdi: 6 aniq (Kirill «Чипс» → «Chips» ham), 2 noaniq («Sut» → «Sut 1 l» varianti; «Atir» → yangi tovar), 2 xato (nomsiz «15 000»; miqdori noaniq «Non 1.500x4000»). Oyna bo'sh qoldi, Tasdiqlash yopiq edi.
- Haqiqiy bosishlar bilan variant tanlandi, yangi tovar tasdiqlandi, nomsiz qator o'chirildi, xato qatorga soni `1,5` yozildi. Hammasi «Aniq» bo'ldi, **Tasdiqlash ochildi**, jami 392 500 so'm (qo'lda tekshirildi).
- Kirim: 5 qator, `\r\n` va «1.» belgilari bilan. 3 aniq, «Atir» yangi tovar (birlik tanlash kerak), «Chips 7» xato (kirimda narx shart). Ta'minotchi tanlanmagani uchun Tasdiqlash yopiq edi.
- Telefon kengligi (375px): gorizontal toshish yo'q, tugmalar ≥44px.

**Sinalmagan:**
- Tasdiqlashdan keyin serverga yozish: demo rejimda yozish o'chirilgan. Haqiqiy Supabase (staging ham) yo'q. `post_sale` / `post_purchase` ga joylangan qatorlar bilan haqiqiy so'rov **sinalmagan**. Server tomoni o'zgarmagan, lokal SQL testlari yashil.
- Haqiqiy telefon va telefon klaviaturasidan joylash (zaxira yo'l faqat jsdom testida sinalgan).
- Haqiqiy clipboard'dan Ctrl+V (brauzerda `ClipboardEvent` sun'iy yuborildi; React ishlovchisi bir xil).
- Tuzatishdan oldingi xatoni haqiqiy brauzerda qayta chiqarish (jsdom'da chiqarilgan).

## 6. Qolgan muammolar va cheklovlar

1. **Narxda nuqta qarori mobil va MCP'ga ham ta'sir qiladi**, chunki ular ham `core` tahlilchisidan foydalanadi: `13.000 so'm` endi xato emas, 13 000. Mobil testlari (182) o'tdi. Asoschi tasdig'i kerak (`QARORLAR.md` da yozildi).
2. Yangi tovar savdoda katalogga qo'shilmaydi: avvalgidek server uni tovarsiz qator sifatida saqlaydi, ombor harakati bo'lmaydi (audit S9, mavjud xatti-harakat). Kirimda esa yangi tovar yaratiladi (mavjud yo'l).
3. Kirimda «Chirmoq 13» (narxsiz bitta son) xato deb belgilanadi. Kirimda narx shart, chunki shu son narxmi yoki sonmi, aniq emas.
4. `chirmoq 10 130` → 10130 deb o'qiladi va «tekshiring» bilan sariq bo'ladi (core'ning bo'shliqli son qoidasi: `13 000` ham shunday birlashadi).
5. Bir xil tovar ro'yxatda ikki marta bo'lsa, ikki alohida qator bo'ladi (birlashtirilmaydi; server ikkalasini ham qabul qiladi).
6. O'xshash nomlar qidiruvi oddiy (prefiks, ichida bor, so'rov katalog nomi bilan boshlanadi). Imlo xatosi (`Chirmok`) moslashmaydi va «yangi tovar» deb so'raladi. Bu xavfsiz, lekin noqulay. Yaxshilash F5 (AI yordamchi) ga tegishli.
7. Bir martalik joylashda ko'pi bilan 200 qator: bu chegara avvaldan `buildSalePlan` da bor, joylashning o'zida alohida chegara yo'q.

## 7. Keyingi bosqich uchun tavsiyalar

1. Asoschi bilan: narxdagi nuqta qarorini tasdiqlash, keyin PR ochish («Humoyun/Abdulloh tasdiqlasin», core o'zgarishi sababli merge faqat asoschi so'zi bilan).
2. Staging loyihasi tayyor bo'lgach: joylangan ro'yxat bilan haqiqiy `post_sale` / `post_purchase` (jumladan yangi tovarli kirim) sinovi.
3. F2 (Savat): joylangan qatorlar va ularning `reviews` holati shu `DraftLine` shaklida saqlanishi mumkin. Bazaga saqlash migratsiya talab qiladi (015/016), asoschi qarori kerak.
4. F5: kod tushunmagan («Xato») va moslashmagan («Yangi tovar») qatorlar AI yordamchiga yuboriladigan aniq nomzodlar. Interfeys tayyor: savol → tanlov.
