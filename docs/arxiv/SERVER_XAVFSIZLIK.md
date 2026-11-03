# HISOBCHI GO — SERVER VA MA'LUMOTLAR XAVFSIZLIGI AUDITI (F bosqichi)

**Sana:** 2026-10-29
**Holat:** S1–S4 `supabase/migrations/003_security_and_mvp_rpc.sql` da tuzatilgan va lokal PostgreSQL 16 da
(Supabase stub bilan) `supabase/tests/10_security_isolation.test.sql` orqali sinalgan. Haqiqiy Supabase
loyihasiga hali qo'llanmagan. Hech qanday tashqi xizmat yoki cloud resurs o'zgartirilmagan.

---

## 1. Hozirgi haqiqiy holat

| Qatlam | Holat |
|---|---|
| Mobil ilova | Ma'lumot faqat qurilmadagi SQLite'da. Server bilan aloqa yo'q. |
| Ikkinchi hisob | **SQLite** integer arifmetikasida (mustaqil, testlangan). TZ talab qilgan **PostgreSQL** hisobi ishlamaydi. |
| `supabase/migrations/001` | Yozilgan, **hech qayerda qo'llanmagan**. Supabase loyihasi va kalitlari yo'q. |
| `supabase/functions/` | Bo'sh. |
| Autentifikatsiya | Yo'q (QARORLAR OS1 ochiq). |
| Zaxira nusxa / sinxronlash | Yo'q. Telefon yo'qolsa — ledger yo'qoladi. |

Ilova server himoyasiga ega deb ko'rsatilmaydi.

---

## 2. `001_initial_schema.sql` dagi xavflar (kod bilan tasdiqlangan)

### S1 — KRITIK: istalgan foydalanuvchi istalgan do'konga a'zo bo'la oladi
`shop_members_insert ... WITH CHECK (is_shop_member(shop_id) OR user_id = auth.uid())` (340-qator).
Ikkinchi shart faqat "o'zim haqimdagi qator"ni tekshiradi, `shop_id` ni emas. Natija: begona do'kon
`shop_id` si bilan `(shop_id, auth.uid())` qo'shib, uning barcha mijoz, savdo va ledger ma'lumotlariga
kirish. **Tenant izolyatsiyasi buziladi.**
Tuzatish: a'zo qo'shish faqat egasi (role='owner') orqali yoki do'kon yaratuvchi `SECURITY DEFINER`
RPC ichida (do'kon + birinchi a'zo bitta tranzaksiyada).

### S2 — YUQORI (M9): RLS orqali hisobni chetlab o'tib savdo "posted" qilish
`documents_all`, `document_lines_all` — `FOR ALL`; `ledger_entries_insert` — a'zo istalgan summani yozadi.
Klient `status='posted'`, istalgan `subtotal/ts_total/pg_total/calc_match` va ledger yozuvini to'g'ridan-to'g'ri
yozishi mumkin — ikki hisob tekshiruvi umuman chetlab o'tiladi.
Tuzatish: klientga `documents/document_lines/ledger_entries` uchun faqat SELECT; yozish faqat
`post_document()` RPC orqali.

### S3 — O'RTA: `shops_insert WITH CHECK (true)`
Har qanday (hatto anonim, agar `anon` roli ruxsatga ega bo'lsa) foydalanuvchi cheksiz do'kon yarata oladi.
Tuzatish: `TO authenticated` + RPC orqali yaratish.

### S4 — O'RTA: `is_shop_member` `SECURITY DEFINER`, lekin `search_path` belgilanmagan
Tuzatish: `SET search_path = public, pg_temp`.

### S5 — O'RTA: `002_test_calculations.sql` migratsiyalar ichida va soxta PASS (MUAMMOLAR M10)
14–15-testlardagi `RAISE EXCEPTION 'FAIL…'` o'zining `WHEN raise_exception` handleri bilan ushlanadi.

---

## 3. Tavsiya etilgan arxitektura (qaror: Supabase)

**Nega Supabase:** repoda allaqachon Supabase sxemasi, RLS va PG hisob funksiyalari bor; README va TZ
shuni ko'rsatadi; ikkinchi backend qo'shish asossiz. Yakuniy tanlov — sizning tasdiqingizdan keyin.

1. **Auth:** Supabase Auth (telefon OTP yoki email — OS1 bo'yicha qaroringiz kerak).
2. **Yozish yo'li:** `post_document(p_shop_id, p_client_op_id, p_customer_id, p_lines jsonb, p_ts_total)`
   `SECURITY DEFINER`, `search_path` belgilangan:
   - chaqiruvchi `auth.uid()` shu do'kon a'zosi ekanini tekshiradi (klientdan kelgan user ID ishlatilmaydi);
   - qatorlarni validatsiya qiladi, **jami summani PostgreSQL'da qayta hisoblaydi**;
   - `p_ts_total` ≠ PG jami → xato, hech narsa yozilmaydi;
   - `UNIQUE(shop_id, client_op_id)` — takroriy so'rov mavjud hujjatni qaytaradi;
   - hujjat + qatorlar + ledger bitta tranzaksiyada.
3. **Bekor qilish:** `reverse_document()` RPC — xuddi shu tekshiruvlar, `UNIQUE(document_id)`; boshqa
   do'kon hujjatini bekor qilish RLS + RPC ichidagi a'zolik tekshiruvi bilan taqiqlanadi.
4. **Sinxronlash (offline-first):** mobil SQLite asosiy manba bo'lib qoladi; saqlangan savdolar
   `client_op_id` bilan "outbox" orqali RPC'ga yuboriladi. Idempotentlik tufayli qayta yuborish xavfsiz.
   Server jami boshqacha chiqsa — savdo "sinxron xatosi" sifatida belgilanadi, jim o'zgartirilmaydi.
5. **Zaxira nusxa:** sinxronlash ishlagach server — asosiy zaxira. Undan oldin oraliq yechim:
   SQLite faylini foydalanuvchi o'zi eksport qilishi (`expo-sharing`, yangi paket — ruxsat kerak).

6. **Tarixdan yashirish (serverda):** mobil ilovada hozir global (bitta foydalanuvchi). Serverda bu
   **foydalanuvchiga xos** bo'lishi shart: `sale_visibility_events(document_id, user_id, action, created_at)`,
   RLS: `user_id = auth.uid()` va hujjat shu foydalanuvchi a'zo bo'lgan do'konga tegishli. Moliyaviy
   summalar va hisobotlarga ta'sir qilmaydi; bir foydalanuvchining yashirishi boshqasiga ko'rinmaydi.

7. **Qurilmalar o'rtasida ulashish uchun kerakli API (hozir YO'Q):** repoda ishlaydigan backend yo'q
   (`supabase/functions/` bo'sh, migratsiyalar qo'llanmagan). iOS, Android va web bitta ma'lumotni ko'rishi
   uchun: Supabase Auth (do'kon a'zoligi) → `post_document`, `reverse_document`, `record_payment`,
   `void_payment` RPC'lari (har biri `client_op_id` bilan idempotent, summa serverda qayta hisoblanadi,
   to'lov qarzdan oshmasligi serverda tekshiriladi) → mahsulot va mijozlar uchun RLS bilan CRUD →
   mobil SQLite'dan outbox orqali yuborish. Mobil ilovaga hech qanday DB kaliti joylanmaydi
   (faqat `anon` kalit + foydalanuvchi JWT).

### Server testlari (rejada)
Takroriy so'rov; ruxsatsiz kirish; boshqa foydalanuvchi IDsi; boshqa do'kon `shop_id`si (S1 regressiyasi);
klient jami ≠ server jami; parallel ikki `post_document`; ledger UPDATE/DELETE; RLS orqali to'g'ridan-to'g'ri
INSERT rad etilishi.

---

## 4. Sizning ruxsatingiz kerak bo'lgan qadamlar

| # | Amal | Nima o'zgaradi | Xavf |
|---|---|---|---|
| 1 | Supabase loyihasi yaratish (yoki mavjudini berish) | Cloud resurs; bepul/pullik reja tanlovi | Xarajat, kalitlarni boshqarish |
| 2 | Auth usuli (OS1) | SMS provayder narxi (telefon OTP) | Xarajat |
| 3 | `003_security_fixes.sql` (S1–S4) va `004_post_document.sql` ni **lokal** PostgreSQL'da sinash | Faqat lokal baza (`psql` mavjud) | Yo'q, lekin lokal PG paroli kerak |
| 4 | Migratsiyalarni Supabase'ga qo'llash | Masofaviy baza | Qaytarish rejasi kerak |
| 5 | Edge Function deploy | Masofaviy kod | — |

Bu ruxsatlarsiz keyingi xavfsiz qadam: 3-band uchun migratsiya fayllarini yozish va ularni lokal
PostgreSQL'da sinash (kalitlar va cloud talab qilinmaydi).
