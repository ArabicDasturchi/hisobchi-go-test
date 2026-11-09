# Asosiy sahifa: "Yagona kiritish oynasi"

Holat: LOYIHA (dizayndan oldingi hujjat). Kod yo'q. Tasdiqlangach maket chiziladi, keyin prompt yoziladi.
Sana: 2026-11-09

## 1. Nima uchun
Savdogar kuniga ko'p marta bir xil ish qiladi: savdo yozadi, qarz yozadi, to'lov oladi, kirim qiladi. Hozir bular alohida sahifalarda. Maqsad: **hammasi bitta oynadan**, 1-2 soniyada, xatosiz. Demo day (22-24 noyabr) uchun yurak shu oyna.

## 2. Asosiy g'oya (bir jumla)
Chat emas. Bu **kuchli kiritish oynasi**: yozasiz, takliflar chiqadi, bosib tanlaysiz, qatorlar kartochka bo'lib tushadi, yuborasiz, daftarga yoziladi.

## 3. Ekran tuzilmasi

```
┌──────────────────────────────────────────┐
│  Bugun: savdo ... so'm   Qarz ... so'm   │  <- qisqa ko'rsatkichlar (bosiladi)
├──────────────────────────────────────────┤
│  Kartochkalar (spiska):                  │
│  ┌────────────────────────────────────┐  │
│  │ Joynamoz Turk   [ 10 ] dona  13 000│  │
│  │ Tasbeh          [  5 ] dona  15 000│  │
│  │ Qur'on (sariq!) [  ? ] dona   ?    │  │
│  └────────────────────────────────────┘  │
│  JAMI: 385 000 so'm  (kod hisoblagan)    │
├──────────────────────────────────────────┤
│  Takliflar:  [Joynamoz Turk] [Joynamoz   │
│               Eron] [Joynamoz bolalar]   │
├──────────────────────────────────────────┤
│  [ joy|                          ] [ ➤ ] │  <- yozish oynasi
│  [Kimga: Rahim aka ▾] [Amal: Savdo ▾] [+]│  <- pastki tugmalar qatori
└──────────────────────────────────────────┘
```

Tartib yuqoridan pastga: ko'rsatkichlar, kartochkalar, takliflar, yozish oynasi, tugmalar qatori. Telefonda ham shu tartib, barmoq bilan bosishga qulay katta tugmalar.

## 4. Ish oqimi (savdo misolida)
1. Savdogar "Kimga" tanlaydi (mijoz yoki "naqd/mijozsiz"), "Amal" = Savdo.
2. Yozishni boshlaydi: "joy". Kod bazadan mos tovarlarni topib taklif qiladi (Lotin va Kirill farqi hisobga olinmaydi, imloviy xatoga chidamli).
3. Taklifni bosadi, qator kartochka bo'lib tushadi. Yonida **soni** va **narxi** maydoni bor. Narx bazadan avtomatik tushadi, o'zgartirsa bo'ladi.
4. **Ko'p tanlash (asosiy imkoniyat, 4a bo'limiga qarang).** Yana tovar qo'shadi.
5. JAMI kod bilan hisoblanadi va doim ko'rinib turadi.
6. "Yuborish": tekshiruv oynasi chiqadi (kimga, nechta qator, jami). Savdogar **tasdiqlaydi**, shundan keyingina daftarga yoziladi.

Boshqa amallar shu oyna ichida: **To'lov** (kimdan, qancha), **Kirim** (ta'minotchi, tovarlar), **Daftarga yozish** (mijozni tanlab yozuv qo'shish).

## 4a. Ko'p tanlash: bitta nomdagi barcha turlar (asosiy imkoniyat)
**Muammo** (al Hadiya do'koni, Iskandar aka aytgan): mijoz bir nom ostida bir necha xil tovar oladi, masalan "joynamoz" deganda 5 xil joynamoz. Har birini alohida qidirib yozish sekin va xatoga olib keladi.

**Yechim:**
1. Savdogar "joy" yozadi. Takliflarda **bazadagi barcha joynamozlar** ro'yxat bo'lib chiqadi (har birining yonida belgilash katakchasi).
2. Mijoz olgan turlarini ketma-ket bosib **belgilaydi**. Yozish oynasi yopilmaydi, ro'yxat ochiq turadi, belgilanganlar ajralib ko'rinadi va ularning soni ("3 ta tanlandi") chiqib turadi.
3. "Qo'shish" bosilganda belgilangan hammasi **bir yo'la** kartochka bo'lib tushadi. Har birining soni (boshida 1) va narxi yonida to'ldirishga tayyor turadi.
4. Savdogar sonlarni yozadi: yig'indi kodda hisoblanadi.

Qoidalar:
- Belgilash tezda bekor qilinadi (yana bosish).
- Bir tovar ikki marta tushmaydi: kartochkada bor tovar ro'yxatda "qo'shilgan" deb ko'rinadi, ustiga bossa soni +1 bo'ladi.
- Ro'yxat tartibi: ko'p sotilgani yuqorida (oxirgi sotuvlar bo'yicha), keyin alifbo. Tartib kodda, model kerak emas.
- Telefonda katakcha va qator katta, bitta bosish yetarli.
- Aynan shu imkoniyat demoda ko'rsatiladi: "bitta so'z, hamma turlari, bosib belgilash".

## 5. Qatlamlar (tartib muhim)
| Qatlam | Nima qiladi | Model kerakmi |
|---|---|---|
| 1. Jonli takliflar | Yozayotganda bazadan nomzod topadi | Yo'q, oddiy kod |
| 2. Kartochkalar va hisob | Qator, son, narx, jami | Yo'q, kod (TS + SQL ikki yo'l) |
| 3. Agent (KEYIN) | Yopishtirilgan ro'yxat yoki daftar rasmini qatorlarga ajratadi | Ha, lekin faqat qator ajratish va tovar tanlash |

Agent kiritish yo'lini **almashtirmaydi**, faqat tezlashtiradi. V1 da agent yo'q.

## 6. Kartochka qoidalari
- Har qator: tovar nomi, soni, narxi, qator jami.
- **Sariq** qator: tovar topilmadi, son yoki narx yo'q, yoki bir nechta mos nomzod bor. Sariq qator tasdiqlanmaguncha yuborib bo'lmaydi.
- **Yangi tovar**: bazada yo'q nom yozilsa, "Yangi tovar qo'shish" taklifi chiqadi (nom, narx), savdogar tasdiqlaydi.
- Qatorni o'chirish, sonini o'zgartirish bir bosishda.
- Pul butun so'm, kasr yo'q.

## 7. Qoidalar (o'zgarmaydi, CLAUDE.md dan)
1. AI hech qachon yig'indi hisoblamaydi va bazaga yozmaydi.
2. Hisob ikki mustaqil yo'l bilan; mos kelmasa to'xtaydi va xato ko'rsatadi.
3. Savdogar tasdiqlamaguncha hech narsa saqlanmaydi.
4. Jurnal faqat qo'shiladi; tuzatish teskari yozuv bilan.
5. Pul butun son (so'm).

## 8. Tezlik maqsadi
- Takliflar: yozgandan 0.2 soniyadan kam.
- Butun ro'yxat qayta ishlash (agent bo'lganda): 2 soniyadan kam. Yo'l: ishonchi yuqori qatorni kod o'zi yopadi, faqat shubhali qator modelga boradi, hammasi parallel.

## 9. V1 doirasi
**Kiradi:**
- Bitta kiritish oynasi: takliflar (**ko'p tanlash bilan**), kartochkalar, "Kimga" tanlash, jami, tasdiqlash.
- Amallar: Savdo, To'lov.

**Keyin:** Kirim va daftarga yozish tugmalari, qo'shimcha tugmalar, agent (ro'yxat yopishtirish, rasm), ovoz.
Sabab: MVP tamoyili, bitta to'liq ishlaydigan narsa.

## 10. Ochiq savollar (mantiqiy default bilan)
| Savol | Default |
|---|---|
| Hozirgi "Yangi savdo" sahifasi nima bo'ladi? | Shu oyna bilan almashtiriladi, eski sahifa V1 tayyor bo'lgach olib tashlanadi |
| Narx bazadan yoki qo'lda? | Bazadan tushadi, qo'lda o'zgartirsa bo'ladi |
| Mijozsiz (naqd) savdo bormi? | Ha, "Kimga" bo'sh qolsa naqd savdo |
| Sotuv narxi yo'q tovar (≈45 ta) | Sariq, narx kiritilishi shart |
| Agent qaysi model? | Keyingi bosqich: 100 ta real ro'yxatda sinov (pg_trgm, Jev, Haiku, embedding) va tezlik + aniqlik bo'yicha tanlanadi |

## 11. Qabul mezonlari (tayyor degani)
- "joy" yozilganda 0.2 soniyada takliflar chiqadi; Kirill yozilsa ham topadi.
- Takliflarda bir nechta tovarni belgilab, bitta bosishda hammasini kartochkaga qo'shish mumkin; takroriy tovar ikki qator bo'lmaydi.
- 10×13 000 + 5×15 000 + 20×9 000 = 385 000 to'g'ri chiqadi.
- Sariq qator bilan yuborib bo'lmaydi.
- Tasdiqlamasdan bazaga hech narsa yozilmaydi.
- `npm test` va `npm run typecheck` yashil; telefonda sinalgan.

## 12. Keyingi qadamlar
1. Shu hujjatni ko'rib chiqish va o'zgartirish.
2. Maket (Claude Design): kompyuter va telefon.
3. Tasdiqlangach: PROMPT-ASOSIY-OYNA.md (Claude Code uchun).
4. Parallel: 100 ta real ro'yxatdan sinov to'plami (agent tanlovi uchun).

## 13. Holat: V1 qurildi (09.11.2026, shox `feat/asosiy-oyna`)
**Tayyor:** qidiruv (Kirill/Lotin/apostrof), barcha mos tovarlar ro'yxati va ko'p tanlash, takroriy tovar +1, qator holati (sariq: belgi + matn), jami (`buildSalePlan`), tasdiq oynasi (To'landi/Qarzga/Qisman, chek, `payment_failed`, qulflash), «Kimga» tanlovi (qidiruv, yangi mijoz), To'lov amali, `/sales/new` yo'naltirish, ko'rsatkichlar qatori. Testlar: `apps/web/__tests__/sale-composer-*.test.ts(x)`.
**Sinalgan:** demo rejimida brauzer pane'da (390 va ~1280 kenglik, qorong'i tema): panel, 16 ta natija, 3 tasini belgilab qo'shish, jami, tasdiq oynasi, gorizontal aylanish yo'q.
**Sinalmagan:** haqiqiy Supabase'da saqlash/to'lov, haqiqiy telefon (ekran klaviaturasi, `visualViewport`), yorug tema skrinshoti, Vercel, ekran o'quvchi, Safari.
**Keyin:** Kirim va «daftarga yozish» amallari, `+` menyusi (fayl), agent (ro'yxat yopishtirish, rasm), ovoz.
