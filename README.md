# Hisobchi Go

Bozor savdogarining ombori va daftari telefonda. Savdogar gapiradi yoki suratga oladi, AI tushunadi, savdogar tasdiqlaydi, kod hisoblaydi.

> AI tushunadi, savdogar tasdiqlaydi, kod hisoblaydi. **Xato yozilmaydi, joyida ushlanadi.**

## Nega sotib olinadi (MVP qiymati)

MVP: eng kichik, lekin savdogar pul to'laydigan bitta ishlaydigan qiymat (Sardor aka, IT Park). Bizda ikkita va'da:

1. **Ovozli savdo.** Bugun har mijozga spiska qog'ozga yoziladi va kalkulyatorda hisoblanadi. Bizda ovozli xabar yuborasiz, AI ro'yxat tuzadi, siz tekshirib tasdiqlaysiz va to'lovni qabul qilasiz.
2. **Suratdan kirim.** Dastur ishlatadiganlar ham kelgan 100 tovarni 100 marta qo'lda kiritadi. Bizda yuk xatini suratga olasiz, barcha qatorlar o'zi kiritiladi.

Fon: hisob ikki mustaqil yo'l bilan tekshiriladi, qarz va kirim/chiqim daftarlari yuritiladi.

## Loyiha aslida qanday bo'lishi kerak

- **Savdogar uchun:** telefonda oddiy ilova. Asosiy panel: katalog (sotuv narxi) va katta "Savdo" tugmasi. Menyu: ombor (tan narx, qoldiq), kirim daftari (ta'minotchilar), chiqim daftari (mijozlar), qoralamalar.
- **Mexanik ishni agentlar qiladi:** ovozdan spiska, suratdan kirim, tovarni katalogdan topish. Har biri bitta vazifali.
- **Hech narsa tasdiqsiz yozilmaydi.** Noaniq qator sariq. Hisob faqat kodda, ikki marta.
- **Oflayn ishlaydi** (telefondagi SQLite), internet bo'lganda bulutga yuboradi.
- **Bitta funksiya to'liq ishlasin**, o'nta yarimta emas.

## Hozirgi holat (03.11.2026)

Bor: matn bilan savdo (qat'iy format), tasdiqlash va sariq qatorlar, ikki hisob, mijozlar, qarz, to'lov, katalog, hisobot, bulut sinxronizatsiyasi, veb panel, MCP (Claude orqali ko'rish va qoralama).
Yo'q: AI tushunish (LLM), ishonchli ovoz, surat/kirim, ombor, ta'minotchi, o'rnatiladigan APK. Batafsil: [docs/TZ-MVP.md](docs/TZ-MVP.md), 1-bo'lim.

## Ish tartibi

1. Navbatdagi ish [docs/VAZIFALAR-ICE.md](docs/VAZIFALAR-ICE.md) dan, yuqoridan pastga (ICE bali). Ishonch past bo'lsa, avval kichik sinov (HADI).
2. Har vazifa: reja, kichik commitlar, alohida PR, `npm test` va `npm run typecheck` yashil.
3. Ikki Claude Code parallel ishlaydi, har biri o'z hududida (VAZIFALAR-ICE, 3-bo'lim).
4. Migratsiya `005_`, `006_` tartibida yoziladi, `main` ga merge bo'lganda CI qo'llaydi.
5. Qaror o'zgarsa [docs/QARORLAR.md](docs/QARORLAR.md) ga yangi qator; eski hujjatlar `docs/arxiv/` ga.

## Jamoa

Unikorumlar: Abdulloh Ismoilov (mahsulot, savdogarlar bilan sinov), Humoyun Anvarjon (mobil, AI funksiyalar). IT Park Andijon inkubatsiyasi.

## Hujjatlar

| Hujjat | Mazmuni |
|---|---|
| [docs/TZ-MVP.md](docs/TZ-MVP.md) | MVP texnik topshiriq (v2): ovozli savdo va suratdan kirim |
| [docs/VAZIFALAR-ICE.md](docs/VAZIFALAR-ICE.md) | Vazifalar navbati (ICE), HADI gipotezalari, ish bo'linishi |
| [docs/prompts/](docs/prompts/) | Claude Code uchun vazifa promptlari |
| [docs/QARORLAR.md](docs/QARORLAR.md) | Qarorlar jurnali |
| [docs/ARXITEKTURA.md](docs/ARXITEKTURA.md) | Tuzilma, himoya qatlamlari |
| [docs/MCP-AGENT.md](docs/MCP-AGENT.md) | MCP server (Claude/ChatGPT) |
| [docs/GEMINI-LLM.md](docs/GEMINI-LLM.md) | AI provayder tadqiqoti |
| [docs/ISH-TARTIBI.md](docs/ISH-TARTIBI.md) | Ish tartibi: kichik PR, trunk-based, squash |
| [docs/VEB-DAN-MOBILGA.md](docs/VEB-DAN-MOBILGA.md) | Mobilga ko'chiriladigan o'zgarishlar (mobil muzlatilgan) |
| [docs/MIGRATSIYA-CI.md](docs/MIGRATSIYA-CI.md) | Migratsiyalar avtomatik qo'llanishi (GitHub Actions) |
| [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md) | Supabase, sinxronizatsiya |
| [docs/TELEFONDA_SINASH.md](docs/TELEFONDA_SINASH.md) | Telefonda ishga tushirish |
| [docs/MUAMMOLAR.md](docs/MUAMMOLAR.md), [docs/SUHBATLAR.md](docs/SUHBATLAR.md), [docs/RAQIBLAR.md](docs/RAQIBLAR.md), [docs/BOZOR-TAM-SAM-SOM.md](docs/BOZOR-TAM-SAM-SOM.md) | Dalillar: muammolar, 15 suhbat, raqiblar, bozor hajmi |
| [CLAUDE.md](CLAUDE.md) | Claude Code uchun qoidalar |

## Ishga tushirish

**Demo (kalitsiz, soxta ma'lumot, 3 qadam):**

```bash
npm ci
npm run demo
# brauzerda http://localhost:3000 (veb panel, soxta ma'lumot, faqat ko'rish)
```

Demo: 9 tovar, ta'minotchi, mijoz, kirim 1 450 000 / ostatka 450 000, savdo 385 000, bir martalik savdo, AI qoralamasi. Mobil web demo tayyor, lekin mobil muzlatilgan: [docs/VEB-DAN-MOBILGA.md](docs/VEB-DAN-MOBILGA.md).

Telefonda: [docs/TELEFONDA_SINASH.md](docs/TELEFONDA_SINASH.md). Sozlamalar: `.env.example`. Testlar: `npm test`, `npm run typecheck`. Ish tartibi: [docs/ISH-TARTIBI.md](docs/ISH-TARTIBI.md).
