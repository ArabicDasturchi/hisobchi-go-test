# Mahsulot nomlaridagi gumonli joylar (faqat ro'yxat, nom o'zgartirilmagan)

Sana: 2026-11-10. Holat: ro'yxat. **Hech bir tovar nomi avtomatik o'zgartirilmagan** (nomlarni avtomatik tozalash PANEL-3 doirasida emas).

## Qoida
Eng ko'p uchraydigan xato: sotuv narxi nomga yozilib qolgan ("Атиргул 7 500"). `apps/web/src/lib/productNameIssues.ts` (`priceInName`) nom oxirida kamida 4 xonali yoki ming ajratuvchili son borligini aniqlaydi. U faqat **aniqlaydi**; to'g'rilashni savdogar o'zi qiladi (Mahsulotlar sahifasida nomni ikki marta bosib tuzatadi, narxni alohida katakka kiritadi).

## PDF (HisobchiGo-oynalar-V3.pdf) da ko'ringan namunalar
Bu faqat maketdagi ko'rinadigan nomlar; haqiqiy baza ro'yxati emas.

| Nom (maketda) | Gumon | Taklif (savdogar qiladi) |
|---|---|---|
| Атиргул 7 500 | narx nomda (7 500) | Nom: "Атиргул", sotuv narxi: 7 500 |
| Атиргул 8 000 | narx nomda (8 000); yuqoridagi bilan bir xil tovar bo'lishi mumkin (ikki narx) | Bitta tovar yoki ikki xil tur ekanini aniqlang |
| Лен 5 500 | narx nomda | Nom: "Лен", narx: 5 500 |
| Хермес 59 000 | narx nomda | Nom: "Хермес", narx: 59 000 |

Eslatma: "18ли набор", "2ли гул", "2ли дарахт", "5тали", "6ли горох" kabi nomlar raqam bilan boshlanadi (o'lcham/dona belgisi bo'lishi mumkin); bu narx emas, shuning uchun detektor ularni belgilamaydi.

## Haqiqiy bazada ro'yxat olish
Do'kon bazasida (faqat o'qish) shu so'rov bilan to'liq ro'yxat chiqadi:

```sql
select name, last_price
from products
where shop_id = '<do'kon id>' and is_active
  and name ~ '(^|\s)(\d{1,3}( \d{3})+|\d{4,})\s*$'
order by name;
```

Natijani shu faylga qo'shing (nom va narx, telefon yoki shaxsiy ma'lumotsiz). Nomlarni o'zgartirish savdogarning qarori.
