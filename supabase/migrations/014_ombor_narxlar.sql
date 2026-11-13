-- ============================================================
-- HISOBCHI GO — 014: ombor narxlari (optom narx) va narx hisoblash funksiyalari
-- ============================================================
-- 1) products.wholesale_price (optom narx) va products.wholesale_min_qty_milli (optom boshlanadigan miqdor, 1000 = 1 birlik).
--    Ikkalasi birga NULL (optom yo'q) yoki birga to'ldirilgan. Mavjud ma'lumot buzilmaydi: ustunlar NULL.
-- 2) resolve_unit_price / suggest_sale_price: core (`resolveUnitPrice`, `suggestSalePrice`) bilan bir xil qoida, SQL ikkinchi yo'l.
--    Faqat sof hisob; jadvalga yozmaydi. post_sale ularni CHAQIRMAYDI: savdo qatori narxini klient yuboradi
--    (foydalanuvchi qo'lda yozgan narx o'zgarmaydi), server o'zi narxni almashtirmaydi.
-- 3) Narx yozish: mavjud RLS (products_all) va GRANT UPDATE (003) yetarli; tan narx, sotuv narxi va optom maydonlari
--    bitta UPDATE (bitta tranzaksiya) bilan yoziladi. Yangi RPC kerak emas. sale_price <-> last_price triggeri (006) o'zgarmaydi.
-- 4) Do'kon sozlamalari (wholesale_enabled, stock_enabled, markup_percent) shops.settings jsonb ga (010) yoziladi: yangi jadval yo'q.
--    Ularning shakli CHECK bilan qo'riqlanadi (noto'g'ri qiymat yozib bo'lmaydi).
-- Faqat qo'shuvchi. Qayta ishga tushirish xavfsiz. Talab: 001..013.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price bigint;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_min_qty_milli bigint;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_wholesale_price_nonneg;
ALTER TABLE products ADD CONSTRAINT products_wholesale_price_nonneg
  CHECK (wholesale_price IS NULL OR wholesale_price >= 0);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_wholesale_min_qty_positive;
ALTER TABLE products ADD CONSTRAINT products_wholesale_min_qty_positive
  CHECK (wholesale_min_qty_milli IS NULL OR wholesale_min_qty_milli > 0);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_wholesale_pair;
ALTER TABLE products ADD CONSTRAINT products_wholesale_pair
  CHECK ((wholesale_price IS NULL) = (wholesale_min_qty_milli IS NULL));

-- Sozlamalar shakli: bo'lsa bool / butun 0..1000 (yoki null). Boshqa kalitlar (units) ga tegmaydi.
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_settings_pricing_shape;
ALTER TABLE shops ADD CONSTRAINT shops_settings_pricing_shape CHECK (
  (NOT (settings ? 'wholesale_enabled') OR jsonb_typeof(settings -> 'wholesale_enabled') = 'boolean')
  AND (NOT (settings ? 'stock_enabled') OR jsonb_typeof(settings -> 'stock_enabled') = 'boolean')
  AND (NOT (settings ? 'markup_percent') OR jsonb_typeof(settings -> 'markup_percent') = 'null'
       OR (jsonb_typeof(settings -> 'markup_percent') = 'number'
           AND (settings ->> 'markup_percent') ~ '^[0-9]{1,4}$'
           AND (settings ->> 'markup_percent')::int <= 1000))
);

-- Birlik narxini tanlash: miqdor >= optom chegarasi bo'lsa optom narx, aks holda sotuv narxi.
-- Optom narx yoki chegara NULL bo'lsa har doim sotuv narxi. Chegarada (qty = min) optom.
CREATE OR REPLACE FUNCTION resolve_unit_price(
  p_sale_price bigint, p_wholesale_price bigint, p_wholesale_min_qty_milli bigint, p_qty_milli bigint
) RETURNS bigint
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_wholesale_price IS NOT NULL AND p_wholesale_min_qty_milli IS NOT NULL
         AND p_wholesale_min_qty_milli > 0 AND p_qty_milli >= p_wholesale_min_qty_milli
      THEN p_wholesale_price
    ELSE p_sale_price
  END
$$;

-- Ustama bo'yicha sotuv narxi taklifi: round(cost * (100 + pct) / 100), butun so'mga yarimidan yuqoriga (half-up).
-- Butun arifmetika (suzuvchi nuqta yo'q). Manfiy tan narx yoki ustama NULL bo'lsa NULL.
CREATE OR REPLACE FUNCTION suggest_sale_price(p_cost bigint, p_markup_pct integer) RETURNS bigint
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cost IS NULL OR p_markup_pct IS NULL OR p_cost < 0 OR p_markup_pct < 0 THEN NULL
    ELSE (p_cost * (100 + p_markup_pct) + 50) / 100
  END
$$;

REVOKE ALL ON FUNCTION resolve_unit_price(bigint, bigint, bigint, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION suggest_sale_price(bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resolve_unit_price(bigint, bigint, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION suggest_sale_price(bigint, integer) TO authenticated;
