-- ============================================================
-- HISOBCHI GO — 006: hamkorlar, tan/sotuv narxi, ombor harakatlari, bir martalik mijoz
-- ============================================================
-- Vazifa 3, S2 (docs/REJA-3.md 7-band). Eng kam o'zgarish, mavjud ma'lumot buzilmaydi:
--   * suppliers (ta'minotchilar), customers.kind ('regular' | 'one_time'), ensure_walkin_customer()
--   * products.cost_price (oxirgi kirim tan narxi), products.sale_price (last_price bilan sinxron saqlanadi)
--   * document_lines.unit_cost (savdo paytidagi tan narx snapshot'i; eski qatorlar NULL = noma'lum)
--   * stock_movements (append-only) va product_stock view: qoldiq = harakatlar yig'indisi, alohida kiritilmaydi
--   * post_sale v2: bir martalik mijoz to'liq to'lanadi (qarz yaratmaydi), qator tovarga bog'lanadi, tan narx va
--     ombor harakati yoziladi. Eski 8 argumentli chaqiruv (mobil, veb, accept_agent_draft) ishlayveradi.
--   * reverse_sale v2: ombor harakatini teskari yozadi, bir martalik mijozning avto-to'lovini bekor qiladi
--   * adjust_stock (qoldiq tuzatish +-)
-- Manfiy qoldiqqa ruxsat (kirim hali yozilmagan bo'lishi mumkin); ilova sariq ogohlantiradi.
-- Qayta ishga tushirish xavfsiz. Talab: 001..005.
-- ============================================================

-- ---------- 1. Mijoz turi ----------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'regular';
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_kind_check;
ALTER TABLE customers ADD CONSTRAINT customers_kind_check CHECK (kind IN ('regular', 'one_time'));
-- Do'konda bittadan ortiq tizim mijozi bo'lmaydi
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_one_time ON customers (shop_id) WHERE kind = 'one_time';

-- Bir martalik mijoz (lazy, idempotent): har do'konda bitta tizim mijozi, nom so'ralmaydi.
CREATE OR REPLACE FUNCTION ensure_walkin_customer(p_shop_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  SELECT id INTO v_id FROM customers WHERE shop_id = p_shop_id AND kind = 'one_time';
  IF v_id IS NULL THEN
    INSERT INTO customers (shop_id, name, kind) VALUES (p_shop_id, 'Bir martalik mijoz', 'one_time')
    ON CONFLICT (shop_id) WHERE kind = 'one_time' DO NOTHING;
    SELECT id INTO v_id FROM customers WHERE shop_id = p_shop_id AND kind = 'one_time';
  END IF;
  RETURN v_id;
END;
$$;

-- ---------- 2. Ta'minotchilar ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  phone      text,
  notes      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_shop ON suppliers (shop_id, name);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_all ON suppliers;
CREATE POLICY suppliers_all ON suppliers FOR ALL USING (is_shop_member(shop_id)) WITH CHECK (is_shop_member(shop_id));
DROP POLICY IF EXISTS suppliers_no_oauth ON suppliers;
CREATE POLICY suppliers_no_oauth ON suppliers AS RESTRICTIVE FOR ALL
  USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token());
REVOKE ALL ON suppliers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO authenticated;

-- ---------- 3. Tovar narxlari ----------
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price bigint CHECK (cost_price IS NULL OR cost_price >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price bigint CHECK (sale_price IS NULL OR sale_price >= 0);
UPDATE products SET sale_price = last_price WHERE sale_price IS NULL AND last_price IS NOT NULL;

-- Mobil/veb hali last_price yozadi: o'tish davrida ikkalasi sinxron. O'zgargan ustun ikkinchisiga ko'chadi.
CREATE OR REPLACE FUNCTION products_sync_prices()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sale_price IS NULL THEN NEW.sale_price := NEW.last_price;
    ELSIF NEW.last_price IS NULL THEN NEW.last_price := NEW.sale_price;
    END IF;
  ELSE
    IF NEW.last_price IS DISTINCT FROM OLD.last_price AND NEW.sale_price IS NOT DISTINCT FROM OLD.sale_price THEN
      NEW.sale_price := NEW.last_price;
    ELSIF NEW.sale_price IS DISTINCT FROM OLD.sale_price AND NEW.last_price IS NOT DISTINCT FROM OLD.last_price THEN
      NEW.last_price := NEW.sale_price;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_products_sync_prices ON products;
CREATE TRIGGER trg_products_sync_prices BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_sync_prices();

-- Savdo qatori: paytidagi tan narx (snapshot). NULL = noma'lum (foyda hisoblanmaydi)
ALTER TABLE document_lines ADD COLUMN IF NOT EXISTS unit_cost bigint CHECK (unit_cost IS NULL OR unit_cost >= 0);

-- ---------- 4. Ombor harakatlari ----------
CREATE TABLE IF NOT EXISTS stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id),
  kind          text NOT NULL CHECK (kind IN ('purchase', 'sale', 'adjustment', 'purchase_reversal', 'sale_reversal')),
  -- asosiy birlikda, 1000 = 1 birlik; kirim va qaytarilgan savdo +, savdo va bekor qilingan kirim -
  qty_milli     bigint NOT NULL CHECK (qty_milli <> 0),
  document_id   uuid,
  client_op_id  text,
  note          text,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movements_op ON stock_movements (shop_id, client_op_id) WHERE client_op_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (shop_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_document ON stock_movements (document_id);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_select ON stock_movements;
CREATE POLICY stock_movements_select ON stock_movements FOR SELECT USING (is_shop_member(shop_id));
DROP POLICY IF EXISTS stock_movements_no_oauth ON stock_movements;
CREATE POLICY stock_movements_no_oauth ON stock_movements AS RESTRICTIVE FOR ALL
  USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token());
DROP TRIGGER IF EXISTS trg_stock_movements_append_only ON stock_movements;
CREATE TRIGGER trg_stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
REVOKE ALL ON stock_movements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON stock_movements FROM authenticated;
GRANT SELECT ON stock_movements TO authenticated;

-- Qoldiq = harakatlar yig'indisi. security_invoker: RLS chaqiruvchi huquqi bilan (do'kon izolyatsiyasi, OAuth to'sig'i)
CREATE OR REPLACE VIEW product_stock WITH (security_invoker = true) AS
  SELECT shop_id, product_id, sum(qty_milli)::bigint AS qty_milli, count(*)::bigint AS movements
  FROM stock_movements GROUP BY shop_id, product_id;
REVOKE ALL ON product_stock FROM anon;
GRANT SELECT ON product_stock TO authenticated;

-- Qoldiqni qo'lda tuzatish (+-): hisob-kitobdagi xato yoki inventarizatsiya. Idempotent, sabab majburiy.
CREATE OR REPLACE FUNCTION adjust_stock(p_shop_id uuid, p_product_id uuid, p_client_op_id text, p_qty_milli bigint, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  IF p_client_op_id IS NULL OR char_length(p_client_op_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_client_op_id' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM stock_movements WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF p_qty_milli IS NULL OR p_qty_milli = 0 OR abs(p_qty_milli) > 1000000000 THEN
    RAISE EXCEPTION 'invalid_qty' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND shop_id = p_shop_id) THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO stock_movements (shop_id, product_id, kind, qty_milli, client_op_id, note, created_by)
  VALUES (p_shop_id, p_product_id, 'adjustment', p_qty_milli, p_client_op_id, trim(p_reason), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 5. post_sale v2 ----------
-- Eski 8 argumentli imzo olib tashlanadi (ikki overload qolib, chaqiruv noaniq bo'lmasin); yangi imzo ikki ixtiyoriy argument qo'shadi.
-- p_lines elementi: product_name, qty_milli, unit, unit_price, raw_text, ixtiyoriy product_id va unit_cost (mijoz snapshot'i).
DROP FUNCTION IF EXISTS post_sale(uuid, uuid, text, uuid, text, jsonb, bigint, timestamptz);

CREATE OR REPLACE FUNCTION post_sale(
  p_shop_id uuid,
  p_sale_id uuid,
  p_client_op_id text,
  p_customer_id uuid,
  p_raw_input text,
  p_lines jsonb,
  p_client_total bigint,
  p_created_at timestamptz DEFAULT now(),
  p_payment_method text DEFAULT NULL,
  p_paid bigint DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_line jsonb;
  v_idx int := 0;
  v_qty bigint;
  v_price bigint;
  v_total bigint := 0;
  v_kind text := 'regular';
  v_prod products%ROWTYPE;
  v_pid uuid;
  v_cost bigint;
  v_lt bigint;
BEGIN
  PERFORM require_shop_member(p_shop_id);

  SELECT id INTO v_existing FROM documents WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF EXISTS (SELECT 1 FROM documents WHERE id = p_sale_id) THEN
    RAISE EXCEPTION 'id_conflict' USING ERRCODE = '23505';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT kind INTO v_kind FROM customers WHERE id = p_customer_id AND shop_id = p_shop_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer_not_in_shop' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_paid IS NOT NULL AND p_paid < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_paid IS NOT NULL AND p_paid > 0 AND (p_payment_method IS NULL OR p_payment_method NOT IN ('naqd', 'karta', 'otkazma')) THEN
    RAISE EXCEPTION 'invalid_method' USING ERRCODE = '22023';
  END IF;
  IF p_paid IS NOT NULL AND p_paid > 0 AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'payment_requires_customer' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_document' USING ERRCODE = '22023';
  END IF;

  INSERT INTO documents (id, shop_id, customer_id, status, subtotal, ts_total, pg_total, calc_match,
                         client_op_id, created_by, posted_at, created_at)
  VALUES (p_sale_id, p_shop_id, p_customer_id, 'draft', 0, p_client_total, NULL, NULL,
          p_client_op_id, auth.uid(), NULL, p_created_at);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := (v_line->>'qty_milli')::bigint;
    v_price := (v_line->>'unit_price')::bigint;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
      RAISE EXCEPTION 'invalid_qty' USING ERRCODE = '22023';
    END IF;
    IF v_price IS NULL OR v_price < 0 OR v_price > 100000000 THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
    END IF;
    IF char_length(trim(coalesce(v_line->>'product_name', ''))) = 0 THEN
      RAISE EXCEPTION 'invalid_product_name' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_line->>'unit', '') NOT IN ('dona','kg','g','litr','metr','pachka','qop','karobka','tonna') THEN
      RAISE EXCEPTION 'invalid_unit' USING ERRCODE = '22023';
    END IF;

    -- Tovarga bog'lash: aniq product_id (shu do'kon, birlik mos) yoki nom bo'yicha. Topilmasa qator tovarsiz (ombor harakati yo'q).
    v_prod := NULL;
    v_pid := NULL;
    IF v_line->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO v_prod FROM products
       WHERE id = (v_line->>'product_id')::uuid AND shop_id = p_shop_id AND unit = v_line->>'unit';
    END IF;
    IF v_prod.id IS NULL THEN
      SELECT * INTO v_prod FROM products
       WHERE shop_id = p_shop_id AND is_active AND unit = v_line->>'unit'
         AND catalog_norm(name) = catalog_norm(trim(v_line->>'product_name'))
       ORDER BY created_at, id LIMIT 1;
    END IF;
    v_pid := v_prod.id;
    v_cost := CASE WHEN v_line->>'unit_cost' ~ '^\d{1,12}$' THEN (v_line->>'unit_cost')::bigint ELSE v_prod.cost_price END;

    v_lt := calculate_line_total(v_qty, v_price);
    INSERT INTO document_lines (document_id, shop_id, line_index, product_name, product_id, qty_milli, unit, unit_price, line_total, unit_cost, raw_text)
    VALUES (p_sale_id, p_shop_id, v_idx, trim(v_line->>'product_name'), v_pid, v_qty, v_line->>'unit', v_price, v_lt, v_cost, v_line->>'raw_text');
    IF v_pid IS NOT NULL THEN
      INSERT INTO stock_movements (shop_id, product_id, kind, qty_milli, document_id, created_by, created_at)
      VALUES (p_shop_id, v_pid, 'sale', -v_qty, p_sale_id, auth.uid(), p_created_at);
    END IF;
    v_total := v_total + v_lt;
    v_idx := v_idx + 1;
  END LOOP;

  -- Mustaqil server hisobi; mos kelmasa hech narsa saqlanmaydi (tranzaksiya bekor bo'ladi)
  IF v_total <> p_client_total THEN
    RAISE EXCEPTION 'calc_mismatch: server=%, client=%', v_total, p_client_total USING ERRCODE = '22000';
  END IF;

  -- Bir martalik mijoz qarzga olmaydi: savdo to'liq to'lanishi shart
  IF v_kind = 'one_time' AND (p_paid IS DISTINCT FROM v_total OR v_total <= 0) THEN
    RAISE EXCEPTION 'walkin_requires_full_payment: total=%', v_total USING ERRCODE = '22000';
  END IF;
  IF p_paid IS NOT NULL AND p_paid > v_total THEN
    RAISE EXCEPTION 'payment_exceeds_debt: debt=%', v_total USING ERRCODE = '22000';
  END IF;

  UPDATE documents SET status = 'posted', subtotal = v_total, pg_total = v_total, calc_match = true, posted_at = now()
  WHERE id = p_sale_id;
  INSERT INTO ledger_entries (shop_id, document_id, entry_type, amount, customer_id, description, created_by)
  VALUES (p_shop_id, p_sale_id, 'sale', v_total, p_customer_id, 'savdo', auth.uid());

  -- Savdo bilan birga to'lov (bir tranzaksiyada). client_op_id savdoniki asosida, idempotent.
  IF p_paid IS NOT NULL AND p_paid > 0 THEN
    INSERT INTO payments (id, shop_id, client_op_id, customer_id, amount, method, note, created_by, created_at)
    VALUES (gen_random_uuid(), p_shop_id, 'sale-pay:' || p_client_op_id, p_customer_id, p_paid, p_payment_method,
            'savdo bilan', auth.uid(), p_created_at);
  END IF;
  RETURN p_sale_id;
END;
$$;

-- ---------- 6. reverse_sale v2 ----------
CREATE OR REPLACE FUNCTION reverse_sale(p_shop_id uuid, p_document_id uuid, p_client_op_id text, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc documents%ROWTYPE;
  v_rev uuid;
  v_kind text;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  SELECT id INTO v_rev FROM document_reversals WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_rev IS NOT NULL THEN
    RETURN v_rev;
  END IF;
  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.status <> 'posted' THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = '23505';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO document_reversals (shop_id, document_id, client_op_id, amount, reason, created_by)
  VALUES (p_shop_id, p_document_id, p_client_op_id, v_doc.subtotal, trim(p_reason), auth.uid())
  RETURNING id INTO v_rev;
  INSERT INTO ledger_entries (shop_id, document_id, entry_type, amount, customer_id, description, created_by)
  VALUES (p_shop_id, p_document_id, 'reversal', -v_doc.subtotal, v_doc.customer_id, trim(p_reason), auth.uid());
  UPDATE documents SET status = 'reversed' WHERE id = p_document_id;

  -- Ombor: har savdo harakati uchun teskari harakat (qoldiq qaytadi)
  INSERT INTO stock_movements (shop_id, product_id, kind, qty_milli, document_id, note, created_by)
  SELECT shop_id, product_id, 'sale_reversal', -qty_milli, document_id, trim(p_reason), auth.uid()
  FROM stock_movements WHERE document_id = p_document_id AND kind = 'sale';

  -- Bir martalik mijozning savdo bilan birga to'langan puli qaytariladi (uning hisobi yo'q): to'lov bekor qilinadi
  IF v_doc.customer_id IS NOT NULL THEN
    SELECT kind INTO v_kind FROM customers WHERE id = v_doc.customer_id;
    IF v_kind = 'one_time' THEN
      INSERT INTO payment_voids (shop_id, payment_id, reason, created_by)
      SELECT p.shop_id, p.id, 'savdo bekor qilindi: ' || trim(p_reason), auth.uid()
      FROM payments p
      WHERE p.shop_id = p_shop_id AND p.client_op_id = 'sale-pay:' || v_doc.client_op_id
        AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id);
    END IF;
  END IF;
  RETURN v_rev;
END;
$$;

-- ---------- 7. Agent o'qish: bir martalik mijoz ro'yxatda ko'rinmaydi ----------
CREATE OR REPLACE FUNCTION agent_list_customers(
  p_shop_id uuid, p_query text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE (id uuid, name text, outstanding bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_like text;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF nullif(trim(coalesce(p_query, '')), '') IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name, customer_outstanding(p_shop_id, c.id)
    FROM customers c
    WHERE c.shop_id = p_shop_id AND c.is_active AND c.kind = 'regular' AND (v_like IS NULL OR c.name ILIKE v_like)
    ORDER BY c.name, c.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
    OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- ---------- 8. Funksiya huquqlari ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'post_sale', 'reverse_sale', 'ensure_walkin_customer', 'adjust_stock', 'agent_list_customers'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
