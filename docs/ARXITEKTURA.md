# Hisobchi Go — arxitektura

Holat: reja. Manba: arxitektura sahifasi (28.10.2026). Mobil ilova va kompyuter ilovasi bitta umumiy bazada ishlaydi.

## 1. Bir qarashda: 6 bo'g'inli oqim

1. **Kiritadi** — savdogar spiskani ovoz yoki rasm bilan beradi.
2. **Tushunadi** — AI tovar, son, narxni ajratadi.
3. **Tasdiqlaydi** — savdogar ro'yxatni ko'rib tasdiqlaydi yoki to'g'rilaydi.
4. **Hisoblaydi** — oddiy kod hisoblaydi.
5. **Saqlaydi** — bazaga yoziladi.
6. **Natija** — jami, mijoz daftari, kerak bo'lsa mijozga xabar.

## 2. Asosiy qoida: kim nima qiladi

| Ishtirokchi | Qiladi | Qilmaydi |
|---|---|---|
| **AI** | Eshitadi, o'qiydi, tovarni topadi, noaniqni belgilaydi | Hech qachon yig'indi hisoblamaydi, bazaga yozmaydi |
| **Savdogar** | Tasdiqlaydi, noaniqni hal qiladi | Qo'lda hisoblamaydi |
| **Kod** | Hisoblaydi (ikki marta, mustaqil), bazaga yozadi | Taxmin qilmaydi |

## 3. Agentlar jamoasi (har biri bitta vazifa)

| Agent | Vazifasi |
|---|---|
| Spiska agenti | Ovoz/rasmdan qatorlarni ajratadi |
| Moslovchi agent | Qatorni bazadagi tovarga moslaydi (sinonimlar bilan) |
| Kirim agenti | Nakladnoy/yuk xatidan kirimni o'qiydi |
| Ombor nazoratchisi | Qoldiq = kirim − chiqim tekshiruvi, kun oxirida |
| O'rnatish agenti | Yangi mijoz bazasini boshlang'ich ma'lumotdan to'ldiradi |
| Xabar agenti | Mijozga Telegram/SMS xabar (faqat mijozga, savdogar bilan emas) |

## 4. Bitta sotuv, qadamma-qadam (namuna)

Karim aka spiskasi:

| Tovar | Soni | Narxi | Summa |
|---|---|---|---|
| chirmoq | 10 | 13 000 | 130 000 |
| yurak | 5 | 15 000 | 75 000 |
| momiq | 20 | 9 000 | 180 000 |
| **Jami** | | | **385 000** |

Namuna ma'lumot, haqiqiy mijoz emas.

## 5. Xatoga qarshi 6 qatlam

1. Savdogar tasdiqlamaguncha hech narsa yozilmaydi.
2. Noaniq qatorlar **sariq** bilan ajratiladi, savdogar hal qiladi.
3. Hisob kodda ikki marta, bir-biriga bog'liq bo'lmagan yo'l bilan; mos kelmasa to'xtaydi.
4. Faqat qo'shiladigan jurnal (append-only): xato tuzatish teskari yozuv bilan, o'chirib emas.
5. Kun oxiri tekshiruvi: qoldiq = kirim − chiqim.
6. Oflayn navbat: internet yo'q bo'lsa saqlanadi, keyin yuboriladi.

Pitch jumlasi: **"Xato yozilmaydi, joyida ushlanadi."**

## 6. Soddalik: savdogar uchun 3 harakat

Gapiradi → tasdiqlaydi → ko'radi.

## 7. Raqiblardan farqi

Raqiblar kiritishni qo'lda qoldiradi (yoki qisman AI). Biz: ovoz/rasm kiritish, noaniqni so'rash, hisobni kodga ishonish, ikki marta tekshirish. Aniq raqib tahlili: [RAQIBLAR.md](RAQIBLAR.md). Eng yaqinlari: pDaftar va Linko.

## 8. Texnik qatlamlar

| Qatlam | Mazmuni |
|---|---|
| Ilova | Mobil + kompyuter, bitta umumiy baza |
| Agentlar | Yuqoridagi 6 ta, har biri alohida |
| Hisob yadrosi | Sof kod, AI chaqirilmaydi; ikki marta hisob |
| Baza | Haqiqiy baza (Postgres/Supabase kabi). Google Sheets uzoq muddatga yetmaydi |

## 9. Ochiq savollar

- Ovozni matnga aylantirish (STT) o'zbekcha aniqligi: Aisha, Muxlisa, UzbekVoice sinaladi.
- Rasmdan o'qish (OCR) qo'lyozma spiskada aniqligi.
- Oflayn rejimda ikki qurilma to'qnashuvi qanday hal qilinadi.
- Tovar bazasini birinchi marta qanday to'ldirish (o'rnatish agenti).
