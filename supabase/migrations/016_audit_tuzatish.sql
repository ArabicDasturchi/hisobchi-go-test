-- ============================================================
-- HISOBCHI GO — 016: tuzatish va bekor qilish (F3) — audit izi va kirimni to'lovi bilan bekor qilish
-- ============================================================
-- Muammo:
--   1. `audit_log` jadvali 001 dan beri bor, lekin unga hech kim yozmaydi (BACKEND-AUDIT S11): katalog tuzatishlari
--      (tovar, mijoz, ta'minotchi), bekor qilishlar, ombor tuzatishi — kim, qachon, nima — hech qayerda ko'rinmaydi.
--   2. Kirim bekor qilinsa, u bilan berilgan to'lov qoladi (HOLAT-3, KEYINGI-BOSQICH): ta'minotchiga ortiqcha to'lov
--      (manfiy qarz) bo'lib qoladi. Savdoda bu 013 da yechilgan (reverse_sale_with_payments), kirimda yo'q.
-- Yechim:
--   1. Trigger'lar (SECURITY DEFINER, search_path) har tuzatish va bekor qilishni `audit_log` ga yozadi. Yozuv faqat
--      qo'shiladi (003: audit_log ga INSERT/UPDATE/DELETE huquqi yo'q; trigger egasi nomidan yozadi). Telefon va izoh
--      QIYMATI yozilmaydi — faqat "o'zgardi" belgisi (shaxsiy ma'lumot jurnalga ko'chmasin).
--   2. `reverse_purchase_with_payments`: kirim + shu kirim bilan berilgan to'lov (`purchase-pay:<client_op_id>`) BITTA
--      tranzaksiyada bekor qilinadi. Mavjud `reverse_purchase` va `void_supplier_payment` qayta ishlatiladi (mantiq
--      takrorlanmaydi, ularning imzosi o'zgarmaydi — mobil va MCP buzilmaydi). Append-only: faqat teskari yozuvlar.
-- Pul hisobi o'zgarmaydi: qarz = hujjatlar − to'lovlar (bekor qilinganlarsiz), ikki yo'l (TS va SQL) avvalgidek.
-- Qayta ishga tushirish xavfsiz. Talab: 001..013 (014/015 ixtiyoriy: 015 bo'lsa savat yopilishi ham yoziladi).
-- ============================================================

-- ---------- 1. Audit yozuvchi ----------
CREATE OR REPLACE FUNCTION audit_write(p_shop_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO audit_log (shop_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_shop_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION audit_write(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- O'zgargan maydonlar: {maydon: {from, to}}; maxfiy maydonlar faqat {"o'zgardi": true}
CREATE OR REPLACE FUNCTION audit_diff(p_old jsonb, p_new jsonb, p_fields text[], p_secret text[])
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_object_agg(f,
           CASE WHEN f = ANY (p_secret) THEN jsonb_build_object('changed', true)
                ELSE jsonb_build_object('from', p_old -> f, 'to', p_new -> f) END), '{}'::jsonb)
  FROM unnest(p_fields || p_secret) AS f
  WHERE (p_old -> f) IS DISTINCT FROM (p_new -> f)
$$;
REVOKE ALL ON FUNCTION audit_diff(jsonb, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;

-- ---------- 2. Katalog tuzatishlari ----------
CREATE OR REPLACE FUNCTION audit_catalog_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fields text[];
  v_secret text[];
  v_diff jsonb;
  v_entity text := TG_ARGV[0];
BEGIN
  IF v_entity = 'product' THEN
    -- cost_price yo'q: uni post_purchase/reverse_purchase har kirimda avtomatik yangilaydi; tarixda faqat qo'lda
    -- qilingan tuzatishlar ko'rinsin (kirim o'zi purchase hujjati sifatida bor)
    v_fields := ARRAY['name', 'unit', 'last_price', 'is_active'];
    v_secret := ARRAY[]::text[];
  ELSIF v_entity = 'customer' THEN
    v_fields := ARRAY['name', 'kind', 'is_active'];
    v_secret := ARRAY['phone', 'notes'];
  ELSE
    v_fields := ARRAY['name', 'is_active'];
    v_secret := ARRAY['phone', 'notes'];
  END IF;
  -- Ustun jadvalda bo'lmasa (eski sxema) — JSON'da ham yo'q, farq chiqmaydi
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_write(NEW.shop_id, v_entity || '_created', v_entity, NEW.id,
      jsonb_build_object('name', to_jsonb(NEW) -> 'name'));
    RETURN NEW;
  END IF;
  v_diff := audit_diff(to_jsonb(OLD), to_jsonb(NEW), v_fields, v_secret);
  IF v_diff <> '{}'::jsonb THEN
    PERFORM audit_write(NEW.shop_id, v_entity || '_updated', v_entity, NEW.id,
      jsonb_build_object('name', to_jsonb(NEW) -> 'name', 'changes', v_diff));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_products ON products;
CREATE TRIGGER trg_audit_products AFTER INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION audit_catalog_change('product');
DROP TRIGGER IF EXISTS trg_audit_customers ON customers;
CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION audit_catalog_change('customer');
DROP TRIGGER IF EXISTS trg_audit_suppliers ON suppliers;
CREATE TRIGGER trg_audit_suppliers AFTER INSERT OR UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION audit_catalog_change('supplier');

-- ---------- 3. Bekor qilishlar va ombor tuzatishi (teskari yozuvlar) ----------
CREATE OR REPLACE FUNCTION audit_reversal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'document_reversals' THEN
    PERFORM audit_write(NEW.shop_id, 'sale_reversed', 'sale', (r ->> 'document_id')::uuid,
      jsonb_build_object('amount', r -> 'amount', 'reason', r -> 'reason'));
  ELSIF TG_TABLE_NAME = 'payment_voids' THEN
    PERFORM audit_write(NEW.shop_id, 'payment_voided', 'payment', (r ->> 'payment_id')::uuid,
      jsonb_build_object('amount', (SELECT to_jsonb(p.amount) FROM payments p WHERE p.id = (r ->> 'payment_id')::uuid), 'reason', r -> 'reason'));
  ELSIF TG_TABLE_NAME = 'purchase_reversals' THEN
    PERFORM audit_write(NEW.shop_id, 'purchase_reversed', 'purchase', (r ->> 'document_id')::uuid,
      jsonb_build_object('amount', r -> 'amount', 'reason', r -> 'reason'));
  ELSIF TG_TABLE_NAME = 'supplier_payment_voids' THEN
    PERFORM audit_write(NEW.shop_id, 'supplier_payment_voided', 'supplier_payment', (r ->> 'payment_id')::uuid,
      jsonb_build_object('amount', (SELECT to_jsonb(p.amount) FROM supplier_payments p WHERE p.id = (r ->> 'payment_id')::uuid), 'reason', r -> 'reason'));
  ELSIF TG_TABLE_NAME = 'stock_movements' THEN
    IF r ->> 'kind' = 'adjustment' THEN
      PERFORM audit_write(NEW.shop_id, 'stock_adjusted', 'product', (r ->> 'product_id')::uuid,
        jsonb_build_object('qty_milli', r -> 'qty_milli', 'reason', r -> 'note'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_document_reversals ON document_reversals;
CREATE TRIGGER trg_audit_document_reversals AFTER INSERT ON document_reversals FOR EACH ROW EXECUTE FUNCTION audit_reversal();
DROP TRIGGER IF EXISTS trg_audit_payment_voids ON payment_voids;
CREATE TRIGGER trg_audit_payment_voids AFTER INSERT ON payment_voids FOR EACH ROW EXECUTE FUNCTION audit_reversal();
DROP TRIGGER IF EXISTS trg_audit_purchase_reversals ON purchase_reversals;
CREATE TRIGGER trg_audit_purchase_reversals AFTER INSERT ON purchase_reversals FOR EACH ROW EXECUTE FUNCTION audit_reversal();
DROP TRIGGER IF EXISTS trg_audit_supplier_payment_voids ON supplier_payment_voids;
CREATE TRIGGER trg_audit_supplier_payment_voids AFTER INSERT ON supplier_payment_voids FOR EACH ROW EXECUTE FUNCTION audit_reversal();
DROP TRIGGER IF EXISTS trg_audit_stock_adjust ON stock_movements;
CREATE TRIGGER trg_audit_stock_adjust AFTER INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION audit_reversal();

-- AI qoralamasi qarori (tasdiq/rad/savatga olish)
CREATE OR REPLACE FUNCTION audit_draft_decision()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM audit_write(NEW.shop_id, 'draft_' || NEW.status, 'agent_draft', NEW.id,
      jsonb_build_object('kind', NEW.kind, 'total', NEW.total, 'reason', NEW.reject_reason));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_agent_drafts ON agent_drafts;
CREATE TRIGGER trg_audit_agent_drafts AFTER UPDATE ON agent_drafts FOR EACH ROW EXECUTE FUNCTION audit_draft_decision();

-- Savat yopilishi (015 qo'llangan bo'lsa)
CREATE OR REPLACE FUNCTION audit_basket_close()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r jsonb := to_jsonb(NEW);
BEGIN
  IF r ->> 'status' IS DISTINCT FROM to_jsonb(OLD) ->> 'status' AND r ->> 'status' IN ('done', 'discarded') THEN
    PERFORM audit_write(NEW.shop_id, 'basket_' || (r ->> 'status'), 'basket', NEW.id,
      jsonb_build_object('kind', r -> 'kind', 'lines', jsonb_array_length(coalesce(r -> 'lines', '[]'::jsonb)), 'document_id', r -> 'document_id'));
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF to_regclass('public.baskets') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_baskets ON baskets';
    EXECUTE 'CREATE TRIGGER trg_audit_baskets AFTER UPDATE ON baskets FOR EACH ROW EXECUTE FUNCTION audit_basket_close()';
  END IF;
END $$;

-- Trigger funksiyalari to'g'ridan-to'g'ri chaqirilmaydi
REVOKE ALL ON FUNCTION audit_catalog_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION audit_reversal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION audit_draft_decision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION audit_basket_close() FROM PUBLIC, anon, authenticated;

-- O'qish: a'zo o'z do'koni jurnalini ko'radi (001 audit_log_select), OAuth token ko'rmaydi (004 RESTRICTIVE)
CREATE INDEX IF NOT EXISTS idx_audit_shop_time ON audit_log (shop_id, created_at DESC);
GRANT SELECT ON audit_log TO authenticated;

-- ---------- 4. Kirimni to'lovi bilan bekor qilish ----------
-- p_void_payment = true: shu kirim bilan berilgan to'lov ham bekor qilinadi (ta'minotchiga ortiqcha to'lov qolmaydi).
-- Idempotent: o'sha client_op_id bilan qayta chaqirilsa o'sha teskari yozuv qaytadi, to'lov ikki marta bekor qilinmaydi.
DROP FUNCTION IF EXISTS reverse_purchase_with_payments(uuid, uuid, text, text, boolean);
CREATE OR REPLACE FUNCTION reverse_purchase_with_payments(
  p_shop_id uuid,
  p_document_id uuid,
  p_client_op_id text,
  p_reason text,
  p_void_payment boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rev uuid;
  v_doc_op text;
  v_pay uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  v_rev := reverse_purchase(p_shop_id, p_document_id, p_client_op_id, p_reason);
  IF p_void_payment THEN
    SELECT d.client_op_id INTO v_doc_op FROM purchase_documents d WHERE d.id = p_document_id AND d.shop_id = p_shop_id;
    SELECT sp.id INTO v_pay FROM supplier_payments sp
    WHERE sp.shop_id = p_shop_id AND sp.client_op_id = 'purchase-pay:' || v_doc_op
      AND NOT EXISTS (SELECT 1 FROM supplier_payment_voids v WHERE v.payment_id = sp.id);
    IF v_pay IS NOT NULL THEN
      PERFORM void_supplier_payment(p_shop_id, v_pay, p_reason);
    END IF;
  END IF;
  RETURN v_rev;
END;
$$;
REVOKE ALL ON FUNCTION reverse_purchase_with_payments(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reverse_purchase_with_payments(uuid, uuid, text, text, boolean) TO authenticated;
