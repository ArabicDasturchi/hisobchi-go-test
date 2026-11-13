# test/mvp-integration: lokal branch, main bilan birlashtirish, migratsiyalar 015–019

Sana: 13.11.2026. Holat: **lokal**. Hech narsa push qilinmagan.

## Git

- Branch `test/mvp-integration`: 5 ta ish commit'i va `origin/main` (#57–#59) bilan merge commit'i. `main` ga tegilmagan.
- Remote `origin` — sherikning reposi (`abdullohismoilov777-debug/hisobchi-go`). Unga **push qilinmaydi**.
- `https://github.com/ArabicDasturchi/hisobchi-go` topilmadi: repo yo'q yoki yopiq. Push uchun asoschidan aniq repo URL kerak.
- Commit muallifi: Humoyun (global git sozlamasi o'zgartirilmagan, har buyruqda berilgan).

## Migratsiya raqamlari

Sherikning `main` iga `014_ombor_narxlar.sql` qo'shilgan (optom narx, ombor sozlamalari). Shuning uchun bizning migratsiyalar bir pog'ona surildi:

| Eski | Yangi | Mazmun |
|---|---|---|
| 014 | **015** | xavfsizlik (B2), K3 birlik qulfi |
| 015 | **016** | savat (F2/B3) |
| 016 | **017** | audit, kirimni to'lovi bilan bekor qilish (F3) |
| 017 | **018** | AI sarf jurnali, limit |
| 018 | **019** | rollar |

Testlar: `91_xavfsizlik_015`, `92_savat`, `93_audit_tuzatish`, `94_rollar`, `96_ai_sarf`. `95_ombor_narxlar` sherikniki.

**Bog'liqlik tekshiruvi:**
- Sherikning 014 i faqat ustunlar (`products.wholesale_*`), `shops.settings` cheklovi va ikkita yangi funksiya (`resolve_unit_price`, `suggest_sale_price`) qo'shadi.
- Bizning 015–019 bu funksiyalarni qayta yozmaydi va bu ustunlarga tegmaydi.

Hujjat va kod izohlaridagi raqamlar faqat bizning fayllarda yangilandi. Asoschi matni (`HUMOYUN-FUNKSIYALAR.md`) o'zgartirilmadi.

## Konfliktlar (ikkala tomon saqlangan holda)

- `PanelWorkspace.tsx`: sherikning optom narxni qayta hisoblashi (`repriceLines`) bizning qator savollari (`reviewsAfterEdit`) bilan birga ishlaydi.
- `SaleLineCard.tsx`: `wholesale` belgisi va savol tugmalari birga.
- `saleForm.ts`: `autoPrice` (sherik) va `pasted`/`reviews` (biz).
- `VEB-DAN-MOBILGA.md`: ikkala tomon qatorlari saqlandi.
- `run_local.sh`: 014 ombor, so'ng 015–019.

Noaniq konflikt bo'lmadi. Sherik kodi o'chirilmadi.

## Tekshiruv (merge'dan keyin, faqat yangi kombinatsiya)

| Tekshiruv | Natija |
|---|---|
| `run_local.sh` (001–019, sherik 014 bilan) | **953 PASS, 0 FAIL** |
| core (sherik `pricing` testlari bilan) | 315 o'tdi |
| web typecheck | toza |
| web panel testlari | 19 o'tdi. Mock'larga sherikning `pricing` maydoni qo'shildi |
| lint | toza |

Haqiqiy Supabase va staging'da sinalmagan.

## Bloklovchi

Push uchun **`ArabicDasturchi` akkauntidagi repo URL** kerak. Repo hali yo'q bo'lsa, uni GitHub'da yaratish kerak: bo'sh, `main` siz yoki yopiq. Undan keyin `origin` ga tegmasdan alohida remote (masalan `mine`) qo'shilib, faqat `test/mvp-integration` push qilinadi.
