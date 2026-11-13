<!-- Manba: asoschi topshirig'i (11.11.2026), Humoyunga fayl sifatida berilgan; repoga 12.11.2026 da qo'shildi (matn o'zgartirilmagan). Keyingi qarorlar: docs/QARORLAR.md (12.11: Gemini ishlatilmaydi). -->
# Humoyun uchun: MVP funksiyalari va texnik topshiriq

Sana: 11.11.2026. Yozdi: arxitektor-Claude, asoschi Abdulloh Ismoilov so'zlaridan. Bu fayl [HUMOYUN-BACKEND.md](HUMOYUN-BACKEND.md) ning davomi: u yerda umumiy arxitektura va audit (B0–B5), bu yerda aniq funksiyalar. Qoidalar o'zgarmaydi: [CLAUDE.md](../CLAUDE.md), [ASOSCHI-TALABLARI.md](ASOSCHI-TALABLARI.md).

## Umumiy tartib

1. **F1** ro'yxatni joylab savdo/kirim kiritish (kod bilan, AI'siz)
2. **F2** Savat: qoralamalar o'rniga, ko'p mijozga bir vaqtda savdo
3. **F3** tuzatish va bekor qilish (B3 bilan birga)
4. **F4** suratdan kirim (maklatnoy, yuk xati, ro'yxat surati)
5. **F5** AI agentlar (ovoz va erkin gap): kod tushunmagan qatorlar uchun
6. Keyin: serverga joylash, domen ulash

Har funksiya tugagach keyingisiga to'xtamasdan o't. To'xtash: asoschi qarori yoki sir kerak bo'lsa, qoidaga zid ish chiqsa, migratsiya kerak bo'lsa (fayl yoz, production'ga qo'llama).

## Hozirgi holat (repodan ko'rilgan, 11.11.2026)

- `packages/core/src/parse-list.ts` bor: deterministik tahlilchi ("3 ta non 4000 so'mdan", "chirmoq 10 ta 13 ming"). Birlik so'zi (`ta`, `kg`...), `so'mdan` yoki `ming` bilan ishlaydi. **`Chirmoq 13x15.000` va `Chirmoq 13` shakllari qo'llab-quvvatlanishi tekshirilmagan.**
- `agent_drafts` jadvali bor (migratsiya 004, 005, 008): turlari sotuv, to'lov, kirim. Faqat tashqi AI agent (MCP) yozadi.
- Veb: `apps/web/src/app/(app)/drafts/page.tsx`, `components/DraftCard.tsx`, `components/panel/PanelWorkspace.tsx`.
- Asoschi xatosi: boshqaruv panelida Kirim/Savdo tanlab, 10 qatorli tayyor ro'yxat joylanganda takliflar chiqmadi, yuborganda xato chiqdi. **Sababi aniqlanmagan.** F1 ning birinchi qadami: qayta ishlab chiqarish va sababini yozish.
- Yarim qolgan savdolar hozir faqat ekranda turadi, bazada saqlanmaydi.

---

## F1. Ro'yxatni joylab savdo/kirim kiritish

**Maqsad.** Savdogar matn ro'yxatini joylasa, har qator alohida tahlil qilinib, panelda mahsulot kartalari savatchaga tushadi (soni, narxi bilan). Kiritish oynasida oddiy matn qoladi, matn o'zgarsa kartalar yangilanadi.

**Qator shakllari.**
- Savdo: `Chirmoq 13` (nomi + soni); `Chirmoq 13x15.000` (nomi + soni + narxi).
- Kirim: nomi, soni va narxi shart.
- Raqam: `15.000`, `15 000`, `15000` bir xil. Pul butun so'm, miqdor `qty_milli`, suzuvchi nuqta yo'q.

**Topshiriq.**
1. Xatoni qayta ishlab chiqar va sababini yoz (qaysi fayl, nima uchun).
2. `packages/core`: tahlilchini yuqoridagi shakllarga kengaytir. Chiqish: qator, `aniq` / `noaniq` / `xato` holati.
3. Mahsulotni katalogdan har qator uchun alohida qidir (katta-kichik harf, bo'sh joy, lotin/kirill farqiga chidamli). Bitta mos kelsa `aniq`; bir nechta bo'lsa variantlar bilan sariq; topilmasa "yangi mahsulot" taklifi.
4. Panel: joylash (paste) bilan kartalar chiqadi. Sariq qator hal qilinmaguncha "Tasdiqlash" yopiq.
5. Jami summa ikki mustaqil yo'l bilan (TS va SQL `post_sale` / `calculate_line_total`). Mos kelmasa to'xta.

**Qabul mezoni.**
- Namuna: 10×13 000 + 5×15 000 + 20×9 000 = 385 000.
- 10 qatorli ro'yxat joylanganda 10 karta chiqadi; tushunilmagan qator sariq.
- Har yangi mantiq uchun test bor va xatoni ushlashi tekshirilgan. `npm test` va `npm run typecheck` yashil.
- Haqiqiy brauzerda sinalmagan bo'lsa "sinalmagan" deb yoz.

Mukammal prompt (Claude Code uchun): `PROMPT-RUYXAT-JOYLASH.md`.

---

## F2. Savat (qoralamalar o'rniga)

**Maqsad.** Bozorda mijozlar navbat kutmaydi: bir vaqtda bir nechta mijozga savdo yuritish va yarim qolgan savdo yo'qolmasligi kerak.

**Talab (asoschi).**
1. "Qoralamalar" bo'limi "Savat" deb qayta nomlanadi, savat belgisi bilan.
2. Savatda ikki turdagi narsa: savdogarning yarim qolgan savdolari (mijoz bo'yicha, to'lov olinmaganlari ham) va AI tayyorlagan qoralamalar.
3. Savdoni bosib ochiladi, kerak bo'lsa o'zgartiriladi, keyin tasdiqlanadi yoki to'lov qabul qilinadi.
4. Boshqa bo'limga o'tib qaytganda ham yig'ilgan mahsulotlar joyida turadi.
5. Tepada mijoz ismi bilan chiplar: bosib bir savdodan ikkinchisiga o'tiladi.

**Texnik topshiriq.**
- Yarim qolgan savdolarni bazaga saqlash kerak. Variant: `agent_drafts` ni umumiylashtirish (`source`: `user` yoki `agent`), yoki alohida jadval. Tanlovni `docs/QARORLAR.md` ga yoz.
- Har do'konga ajratilgan (RLS, `shop_id`). Yozish faqat RPC orqali. `client_op_id` bilan ikki marta yozilishdan himoya.
- Savat ichidagi narsa tasdiqlanmaguncha jurnalga (`ledger_entries`) tushmaydi. Qoida o'zgarmaydi.
- Qoralama qatorlarini tahrirlash uchun RPC (B3 bilan birga).
- Ikki qurilmadan bir savatni tahrirlasa to'qnashuv: oxirgi o'zgartirish versiya raqami bilan tekshiriladi.
- **Migratsiya kerak bo'ladi.** Raqam: 014 yoki undan keyingi (013 B2 xavfsizlik tuzatishlari uchun band). Faylni yoz, production'ga faqat asoschi so'zi bilan qo'llanadi.

**Qabul mezoni.** Ikkita mijozga savdo ochiq turganda sahifalar orasida yurib qaytsa ham ikkalasi saqlanadi; sahifa yangilansa ham yo'qolmaydi; tasdiqlanmagan savdo daftarda ko'rinmaydi.

---

## F3. Tuzatish va bekor qilish

- Pul yozuvi ustiga yozilmaydi: bekor qilish (teskari yozuv, sabab majburiy) + qayta yozish.
- Mahsulot, mijoz, ta'minotchi, savat qatorlari jadvalning o'zida tuzatiladi.
- Tuzatish ham auditda ko'rinadi (kim, qachon, nima).
- Test: bekor qilingan savdo qarz va ombor qoldig'ini to'g'ri qaytaradi.

---

## F4. Suratdan kirim (maklatnoy, yuk xati, ro'yxat surati)

- Rasm Edge Function'ga yuboriladi (`supabase/functions` hali yo'q), model faqat matnni tuzilmaga aylantiradi (tovar, soni, narxi). **AI yig'indi hisoblamaydi va bazaga yozmaydi.**
- Natija F1 dagi kartalar bilan bir xil ko'rinishda chiqadi; noaniq qator sariq.
- Qator summasi yuk xatidagi summa bilan solishtiriladi; mos kelmasa to'xta.
- Gemini kaliti: asoschidan so'ra, repoga yozma.
- Tarif limitlari (suratlar soni) keyin; hozir faqat o'lchov uchun AI sarfini logla.

## F5. AI agentlar

- Ovoz va erkin gap: kod tushunmagan qatorlar uchun yordamchi. Avval kod (F1), AI faqat qolganini.
- MCP agent (`apps/mcp`) hozirgidek faqat o'qish va qoralama; tasdiqlash faqat ilovada.
- Natija ham savatga tushadi (F2).

---

## Keyin: server va domen

1. Server tanlovi: hozir ilova Supabase bulutida. 6–8 $ lik serverga o'z Supabase'ni o'rnatish xavfli (o'zi o'rnatiladigan Supabase odatda kamida 4 GB xotira so'raydi, hujjatdan tekshiring). Tavsiya: 20 $ atrofida server va har kuni zaxira nusxa (backup).
2. Joylash tartibi: staging'da sina, keyin production.
3. Domen ulash va TLS.
4. Zaxiradan tiklashni bir marta amalda sinab ko'r.

## Tugatish qoidasi

PR oching; tavsifda nima o'zgargani va nima sinalmagani aniq yozilsin. `main` ga merge faqat asoschi. Seans tugashi mumkin bo'lsa `docs/HOLAT-*.md` ga holat yozib push qil.
