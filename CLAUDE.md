# Hisobchi Go — Claude Code uchun ko'rsatma

Savdogar spiskasini ovoz/rasm orqali tushunib, kod bilan hisoblaydigan ilova. Jamoa: Abdulloh Ismoilov, Humoyun Anvarjon. Til: o'zbekcha (lotin), qisqa javoblar.

## Eng muhim qoidalar

1. **AI hech qachon yig'indi hisoblamaydi va bazaga yozmaydi.** AI faqat matnni tuzilmaga (tovar, soni, narxi) aylantiradi.
2. Hisob sof kodda, **ikki mustaqil yo'l** bilan. Mos kelmasa to'xtaydi va xato ko'rsatadi.
3. Savdogar tasdiqlamaguncha hech narsa saqlanmaydi. Noaniq qatorlar sariq.
4. Jurnal faqat qo'shiladi (append-only). Tuzatish teskari yozuv bilan.
5. Pul summalari butun son (so'm), suzuvchi nuqta ishlatilmaydi.
6. Kalitlar, parollar, mijoz telefon raqamlari repoga yozilmaydi. `.env` gitignore da.

## Stack

Expo (React Native) + TypeScript, Supabase (Postgres, Edge Functions), monorepo: `apps/mobile` (asosiy), `apps/web` (Next.js panel), `apps/mcp`, `packages/core`, `supabase/`. Hisob kodi faqat `packages/core` da (SQL ikkinchi yo'l `supabase/migrations` da).

## MVP tamoyili

MVP: savdogar pul to'laydigan **bitta to'liq ishlaydigan** qiymat, o'nta yarimta funksiya emas. Har yangi ish oldidan savol: "Bu savdogarni pul to'lashga yaqinlashtiradimi?" Navbat: [docs/VAZIFALAR-ICE.md](docs/VAZIFALAR-ICE.md).

## Hujjatlar

- [docs/TZ-MVP.md](docs/TZ-MVP.md) — MVP vazifasi (v2: ovozli savdo, suratdan kirim)
- [docs/VAZIFALAR-ICE.md](docs/VAZIFALAR-ICE.md) — vazifalar navbati, ish bo'linishi (kim qaysi fayllarda ishlaydi)
- [docs/ARXITEKTURA.md](docs/ARXITEKTURA.md) — tuzilma
- [docs/QARORLAR.md](docs/QARORLAR.md) — qarorlar jurnali
- [docs/MCP-AGENT.md](docs/MCP-AGENT.md) — MCP server (`apps/mcp`): faqat o'qish + qoralama, tasdiqlash faqat ilovada
- [docs/MUAMMOLAR.md](docs/MUAMMOLAR.md), [docs/SUHBATLAR.md](docs/SUHBATLAR.md), [docs/RAQIBLAR.md](docs/RAQIBLAR.md) — dalillar

## Ish tartibi

- O'zgarishdan oldin TZ, VAZIFALAR-ICE va qarorlarni o'qi; qarorga zid ish qilmaydigan bo'l.
- Ikki Claude Code parallel ishlaydi: faqat o'z hududingdagi fayllarni o'zgartir (VAZIFALAR-ICE, 3-bo'lim). `main` ga o'zing merge qilma.
- `docs/arxiv/` dagi hujjatlar eskirgan: ularga tayanma.
- Hisob modulini har o'zgarishda testlar bilan tekshir (namuna: 10×13 000 + 5×15 000 + 20×9 000 = 385 000).
- Faktni to'qima: topilmasa "topilmadi" deb yoz.
- Kichik commitlar, tushunarli xabarlar.
