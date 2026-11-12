# Ish shartnomasi (Abdulloh ↔ Claude)

Sana: 2026-11-12. Doimiy ruxsatnoma. Bu hujjat CLAUDE.md dagi "main ga o'zing merge qilma" qoidasini quyidagi shartlar bilan almashtiradi.

## Asosiy tamoyil
Abdulloh vazifa (input) beradi, natija (output) esa **ilovadagi haqiqiy o'zgarish** bo'ladi. Bir vazifa uchun ikki marta "merge qilaymi?" deb so'ralmaydi: token va vaqt isrof bo'ladi.

## Tuzatish yoki kichik o'zgarish so'ralganda Claude shuni qiladi
1. Kodni o'zgartiradi, `npm run typecheck` va `npm test` ni ishga tushiradi.
2. Hammasi yashil va muammo qolmagan bo'lsa, PR ochadi va **o'zi merge qiladi**.
3. Deploy (Vercel) `READY` bo'lguncha kutadi va tekshiradi.
4. Faqat shundan keyin qisqa o'zbekcha natija beradi: nima o'zgardi, saytda qayerda ko'rinadi, nima sinalmagan.

## Merge QILINMAYDI, avval Abdullohdan so'raladi
- Testlar yoki typecheck qizil, yoki `tanqidchi` FAIL bergan.
- Migratsiya (`supabase/migrations`) yoki production bazaga har qanday o'zgartirish.
- Pul hisobi mantig'i o'zgaradi (`packages/core`, SQL ikkinchi yo'l, jami/qarz/kassa formulalari).
- Ma'lumot o'chadi yoki qaytarib bo'lmaydi (o'chirish, jurnalni o'zgartirish, hisob-kitob tarixi).
- Kalit, parol, token yoki yangi tashqi xizmat (to'lov, SMS, AI kaliti) kerak.
- Vazifa chegarasidan chiqiladi: yangi funksiya qo'shish yoki mavjudini olib tashlash (so'ralmagan bo'lsa).
- "Eng muhim qoidalar"ga yoki `docs/QARORLAR.md` dagi qarorga zid ish chiqadi.
- Humoyunning hududidagi fayllar o'zgaradi (VAZIFALAR-ICE, 3-bo'lim) yoki boshqa PR bilan to'qnashuv qaror talab qiladi.
- Deploy `ERROR` bo'lsa: avval tuzatishga urinadi, bo'lmasa Abdullohga aytadi (yoki oldingi versiyaga qaytaradi va xabar beradi).

## Hisobotda
- Faqat haqiqat: "ishlaydi" faqat testda va haqiqiy sinovda tasdiqlangan bo'lsa. Telefonda yoki brauzerda ko'rilmagan narsa "sinalmagan" deyiladi.
- Qisqa, oddiy o'zbek tilida. Oxirida Abdullohdan kerak bo'lgan bitta amal bo'lsa, shuni yozadi (masalan: "sahifani yangilab ko'ring").
