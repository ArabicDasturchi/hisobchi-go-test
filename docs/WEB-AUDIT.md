# Hisobchi Go — web ilova auditi (11.11.2026)

Asos: `fix/panel-kirim-va-lint` = `main` @ `4ae7083`. Hech qanday kod yoki fayl o'zgartirilmadi, commit, push va deploy qilinmadi, production'ga ulanilmadi. `docs/BACKEND-AUDIT.md` joyida turibdi. Takrorlamaslik uchun backend topilmalari o'sha hujjatdagi ID'lar bilan berilgan (B1, S2 va h.k.).

Bitta yon ta'sir bor: demo serverni ishga tushirganda Next.js `apps/web/AGENTS.md` faylini yaratdi yoki yangiladi. U gitignore'da va repoga tushmaydi. Uni o'chirmadim.

## A. Umumiy holat

Kod sifati yuqori. Pul faqat BigInt bilan hisoblanadi, yozuvlar RPC orqali ketadi, `client_op_id` takroriy yozuvdan himoya qiladi, server natijani qayta o'qib tekshiradi, testlar ko'p. Asosiy muammolar texnik emas, **biznes oqimlarida**: bekor qilish, birliklar, takroriy nomlar va kassa hisobi.

| Holat | Soni | Funksiyalar |
|---|---|---|
| To'liq ishlaydi | 5 | Bosh panel, Sozlamalar (do'kon nomi, birliklar, profil), Mijozlar, To'lov olish/bekor qilish, Qoralamalar |
| Qisman | 7 | Login/ro'yxatdan o'tish (kod tayyor, haqiqiy Supabase'da sinalmagan), Mahsulotlar, Savdo, Xarid (kirim), Qarzdorlik, Ombor, Hisobotlar |
| Ishlamaydi yoki yo'q | 2 | Ta'minotchiga «Daftarga yozish» ikkinchi marta yiqiladi (B1); Chegirma umuman yo'q |

Webda alohida «To'lovlar» va «Qarzlar» bo'limi yo'q: ular mijoz va ta'minotchi daftari ichida. Bu QARORLAR.md'dagi qaror.

## B. Xatolar ro'yxati

| ID | Muammo | Fayl:qator | Sababi | Mijozga ta'siri | Daraja | Yechim |
|---|---|---|---|---|---|---|
| W1 | Doimiy mijozning to'langan savdosi bekor qilinsa, to'lov joyida qoladi. Keyin «Qayta yozish» qilinsa, kassa ikki marta sanaladi | [sales/page.tsx:47](../apps/web/src/app/(app)/sales/page.tsx), [sales/[id]/page.tsx:190](../apps/web/src/app/(app)/sales/[id]/page.tsx), `packages/core/src/dashboard.ts:93` | `reverse_sale` faqat bir martalik mijoz to'lovini qaytaradi (S2) | **Misol:** Ali 100 000 «To'landi». Narx xato → bekor → qayta 90 000 «To'landi». Natija: Ali qarzi −100 000, bugungi kassa 190 000, haqiqatda 90 000 | **Critical** | Bekor qilish oynasida «to'lovni ham bekor qilish» tanlovi (mavjud `void_payment` RPC bilan, migratsiya kerak emas) |
| W2 | Ta'minotchiga «Daftarga yozish» (tovar summasi) ikkinchi marta `opening_balance_exists` bilan yiqiladi | [usePanelActions.ts:364](../apps/web/src/components/panel/usePanelActions.ts) | Ochilish qoldig'i RPC'si ishlatilgan, u har ta'minotchiga bitta (B1) | Savdogar ta'minotchi qarzini yozolmaydi | **High** | Ochilish qoldig'i bo'lsa tovar qismini o'chirib, «Kirim»ga yo'naltirish; keyin alohida RPC |
| W3 | Savdo va to'lov ikki alohida RPC bilan ketadi | [useSaleSubmit.ts:313-338](../apps/web/src/components/sale/useSaleSubmit.ts) | `post_sale(p_paid)` mavjud, lekin ishlatilmagan (B5) | Internet uzilsa savdo qarzga yoziladi, to'lov yo'q. Qayta urinish tugmasi bor, lekin qarz vaqtincha noto'g'ri | **High** | `postSale` ga `p_paid` va `p_payment_method` uzatish (migratsiya kerak emas) |
| W4 | Mahsulot nomi takrorlanishi tekshirilmaydi (bazada ham UNIQUE yo'q) | [products/page.tsx:117](../apps/web/src/app/(app)/products/page.tsx), [api.ts:218](../apps/web/src/lib/data/api.ts) | Server savdo qatorini nom bo'yicha **eng eski** tovarga bog'laydi (`006:255`) | **Misol:** ikkita «Shakar». Kirim yangisiga tushadi, savdo eskisidan ayriladi. Biri +50, biri −50 ko'rinadi | **High** | Saqlashdan oldin `sameName` bilan ogohlantirish va mavjud tovarni taklif qilish |
| W5 | Kirimda yangi tovar doim `dona` birligida va tekshiruvdan **oldin** yaratiladi | [usePanelActions.ts:298-305](../apps/web/src/components/panel/usePanelActions.ts), [PurchaseView.tsx:79](../apps/web/src/components/panel/PurchaseView.tsx) | Birlik tanlash yo'q (B2) | **Misol:** «Un» kirimi `dona` bo'ladi, savdo `kg` da. Server bog'lamaydi, ombor kamaymaydi. Kirim rad etilsa katalogda yetim tovar qoladi | **High** | Kirim qatoriga birlik tanlovi; tovarni reja tekshiruvidan keyin yaratish |
| W6 | Kassa karta va o'tkazma to'lovlarini ham sanaydi, chiqimda esa faqat naqdni | `packages/core/src/dashboard.ts:94` va `:96` | Kirim va chiqim qoidasi bir xil emas | Mijoz 500 000 karta bilan to'lasa, «Kassa» +500 000 ko'rsatadi, qutida pul yo'q | **Medium** | Kassaga faqat `naqd`; karta va o'tkazma alohida qatorda |
| W7 | Mijoz ismi takrorlanishi tekshirilmaydi | [CustomerFormModal.tsx:45](../apps/web/src/components/forms/CustomerFormModal.tsx) | Tekshiruv yo'q | Bir mijozning qarzi ikki kartaga bo'linadi | Medium | Ogohlantirish va mavjudini taklif qilish |
| W8 | Qoldig'i bor tovar birligi to'g'ridan-to'g'ri o'zgartiriladi | [products/page.tsx:40](../apps/web/src/app/(app)/products/page.tsx) | B4 | Eski harakatlar yangi birlikda o'qiladi | Medium | Harakati bor tovarda birlik maydonini bloklash |
| W9 | Tovarga bog'lanmagan savdo qatori omborga ta'sir qilmaydi va hech qayerda ko'rinmaydi. Yangi qator doim `dona` | [panelLines.ts:66](../apps/web/src/lib/panelLines.ts), S9 | Nom yoki birlik mos kelmasa jim o'tadi | Ombor qoldig'i noto'g'ri | Medium | «Katalogda yo'q» qatorini saqlashdan oldin sariq belgilash (qisman bor), birlik tanlovi |
| W10 | Mijozsiz savdoda to'lov yozuvi yaratilmaydi; mobil esa `one_time` mijoz ishlatadi | [saleForm.ts:102](../apps/web/src/lib/saleForm.ts) | B6 | Web va mobil hisobotlari bir xil emas | Medium | `ensure_walkin_customer` + `p_paid` |
| W11 | Manfiy qarz (kredit) bilan hech narsa qilib bo'lmaydi; pulni qaytarish oqimi yo'q | [usePaymentSubmit.ts:410](../apps/web/src/components/sale/usePaymentSubmit.ts) | S2 | Ortiqcha to'lov qotib qoladi | Medium | Qaror kerak: refund RPC yoki kreditni keyingi savdoga ishlatish |
| W12 | Yangi do'konda faqat `dona` va `pachka` yoqilgan | [units.ts:8](../apps/web/src/lib/units.ts) | Standart tanlov | Oziq-ovqat do'koni Sozlamalarni topmaguncha `kg` tovar yarata olmaydi | Medium | Onboarding'da birliklarni tanlatish |
| W13 | OAuth rozilik matni haqiqiy imkoniyatga mos emas | [oauthConsent.ts:51](../apps/web/src/lib/oauthConsent.ts) | B3 | AI tasdiqsiz mijoz va tovar qo'sha oladi, matn esa «o'zgartira olmaydi» deydi | Medium | Matnni tuzatish |
| W14 | Har amaldan keyin butun tarix qayta yuklanadi, ustun tekshiruv so'rovlari har safar takrorlanadi | [ShopDataProvider.tsx:93](../apps/web/src/components/ShopDataProvider.tsx), [api.ts:120](../apps/web/src/lib/data/api.ts) | `fetchAll` bilan to'liq yuklash | Bir necha oydan keyin sekinlashadi | Low (hozircha) | Sahifalash yoki keshlash, MVP'dan keyin |
| W15 | Takliflar paneli «Yopish» tugmasi va Escape bilan yopilmaydi (brauzerda tasdiqlandi) | [PanelWorkspace.tsx:434](../apps/web/src/components/panel/PanelWorkspace.tsx), `:467` | Yopilgach fokus kiritish maydoniga qaytadi va `onFocus` panelni qayta ochadi | Telefonda savdo qatorlari yopilib qoladi | Low | Fokus qaytganda panelni ochmaslik |
| W16 | ESLint xatosi; CI'da lint qadami yo'q | [useBooks.ts:34](../apps/web/src/components/useBooks.ts) | L1 | — | Low | Tuzatish va CI'ga `npm run lint` qo'shish |
| W17 | Ishlatilmagan import | [purchases/new/page.tsx:19](../apps/web/src/app/(app)/purchases/new/page.tsx) | L2 | — | Low | O'chirish |
| W18 | `metadataBase` berilmagan | `app/layout.tsx` | Build ogohlantirishi | Ijtimoiy tarmoq preview'i `localhost` ga ishora qiladi | Low | `SITE_URL` dan berish |
| W19 | Chegirma funksiyasi yo'q | — | Hali qurilmagan | Savdogar narxni qo'lda kamaytiradi | Low | Mahsulot qarori |

## C. Backend bilan bog'liqlik

- **Webda ishlatiladigan jadvallar:** `shops`, `shop_members`, `customers`, `products`, `documents`, `document_lines`, `document_reversals`, `payments`, `payment_voids`, `suppliers`, `purchase_documents`, `purchase_lines`, `supplier_payments`, `supplier_payment_voids`, `product_stock`, `stock_movements`, `agent_drafts`.
- **To'g'ridan-to'g'ri yozish** (RLS ostida): `customers`, `products`, `suppliers`, `shops`. Moliyaviy yozuvlar faqat RPC orqali.
- **14 ta RPC chaqiriladi:** `create_shop`, `post_sale`, `reverse_sale`, `record_payment`, `void_payment`, `post_purchase`, `reverse_purchase`, `record_supplier_payment`, `void_supplier_payment`, `post_supplier_opening_balance`, `adjust_stock`, `partner_statement`, `accept_agent_draft`, `reject_agent_draft`.
- **Backendda bor, webda ishlatilmaydi:** `post_sale(p_paid, p_payment_method)`, `ensure_walkin_customer`, `customer_outstanding`, `supplier_outstanding`. SQL ikkinchi yo'li faqat varaq qoldig'ida ishlatiladi; ro'yxatlardagi qarz klientda hisoblanadi.
- **Mock ma'lumot:** faqat demo rejimda (`NEXT_PUBLIC_DEMO=1`, production build'da o'chadi).
- **Yetishmaydigan RPC'lar:** ta'minotchiga tovarsiz qarz yozuvi (B1), refund (S2), tovar va kirimni bitta tranzaksiyada yaratish (B2), birlikni almashtirish (B4), qoralamani tahrirlash.
- **RLS:** lokal Supabase stub'ida begona do'kon ma'lumoti 0 qator qaytaradi, begona RPC `forbidden` beradi. Kamchiliklar: S4 (klient tizim ustunlariga yoza oladi), B8, S8. Haqiqiy Supabase'da sinalmagan.

## D. AI agent uchun tayyorlik

- **Bor:** `apps/mcp` — 13 ta tool.
  - 7 ta o'qish: `list_customers`, `get_customer_balance`, `list_sales`, `get_sale`, `daily_summary`, `list_products`, `list_suppliers`.
  - 2 ta tasdiqsiz qo'shish: `add_customer`, `add_products`.
  - 4 ta qoralama: `draft_sale`, `draft_payment`, `draft_purchase`, `propose_change`.
- **Tasdiqlash mexanizmi ishlaydi:** OAuth token `post_sale` va `accept_agent_draft` ni chaqira olmaydi. Tasdiq faqat ilovadagi «Qoralamalar» sahifasida.
- **AI uchun xavfsiz:** `agent_*` o'qish RPC'lari va `agent_draft_*`. Yozuv RPC'larini AI'ga hech qachon bermaslik kerak.
- **Yetishmaydi:**
  - ilova ichida LLM (adapter yoki Edge Function yo'q);
  - ovozni matnga aylantirish va rasmdan o'qish;
  - qoralamani tahrirlash RPC'si;
  - token xarajatini o'lchash;
  - S1, S3, B7 tuzatishlari;
  - production'da `MCP_ALLOWED_CLIENT_IDS` majburiyligi.

## E. Mijozlarga chiqarishga to'sqinlik qiladiganlar

1. W1: noto'g'ri kassa va qotib qolgan kredit, eng ko'p uchraydigan «xato savdoni tuzatish» oqimida.
2. W4 va W5: ombor qoldig'i jimgina buziladi.
3. W2: ta'minotchi daftari yiqiladi.
4. Login, email tasdiqlash va yozish oqimlari **haqiqiy Supabase'da birorta ham sinalmagan**. Production sozlamalari tekshirilmagan: Redirect URLs, `NEXT_PUBLIC_SITE_URL`, H1 (leaked password protection).

Birinchi tajriba (ro'yxatdan o'tish → do'kon nomi → panel) qisqa va tushunarli. Savdo 3–4 bosishda yoziladi. Xato xabarlari o'zbekcha va tushunarli. Mobil brauzerda (375px) 9 ta sahifa gorizontal siljishsiz ochildi, runtime xatosi chiqmadi.

## F. Test natijalari

| Tekshiruv | Natija |
|---|---|
| TypeScript (web) | ✅ |
| ESLint (web) | ❌ 1 xato, 1 ogohlantirish (W16, W17) |
| Vitest web / core / mcp | ✅ 387 / 235 / 76 |
| migration-guard | ✅ 23/23 |
| Build (web) | ✅ (`metadataBase` ogohlantirishi) |
| SQL testlar (lokal PG16, vaqtinchalik baza, oxirida o'chirildi) | ✅ 603 PASS, 0 FAIL |
| Brauzer (demo, desktop va 375px) | Panel, savdo tasdiq oynasi, xato ko'rsatish, 9 ta sahifa ko'rindi. W15 topildi |

**Sinalmaganlar:**
- login, ro'yxatdan o'tish, email, parol tiklash (demo rejim auth'ni chetlab o'tadi);
- haqiqiy yozuvlar (demo faqat o'qiydi);
- haqiqiy Supabase va RLS;
- haqiqiy telefon va iOS Safari;
- yuk ostida ishlash;
- mobil ilova.

## G. Juma kunigacha reja

**1. MVP uchun majburiy:**
- W1: bekor qilishda to'lovni ham `void_payment` bilan bekor qilish tanlovi;
- W3 va W10: `post_sale(p_paid)` ga o'tish;
- W2: ta'minotchi uchun ikkinchi yozuvni bloklab, «Kirim»ga yo'naltirish;
- W4: takroriy tovar nomi ogohlantirishi;
- W5: kirimda birlik tanlovi va tovarni tekshiruvdan keyin yaratish;
- W6: kassaga faqat naqd;
- W16 va W17, CI'ga lint qadami;
- staging'da (yoki test do'konida) to'liq oqim: ro'yxatdan o'tish → tovar → mijoz → savdo → to'lov → bekor qilish → kirim;
- production sozlamalari: Redirect URLs, `NEXT_PUBLIC_SITE_URL`, H1.

Ro'yxatdagi kod ishlarining hammasi mavjud RPC'lar bilan qilinadi, yangi migratsiya kerak emas.

**2. MVP'dan keyin:** W7, W8, W9, W11 (refund qarori), W12, W13, W14, W15, 013 migratsiya (B4, S1, S3, S4, B8, B9, B10), qoralamani tahrirlash.

**3. Hozircha kerak emas:** ovoz va rasm bilan ishlovchi AI agent, ilova ichidagi LLM, xodim rollari, chegirma (mijozlar so'ramaguncha), admin panelni kengaytirish.

## H. Xulosa

**Hozirgi holatda keng mijozlarga berishga tayyor emas.** Hisob yadrosi ishonchli: TS va SQL bir xil natija beradi, 603 SQL test o'tdi, takroriy yozuvdan himoya bor. Lekin oddiy kundalik vaziyatlarda (xato savdoni bekor qilib qayta yozish, kg tovarni kirim qilish, bir xil nomli tovar) **kassa va ombor raqamlari jimgina noto'g'ri chiqadi**. Bundan tashqari login va yozuvlar haqiqiy backendda sinalmagan.

Majburiy ro'yxat bajarilib, staging'da to'liq oqim sinalsa, jumagacha **1–3 ta ishonchli savdogar bilan nazoratli pilot** uchun tayyor bo'ladi.
