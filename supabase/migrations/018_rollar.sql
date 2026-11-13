-- ============================================================
-- HISOBCHI GO — 018: rollar (B5) — sotuvchi (member) pul yozuvini bekor qila olmaydi
-- ============================================================
-- Muammo: `shop_members.role` (owner/admin/member) 001 dan beri bor, lekin RPC'lar faqat a'zolikni tekshiradi:
--   har qanday a'zo savdo/kirimni bekor qilishi, to'lovni bekor qilishi va ombor qoldig'ini tuzatishi mumkin
--   (HUMOYUN-BACKEND 3.4, ARXITEKTURA 8). Sotuvchi pulni "yo'q qilib" qo'ya olmasligi kerak.
-- Yechim (eng kam xavfli): bekor qilish va ombor tuzatish RPC'larini qayta yozmasdan, ular yozadigan TESKARI
--   YOZUV jadvallariga BEFORE INSERT trigger: chaqiruvchi (auth.uid()) shu do'konda `owner` yoki `admin` bo'lishi
--   shart, aks holda `role_forbidden` va butun tranzaksiya bekor (hech narsa yozilmaydi).
--   Jadvallar: document_reversals (savdo bekor), payment_voids (mijoz to'lovi bekor), purchase_reversals (kirim
--   bekor), supplier_payment_voids (ta'minotchi to'lovi bekor), stock_movements (faqat kind = 'adjustment').
--   Savdo, to'lov olish, kirim yozish (ledger.write) hamma rolga ochiq qoladi.
-- auth.uid() bo'lmasa (migratsiya, xizmat skripti) tekshiruv o'tkazib yuboriladi: rol faqat foydalanuvchi
--   sessiyasiga taalluqli. Hozir har do'konda faqat egasi bor (create_shop owner yaratadi) — mavjud ishga ta'sir yo'q.
-- Qayta ishga tushirish xavfsiz. Talab: 001..013 (014–017 ga bog'liq emas).
-- ============================================================

-- Chaqiruvchining shu do'kondagi roli (a'zo bo'lmasa NULL)
CREATE OR REPLACE FUNCTION shop_role(p_shop_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.role FROM shop_members m WHERE m.shop_id = p_shop_id AND m.user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION shop_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION shop_role(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION require_manager_for_reversal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Ichma-ich IF: boshqa jadvallarda `kind` ustuni yo'q (PL/pgSQL AND ni qisqa tutashuv bilan hisoblamaydi)
  IF TG_TABLE_NAME = 'stock_movements' THEN
    IF to_jsonb(NEW) ->> 'kind' <> 'adjustment' THEN
      RETURN NEW;
    END IF;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF coalesce(shop_role(NEW.shop_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'role_forbidden: bu amalni faqat do''kon egasi yoki administrator bajaradi' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION require_manager_for_reversal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_role_document_reversals ON document_reversals;
CREATE TRIGGER trg_role_document_reversals BEFORE INSERT ON document_reversals FOR EACH ROW EXECUTE FUNCTION require_manager_for_reversal();
DROP TRIGGER IF EXISTS trg_role_payment_voids ON payment_voids;
CREATE TRIGGER trg_role_payment_voids BEFORE INSERT ON payment_voids FOR EACH ROW EXECUTE FUNCTION require_manager_for_reversal();
DROP TRIGGER IF EXISTS trg_role_purchase_reversals ON purchase_reversals;
CREATE TRIGGER trg_role_purchase_reversals BEFORE INSERT ON purchase_reversals FOR EACH ROW EXECUTE FUNCTION require_manager_for_reversal();
DROP TRIGGER IF EXISTS trg_role_supplier_payment_voids ON supplier_payment_voids;
CREATE TRIGGER trg_role_supplier_payment_voids BEFORE INSERT ON supplier_payment_voids FOR EACH ROW EXECUTE FUNCTION require_manager_for_reversal();
DROP TRIGGER IF EXISTS trg_role_stock_adjust ON stock_movements;
CREATE TRIGGER trg_role_stock_adjust BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION require_manager_for_reversal();
