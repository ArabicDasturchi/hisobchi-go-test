# Do'kon ilovasi (`apps/web`): bosilmaydigan joylar ro'yxati (audit)

Sana: 09.11.2026. **Faqat ro'yxat, tuzatilmagan.** Usul: kodni o'qib chiqish (`apps/web/src`), brauzerda va haqiqiy ma'lumotda **sinalmagan**.
Har qatorda: qayerda · nima bosilishi kerak · qayerga olib borishi kerak.

## Bosh sahifa (`/dashboard`)

| # | Joy | Hozir | Qayerga olib borishi kerak |
|---|---|---|---|
| 1 | «Bugun» kartalari: **Savdo** (`StatCard`) | Bosilmaydi, lekin hover'da rangi o'zgaradi (bosiladigandek ko'rinadi) | `/sales` (bugungi savdolar; hozir `/sales` da sana filtri URL orqali berilmaydi, 4-qatorga qarang) |
| 2 | **Foyda** kartasi | Bosilmaydi | `/dashboard/report` (foyda hisoboti). Ogohlantirish matni («N qator hisobga kirmadi») → tan narxi yo'q tovarlar ro'yxati (`/products`) |
| 3 | **Kassa** kartasi | Bosilmaydi | `/dashboard/report` (kassa tarkibi: naqd savdo, to'lovlar, chiqim) |
| 3a | Grafik kartasi (savdo + foyda) | Bosilmaydi | `/dashboard/report` |
| — | «Menga qarzdorlar» / «Men qarzdorman» ro'yxatlari, «Diqqat», «So'nggi savdolar» | Bosiladi (havolalar bor) | Muammo yo'q |

Asosiy sabab: `StatCard` (`components/shared.tsx`) `href` qabul qilmaydi, lekin `hover:border-emerald-300/60` bilan «bosiladigan» ko'rinadi. Barcha 4 ta shu komponentdan (Bosh sahifa va Hisobot).

## Savdolar (`/sales`)

| # | Joy | Hozir | Kerak |
|---|---|---|---|
| 4 | Holat filtri (Hammasi / Bekor qilingan) va sana oralig'i | Faqat komponent holati (`useState`); URL parametri yo'q | `?status=reversed`, `?from=&to=` o'qilsin, shunda Bosh sahifa «Savdo» kartasi va Hisobot «Bekor qilingan» kartasi to'g'ri filtrlangan ro'yxatga olib borsin |

Jadval qatorlari bosiladi (`router.push`).

## Hisobot (`/dashboard/report`)

| # | Joy | Hozir | Kerak |
|---|---|---|---|
| 5 | «Savdo (davrda)» kartasi | Bosilmaydi | `/sales?from=&to=` (shu davr) |
| 6 | «Bekor qilingan» kartasi | Bosilmaydi | `/sales?status=reversed&from=&to=` |
| 7 | «To'lovlar (davrda)» kartasi | Bosilmaydi | `/customers` (to'lovlar mijoz varag'ida; alohida to'lovlar sahifasi M1 da olib tashlangan) |
| 8 | «Joriy qarzdorlik» kartasi | Bosilmaydi | `/customers?filter=debt` |
| 9 | Jadval qatorlari (savdolar, to'lovlar, mijozlar) | Faqat raqam/ism havolasi, qator bosilmaydi | Butun qator → `/sales/[id]` yoki `/customers/[id]` (Savdolar sahifasidagidek) |
| 10 | Ta'minotchi/tovar jadvallari (bo'lsa) | Havola yo'q | `/suppliers/[id]`, `/products` |

## Mijozlar (`/customers`)

| # | Joy | Hozir | Kerak |
|---|---|---|---|
| 11 | Qarz kartasi: **Jami qarz**, **Qarzdorlar**, **30 kundan oshgan qarz** | Bosilmaydi | Jami qarz va Qarzdorlar → `?filter=debt` (qarz kattasi tartibida); 30+ kun → `?filter=aged` (yangi filtr: `agedDebt` bo'yicha shu mijozlar). Hozir bu filtr yo'q |

Ro'yxat qatorlari bosiladi.

## Ta'minotchilar (`/suppliers`)

| # | Joy | Hozir | Kerak |
|---|---|---|---|
| 12 | «Mening qarzim» kartasi (jami qarz, qarzim bor ta'minotchilar soni) | Bosilmaydi | Qarzim bor ta'minotchilar filtri (`?filter=debt`, ro'yxatdagi «Qarzim bor» segmenti shu) |

Ro'yxat qatorlari bosiladi.

## Ombor (`/warehouse`)

| # | Joy | Hozir | Kerak |
|---|---|---|---|
| 13 | **Qoldiq** tabi: tovar qatori | Bosilmaydi (faqat «Tuzatish» tugmasi) | Tovar tahriri (`/products` da shu tovar) yoki tovar harakati tarixi |
| 14 | Qoldiq tabidagi manfiy qoldiq ogohlantirishi | Bosilmaydi | Manfiy qoldiqli tovarlar filtri |
| 15 | **Chiqim** tabi: tovar jami qatori (`t.productId`) | Bosilmaydi | Shu tovarning harakatlari (savdolari) |
| 16 | **Kirim** tabi: kirim qatori | Faqat ta'minotchi nomi havola | Butun qator → ta'minotchi varag'idagi shu kirim (`/suppliers/[id]`) |

Chiqimda savdo havolasi (`/sales/[documentId]`) bor.

## Mahsulotlar (`/products`)

| # | Joy | Hozir | Kerak |
|---|---|---|---|
| 17 | Jadval qatori | Faqat «Tahrirlash» (qalam) tugmasi bosiladi, qator emas | Butun qator → tahrirlash oynasi (Savdolar, Mijozlar, Ta'minotchilar'dagidek) |

## Qoralamalar (`/drafts`)

| # | Joy | Hozir | Kerak |
|---|---|---|---|
| 18 | Tepadagi hisoblagichlar kartalari (kutayotgan / tasdiqlangan / rad etilgan; `Card` x3) | Bosilmaydi (aniqlash kerak: kartalar filtr vazifasini bajarishi kerak) | Shu holat bo'yicha filtr |

## Umumiy tavsiya

1. `StatCard` ga ixtiyoriy `href` qo'shish (bosiladigan bo'lsa `Link`, kursor, hover, focus); `href` yo'q kartada hover rangini olib tashlash.
2. Ro'yxat sahifalariga URL parametrlari (`status`, `from`, `to`, `filter=aged`): kartalardan chuqur havola uchun.
3. Jadval qatori naqshi bitta komponentda (`router.push` + Enter/Space, `tabIndex`, `stopPropagation` nom havolasida), Savdolar/Mijozlar/Ta'minotchilar'da bor, Mahsulotlar, Hisobot va Ombor'da yo'q.

> 18-qator va 13/15 qatorlari kod bo'yicha qisman tekshirilgan (komponent tuzilmasi o'qildi, ekranda ko'rilmadi). Tuzatishdan oldin sahifani ochib tasdiqlang.
