# Web MVP xatolari: `fix/web-mvp-errors` (11.11.2026)

Branch: `fix/web-mvp-errors`, base `origin/main` = `e0de049`. Repo: `abdullohismoilov777-debug/hisobchi-go`.
Holat: **PR ochiq, merge qilinmagan.** Production migratsiya va deploy qilinmagan. Haqiqiy Supabase va brauzerda sinalmagan.

## 1. Nima qilindi

Ochiq web PR'lari bitta branchga ketma-ket birlashtirildi (merge commitlar). Ikki xatolik tuzatildi va testlar qo'shildi.

| Tartib | Manba PR | Vazifa | Natija |
|---|---|---|---|
| 1 | #42 `fix/web-lint-ci` | W16 (`useBooks` lint va eskirgan javob poygasi), W17 (ishlatilmagan import), CI'ga «Veb lint» | toza |
| 2 | #48 `fix/web-lint-warnings` | `lint` skriptida `--max-warnings=0` | toza |
| 3 | #46 `fix/w4-tovar-identifikatori` | W4: savdo qatori `product_id` bilan; takroriy nom+birlik bloklanadi | toza |
| 4 | #47 `fix/w5-kirim-birlik` | W5: kirimda birlik; yangi tovar faqat to'liq tekshiruvdan keyin | **to'qnashuv** `PanelWorkspace.tsx` importlari — ikkalasi saqlandi |
| 5 | #50 `fix/w3-w10-atomik-savdo` | W3: `post_sale(p_paid)` bitta tranzaksiya; W10: mijozsiz savdo bir martalik mijoz va to'lov bilan | `QARORLAR.md` (qatorlar birlashtirildi) |
| 6 | #44 `fix/w1-bekor-tolov` | W1: bekor qilishda to'lov ham (013 RPC) | **to'qnashuv** `sales/[id]/page.tsx` — `customer.kind !== 'one_time'` va `RefundChoice` ikkalasi saqlandi; `QARORLAR.md` |
| 7 | #49 `fix/w2-taminotchi-qarz-yozuvi` | W2: ta'minotchi daftar yozuvi `post_supplier_debt` (013 RPC) | toza |
| 8 | yangi commit `90d70f1` | 013 yo'q serverda W1/W2 regressiya bermasligi | — |
| 9 | yangi commit `80c9071` | W1: 013 yo'q serverda bekor qilish tanlovi qulfda qolmasligi (tanqidchi topilmasi) | — |
| 10 | yangi commit `61cc20c` | `isRpcMissing` qattiqlashtirildi: faqat RPC yo'qligi aniq bo'lganda | — |
| 11 | yangi commit `2b07ae4` | `isRpcMissing(err, rpc)`: xabarda aynan chaqirilgan RPC nomi bo'lishi shart | — |

### Kiritilmagan (ataylab)
- **W6 (#45, kassa faqat naqd)** — `docs/QARORLAR.md` 05.11 qarori bilan zid. Qarorda: «kassa = mijozsiz savdo + qabul qilingan to'lovlar (**usuldan qat'i nazar**) − ta'minotchiga NAQD to'lovlar; karta/o'tkazma ham kassaga kiradi; usul bo'yicha ajratish savdogar talab qilsa». **Asoschi qarori kerak.** Bu branchda `packages/core` o'zgarmagan, kassa avvalgi qoida bo'yicha.
- **013 SQL (#43)** — backend. W1 va W2 ning to'liq ishlashi 013 production'ga qo'llanishiga bog'liq (3-bo'lim).
- #51 (hujjatlar).

## 2. Yangi tuzatishlar (bu branchda)

### 2.1 013 qo'llanmagan server (`90d70f1`)
- **Muammo:** #44 va #49 013 dagi yangi RPC'larni chaqiradi. 013 production'da yo'q bo'lsa, W2 da ta'minotchiga **birinchi** «Daftarga yozish» ham buzilardi (`main` da u ishlaydi), ya'ni regressiya.
- **Yechim:**
  - `errors.ts`: `RpcMissingError`, `isRpcMissing` (aniqlik qoidasi 2.3-bo'limda).
  - W2: `post_supplier_debt` topilmasa avvalgi `post_supplier_opening_balance` o'sha kalitlar bilan chaqiriladi (`main` xatti-harakati).
  - W1: jim fallback yo'q, aniq xabar chiqadi.
- **Test:** `__tests__/rpc-missing-fallback.test.tsx`. Fallback'siz kodda 3 tasi yiqiladi.

### 2.2 W1 tanlov qulfi (`80c9071`, tanqidchi FAIL)
- **Muammo:** 013 yo'q serverda birinchi urinish xato beradi. Xabar «belgini olib tashlang» deydi, lekin belgi qulflangan qolardi, shuning uchun Savdolar ro'yxatida sahifani yangilamaguncha bekor qilib bo'lmasdi.
- **Yechim:** `saleReversal.refundAfterError`. `RpcMissingError` da belgi ochiladi va olib tashlanadi (hech narsa yozilmagan), savdogar yana tasdiqlaydi. Boshqa xatoda qulf saqlanadi (o'sha `client_op_id`). Ikkala sahifada qo'llandi.
- **Test:** `__tests__/sales-cancel-rpc-missing.test.tsx` (sahifa darajasida, jsdom). Tuzatishsiz kodda yiqiladi. Yana 2 ta helper testi.

### 2.3 RPC yo'qligini aniq aniqlash (`61cc20c`, `2b07ae4`)
- **Muammo:** `42883` kodi mavjud funksiya ichidagi «operator does not exist» xatosida ham chiqadi. Bu holat RPC yo'q deb noto'g'ri tan olinib, belgi ochilib ketishi yoki W2 fallback ishlashi mumkin edi.
- **Yechim:** RPC yo'q deb faqat quyidagi holatlarda hisoblanadi, **va xabarda aynan chaqirilgan RPC nomi bo'lsagina** (`isRpcMissing(err, rpc)`; mavjud RPC ichida boshqa yo'q funksiya chaqirilsa, bu RPC yo'qligi emas):
  - `PGRST202`;
  - `42883` va xabarda «function … does not exist» (operator emas);
  - kodsiz javobda PostgREST'ning aniq matni.
- Boshqa server yoki tarmoq xatolarida belgi qulflangan qoladi, fallback ishlamaydi.
- **Test:** `rpc-missing-fallback.test.tsx` ga operator, PGRST203, tarmoq va boshqa funksiya nomi holatlari qo'shildi. Eski kodda yiqiladi.

## 3. Bog'liqlik (013)

| Funksiya | 013 siz (hozirgi production) | 013 bilan |
|---|---|---|
| W1 to'lovli bekor qilish | 1-urinishda xabar, belgi olinadi, 2-urinishda savdo to'lovsiz bekor qilinadi (`main` dagidek); to'lovni alohida bekor qilish kerak | savdo va to'lov bitta tranzaksiyada |
| W1 to'lovsiz yoki mijozsiz | ishlaydi | ishlaydi |
| W2 ta'minotchi daftar yozuvi | 1-yozuv ishlaydi (ochilish qoldig'i), 2-yozuv avvalgidek rad etiladi | bir nechta yozuv (`kind='debt'`) |
| W3, W4, W5, W10, W16, W17 | ishlaydi (006 va undan oldingi migratsiyalar) | ishlaydi |

## 4. O'zgargan fayllar (`git diff --name-only origin/main...HEAD`)

- `.github/workflows/ci.yml`, `apps/web/package.json`, `docs/QARORLAR.md`, `docs/reports/2026-11-11-WEB-MVP-ERRORS.md` (shu hisobot).
- `apps/web/src/**` va `apps/web/__tests__/**` (W1–W5, W10, W16, W17 va 2-bo'limdagi tuzatishlar).
- **Tegilmagan:** `apps/mobile`, `supabase/`, `packages/core`, `.claude/`.

## 5. Test natijalari (lokal, Windows, Node 24, `2b07ae4`)

| Tekshiruv | Natija |
|---|---|
| `npm run lint:web` (`eslint . --max-warnings=0`) | ✅ 0 xato, 0 ogohlantirish |
| typecheck: core, web, mcp, admin | ✅ 4/4 |
| Vitest web | ✅ 485 o‘tdi, 2 o‘tkazib yuborildi (013 SQL fayli bu branchda yo'q, imzo testlari `skipIf`) |
| Vitest core / mcp / admin | ✅ 235 / 76 / 38 |
| `test:ci` (migration-guard) | ✅ 23/23 |
| `build:web`, `build:admin` | ✅ |
| SQL `run_local.sh` (`90d70f1` da, SQL o'zgarmagan) | ✅ 603 PASS, 0 FAIL |
| Mobil typecheck/test | lokalda ishga tushmaydi (Expo o'rnatilmagan); GitHub CI'da ishlaydi |

**Sinalmagan:** haqiqiy Supabase (staging/production), brauzerda haqiqiy yozish oqimlari (demo faqat o'qiydi), telefon. Staging mavjud emas.

## 6. Commit va PR

- Commitlar: `git log --oneline --first-parent origin/main..fix/web-mvp-errors`.
- PR: ochilgandan keyin tavsifida.
