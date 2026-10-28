# Hisobchi Go — MVP texnik topshiriq (TZ)

Maqsad: ertaga ko'rsatiladigan, ochiladigan va ishlaydigan MVP. Bepul joyga (Vercel) joylanadi.

## 1. MVP nimani isbotlaydi

Savdogar spiskani yozadi (yoki aytadi), tizim tushunadi, savdogar tasdiqlaydi, kod hisoblaydi, natija ko'rinadi. Bu yagona oqim.

## 2. Foydalanuvchi oqimi

1. **Kiritish ekrani:** matn maydoni + mikrofon tugmasi (+ rasm yuklash, keyingi bosqich). Namuna: "chirmoq 10 ta 13 ming, yurak 5 ta 15 ming, momiq 20 ta 9 ming".
2. **Tushunish:** AI qatorlarni ajratadi: tovar, son, narx.
3. **Tasdiqlash ekrani:** jadval (tovar, son, narx, summa). Noaniq qator sariq. Savdogar tahrirlaydi, "Tasdiqlayman" bosadi.
4. **Hisob:** kod ikki mustaqil yo'l bilan hisoblaydi. Mos kelmasa "To'xtadi" xabari.
5. **Natija:** jami summa, mijoz ismi, sana. Mijoz daftariga yoziladi.
6. **Daftar:** mijozlar ro'yxati va har birining sotuv tarixi (faqat qo'shiladigan yozuvlar).

## 3. MVP ga kiradi / kirmaydi

| Kiradi | Kirmaydi (keyin) |
|---|---|
| Matn va ovoz orqali kiritish | Rasm/OCR |
| Tasdiqlash ekrani, sariq noaniq qatorlar | Ombor, kirim agenti |
| Ikki marta hisob | O'rnatish agenti |
| Mijoz daftari | Telegram/SMS xabar |
| Mobilga moslashgan veb-ilova | Alohida mobil ilova, oflayn navbat |

## 4. Texnik talablar

- Veb-ilova, telefonda ham qulay (mobile-first).
- Hisob mantig'i alohida modul, AI dan mustaqil, testlari bor.
- AI faqat matnni tuzilmaga aylantiradi (JSON: tovar, soni, narxi, ishonch darajasi).
- Baza: Supabase (yoki shunga o'xshash). Jurnal faqat qo'shiladi, o'chirilmaydi.
- Kalitlar `.env` da, repoga yozilmaydi (`.env.example` ga qarang).
- Interfeys tili: o'zbekcha (lotin).

## 5. Qabul mezonlari

- [ ] Namuna spiska (Karim aka, 385 000) to'g'ri chiqadi.
- [ ] Noaniq qator sariq ko'rinadi va tasdiqsiz yozilmaydi.
- [ ] Ikki hisob farq qilsa saqlanmaydi.
- [ ] Tasdiqdan keyin mijoz tarixida ko'rinadi.
- [ ] Ommaviy havola orqali telefondan ochiladi.

## 6. 3 daqiqalik namoyish

1. Muammo (20 s): qo'lda kiritish, kalkulyator xatosi.
2. Spiskani aytish/yozish (30 s).
3. Tasdiqlash va sariq qator (40 s).
4. Natija va daftar (30 s).
5. "Xato yozilmaydi, joyida ushlanadi" va raqiblardan farq (30 s).
6. Keyingi qadam: rasm, ombor, 50 suhbat (30 s).

## 7. Ish taqsimoti (taklif)

- Abdulloh: mahsulot, namuna ma'lumot, namoyish, savdogar bilan test.
- Humoyun: frontend, deploy.
- Claude Code: yadroni va ekranlarni yozishda yordam (CLAUDE.md ga qarang).
