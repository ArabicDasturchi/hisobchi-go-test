# Asoschi maqsadi va ilovaga asosiy talablar

Sana: 10.11.2026. Yozdi: arxitektor-Claude, asoschi Abdulloh Ismoilov so'zlaridan va repodagi qarorlardan (TZ-MVP, QARORLAR, CLAUDE.md). Bu hujjat "nima uchun" va "nima bo'lishi kerak" degan savolga javob beradi. "Qanday qurilgan" uchun: [HUMOYUN-BACKEND.md](HUMOYUN-BACKEND.md), [ARXITEKTURA.md](ARXITEKTURA.md).

## 1. Maqsad

Bozor savdogari daftar va ruchkadan voz kechib, **o'z do'konini ilovada o'zi, kimdandir yordam so'ramasdan** yuritadigan bo'lsin. Savdogar texnik odam emas. Ilova uning gapini tushunishi, hisobni xatosiz qilishi va hech narsani o'zboshimchalik bilan saqlamasligi kerak.

Pitchdagi bitta gap: **AI tushunadi, kod hisoblaydi, siz tasdiqlaysiz.**

## 2. Hozirgi holat (asoschi bahosi, 10.11.2026)

Ilova hali maqsadga o'xshamayapti: foydalanishda xatolar ko'p, oynalar o'zaro mos emas. Asoschi qarori: ilovani chiziqma-chiziq tuzatish o'rniga **backendni to'liq audit qilib**, kamchiliklarini to'ldirib, ilovani yaxlit loyihaga aylantirish. Bu ishni Humoyun Anvarjon boshqaradi ([HUMOYUN-BACKEND.md](HUMOYUN-BACKEND.md)). Frontend maketi: [HisobchiGo-oynalar-V3.pdf](../HisobchiGo-oynalar-V3.pdf) va [ASOSIY-SAHIFA.md](ASOSIY-SAHIFA.md).

## 3. Buzilmaydigan qoidalar (CLAUDE.md bilan bir xil)

1. AI hech qachon yig'indi hisoblamaydi va bazaga yozmaydi. AI faqat matnni tuzilmaga (tovar, soni, narxi) aylantiradi.
2. Hisob ikki mustaqil yo'l bilan (TypeScript va SQL). Mos kelmasa to'xtaydi va xato ko'rsatadi.
3. Savdogar tasdiqlamaguncha hech narsa saqlanmaydi. Noaniq qator sariq, hal qilinmaguncha tasdiqlab bo'lmaydi.
4. Jurnal faqat qo'shiladi. Tuzatish teskari yozuv bilan, sabab majburiy.
5. Pul butun so'm, miqdor `qty_milli` (butun son). Suzuvchi nuqta yo'q.
6. Har do'kon ma'lumoti boshqasidan to'liq ajratilgan.
7. Kalit, parol, mijoz telefoni repoga yozilmaydi.

## 4. Savdogar nimani qila olishi kerak (asosiy talablar)

**T1. Gapirib yoki yozib savdo kiritish.** "Karim akaga o'nta chirmoq o'n uch mingdan, beshta yurak o'n besh ming" degan erkin gapdan ro'yxat chiqadi, savdogar ko'zdan kechirib tasdiqlaydi. Jami 385 000 (10×13 000 + 5×15 000 + 20×9 000 namunasi) kod hisoblaydi. *Hozir:* qat'iy formatdagi matn ishlaydi; erkin gapni AI tushunishi (T1/T2 vazifalari) **hali qurilmagan**.

**T2. Yuk xati suratidan kirim.** Nakladnoyni suratga olsa, barcha qatorlar kirimga o'zi tushadi; qator summasi yuk xatidagi bilan solishtiriladi. *Hozir:* yo'q (faqat qo'lda kirim bor).

**T3. Qarz daftari.** Har mijoz va ta'minotchi uchun oldi-berdi: eski qoldiq, savdo/kirim, to'lov, ostatka. Qisman to'lov tabiiy ishlaydi. Daftar faqat o'qiladi, yozuv panel orqali.

**T4. Ombor.** Qoldiq jurnaldan hisoblanadi (kirim, savdo, tuzatish), qo'lda ustiga yozilmaydi. Kam qolgan tovar ko'rinadi.

**T5. Hamma narsani joyida tuzatish.** Mahsulot, mijoz, ta'minotchi, qoralama qatorlari jadvalning o'zida tuzatiladi. Pul yozuvlari ustiga yozilmaydi: bekor qilish + qayta yozish.

**T6. Bitta boshqaruv paneli.** Kiritish oynasi **faqat panelda** (Amal: Savdo, To'lov olish, Kirim, Ta'minotchiga to'lov, Daftarga yozish). Qolgan bo'limlar oddiy sahifa: PC da chap menyu, telefonda pastki menyu. Hisobotlar alohida sahifa. Mahsulot/Ombor sahifalarida tan narx va foyda ko'rsatilmaydi (mijoz ro'yxatni ko'rib turishi mumkin). Bu ilovaning eng katta kuchi: interaktiv kiritish oynasi.

**T7. Ishonch.** Hisob xatosi yo'q; adashgan odam sariq belgi bilan ushlanadi; ikki qurilmadan yozilganda ma'lumot to'qnashmaydi; tarmoq uzilsa ikki marta yozilmaydi.

**T8. Tashqi AI agent (MCP).** Asoschi Claude/ChatGPT orqali ko'rishi, mijoz/tovar qo'shishi va savdo/to'lov/kirim **qoralamasi** yaratishi mumkin. Tasdiqlash faqat ilovada.

**T9. Platforma egalari paneli** (`apps/admin`): faqat o'qish, do'konlar faolligi va voronka, summa va mijoz nomlarisiz.

## 5. Sifat talablari

- Savdogar uchun oddiy o'zbekcha matn, minimal kiritish, katta bosish joylari (≥44px), telefonda va kompyuterda ishlaydi.
- Haqiqiy ma'lumotda sinalmagan narsa "ishlaydi" deb yozilmaydi.
- Har yangi mantiq uchun test; xatoni ushlashi tekshiriladi.
- Migratsiya production'ga faqat asoschi so'zi bilan.
- Maxfiylik: platforma admini ham do'kon summalarini va mijoz ismlarini ko'rmaydi.

## 6. Hozircha doirada emas

Telegram/SMS eslatma, Bluetooth chop etish, QR skaner, ommaviy MCP, iOS do'kon versiyasi, ko'p sahifali yuk xati ([VAZIFALAR-ICE.md](VAZIFALAR-ICE.md) da past ball).

## 7. Muvaffaqiyat o'lchovi

Savdogar ilovani nima uchun sotib oladi? Bitta gapda: "ovozim bilan savdoni yozaman, hisob xatosiz, qarzlar daftarda". Tekshiruv: haqiqiy savdogar (Sochiq market va boshqalar) ilovadan yordamsiz 1 kun foydalansin, so'ng pul to'lashga rozi bo'ladimi (G1, H1, H3: [VAZIFALAR-ICE.md](VAZIFALAR-ICE.md)).
