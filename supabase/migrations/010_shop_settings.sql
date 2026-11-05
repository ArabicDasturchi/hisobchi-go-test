-- ============================================================
-- HISOBCHI GO — 010: do'kon sozlamalari (shops.settings jsonb)
-- ============================================================
-- Birinchi sozlama: yoqilgan o'lchov birliklari (settings.units, masalan ["dona","pachka"]).
-- Bu faqat UI filtri: core'dagi ALLOWED_UNITS va products.unit / hujjat qatorlaridagi eski birliklar o'zgarmaydi,
-- shuning uchun mavjud ma'lumot buzilmaydi. Qiymat bo'lmasa ilova standart (dona, pachka) ni ishlatadi.
-- Yozish: mavjud shops_update siyosati (faqat do'kon egasi) va GRANT UPDATE ON shops (003) yetarli, yangi RPC kerak emas.
-- Qayta ishga tushirish xavfsiz. Talab: 001..009 (009 oldin merge bo'lishi kerak).
-- ============================================================

ALTER TABLE shops ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_settings_object;
ALTER TABLE shops ADD CONSTRAINT shops_settings_object CHECK (jsonb_typeof(settings) = 'object');
