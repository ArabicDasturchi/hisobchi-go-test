# Gemini akkauntini ilova ichidagi AI miyyasi qilish mumkinmi?

Sana: 02.11.2026. Holat: **tadqiqot natijasi**. Manbalar uchinchi tomon maqolalari; qaror oldidan Google rasmiy sahifasida tekshirilsin.

## Xulosa

**Yo'q, Gemini Pro (Google AI Pro) obunasini to'g'ridan-to'g'ri ilovaga ulab bo'lmaydi.**

- AI Pro API kalit va yuqori API limit **bermaydi**. U Gemini ilovasi va Google'ning o'z vositalari uchun.
- AI Pro bilan oyiga **$10 Google Cloud krediti** beriladi (Developer Program orqali), uni Gemini API'ga sarflash mumkin. Faollashtirish: My Benefits sahifasi, billing akkaunt tanlanadi. Har oylik kredit 1 yilda tugaydi.
- API kalit alohida: **Google AI Studio** dan olinadi.
- Obuna loginini uchinchi tomon dasturida ishlatish Antigravity FAQ bo'yicha Shartlarni buzish hisoblanadi. Qilmaymiz.

## Ilova uchun to'g'ri yo'l

Gemini API (AI Studio kaliti), serverda saqlanadi (Supabase Edge Function secret), mobil ilovaga yozilmaydi.

## Muhim xavf: maxfiylik

- Bepul darajada kontent "mahsulotlarni yaxshilash uchun ishlatiladi" deb belgilangan.
- Pullik darajada ("billing akkaunt ulangan") ishlatilmaydi.
- Savdogar ma'lumoti (mijoz, qarz) bor, shuning uchun **ishlab chiqarishda faqat pullik daraja**. Bepul daraja faqat o'zimizning sintetik test ma'lumoti bilan.
- Bepul daraja O'zbekistonda mavjudligi **topilmadi**; tekshirish kerak.

## 18 oylik taklif

Topilgan taklif (Jio) faqat **Hindiston**, Jio foydalanuvchilari uchun. O'zbekiston uchun shunday taklif **topilmadi**. Ko'pchilikda bor degani O'zbekistonda ham degani emas; foydalanuvchining o'z akkaunti shartini My Benefits sahifasida ko'rish kerak.

## Vazifa

1. Asoschi o'z akkauntida AI Studio kalitini oladi va qaysi darajada ekanini (bepul/pullik, kredit) tekshiradi.
2. Humoyun Claude'i LLM chaqiruvini provayderga bog'liq bo'lmagan qatlam (adapter) orqali yozadi: Gemini bugun, Claude/boshqasi ertaga.
3. Xarajatni o'lchash: bitta savdo tahlili necha token (narx hisobi `docs/` da alohida).
4. AI faqat matn -> tuzilma. Hisob kodda.
