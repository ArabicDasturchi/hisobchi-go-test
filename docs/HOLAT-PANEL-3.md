# HOLAT: PANEL-3 (kiritish oynasi faqat panelda, hamma joyda «Tuzatish»)

Sana: 2026-11-10. Manba: `HisobchiGo-oynalar-V3.pdf`, prompt PANEL-3. Shoxlar: `feat/panel-3` (P1-P3, PR #38) va `feat/panel-3-baza` (P4-P6, stacked).

## Tayyor
- **P1 Panel qobig'i**: `/dashboard` bitta ustun, pastga qotirilgan kiritish oynasi, takliflar paneli oqimda (Jami qatorini yopmaydi), bo'sh panelda hisobot kartochkalari yo'q, `+` menyusi, Amal menyusi (aynan 5 ta), Kimga (mijoz/ta'minotchi/ikkalasi), URL holati (`?amal=&kimga=`), bo'sh so'rovda 8 ta taklif.
- **P2 Amallar**: Savdo (sariq qator, Jami faqat to'liq qatorlar, Tasdiqlash yopiq, To'landi/Qarzga/Qisman), To'lov olish, Kirim, Ta'minotchiga to'lov, Daftarga yozish (erkin matn, oldindan ko'rish).
- **P3 Navigatsiya**: PC chap menyu + tepada sahifaga mos qidiruv (`?q=`); telefonda panelda hamburger, boshqa sahifada pastki menyu (Panel, Savdolar, Daftarlar, Baza, Yana); Hisobotlar alohida sahifa.
- **P4 Tuzatish**: `components/edit/` (`useRowEdit`, `EditableCell`, `EditableRow`), jsdom testlari.
- **P5 Baza**: Mahsulotlar va Ombor (tan narx/foyda yo'q, joyida tuzatish, kam qolgan, qoldiq tuzatish yozuvi), `docs/MAHSULOT-XATOLARI.md`.
- **P6 (qisman)**: Mijozlar va Ta'minotchilar (joyida tuzatish, daftar faqat o'qiladi, «Panelda yozish»), Savdolar (Bekor qilish + Qayta yozish), Qoralamalar qidiruvi, Hisobotlar sahifasi, yangi mijoz/ta'minotchi/mahsulot `+` menyusidan.

## Qolgan / boshlanmagan
1. **Qoralamalarda qatorlarni joyida tuzatish**: to'xtash nuqtasi. `accept_agent_draft(p_draft_id)` tahrirlangan ma'lumotni qabul qilmaydi; yangi RPC (migratsiya) kerak, alohida PR va kelishuv bilan (QARORLAR.md dagi yozuv).
2. Kirim amalida sana tanlovi (PDF dagi «Sana») yo'q: server bugungi sanani qo'yadi.
3. `lib/ledgerView.ts` dagi `quickPreview`/`quickKeyAction` endi UI'da ishlatilmaydi (testlari bor); keyingi tozalashda olib tashlanadi.
4. Eski `/purchases/new` sahifasi qoldi (kirim endi panelda); xavfsiz yo'naltirish qaroriga qoldirildi.
5. Telefon va haqiqiy Supabase'da sinab ko'rish (pastga qarang).

## Sinalmagan
Haqiqiy Supabase'da: Kirim, Ta'minotchiga to'lov, Daftarga yozish, Savdoni bekor qilish va qayta yozish, qoldiq tuzatish, mahsulot/mijoz/ta'minotchi tahriri saqlashi (demo yozishga ruxsat bermaydi). Haqiqiy telefonda ekran klaviaturasi (`visualViewport`), Safari, ekran o'quvchi. Skrinshotlar demo rejimida olingan: `docs/ekranlar/panel-3/`.

## Keyingi aniq qadam
1. PR #38 va stacked PR'ni ko'rib chiqish; merge'dan keyin ikkinchi PR bazasini `main` ga o'zgartirish.
2. Qoralamalar tahriri uchun RPC loyihasini kelishish (QARORLAR.md), keyin migratsiya `0NN_...sql` (`docs/MIGRATSIYA-CI.md` bo'yicha) va UI.
3. Haqiqiy do'konda (Sochiq market) telefonda 1 kun sinash.
