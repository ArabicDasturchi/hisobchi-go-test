-- ============================================================
-- HISOBCHI GO — 007: kirim (ta'minotchidan tovar), ta'minotchi to'lovi, oldi-berdi hisobi
-- ============================================================
-- Vazifa 3, S2 (docs/REJA-3.md 7-band). 006 ga tayanadi (suppliers, stock_movements, post_sale uslubi).
-- Kirim hujjati: ta'minotchi, sana, qatorlar (tovar, miqdor, tan narx), berilgan to'lov.
-- Ostatka = Eski + Tovar - Berildi. Append-only: tuzatish teskari yozuv bilan (reverse_purchase, void_supplier_payment).
-- Hisob ikki yo'l bilan (post_sale kabi): mijoz (TypeScript BigInt) jamini yuboradi, PostgreSQL qayta hisoblaydi,
-- mos kelmasa hech narsa saqlanmaydi (calc_mismatch).
-- Kirim tan narxni yangilaydi (oxirgi kirim usuli, REJA-3 6.1); bekor qilinsa oldingi kirim narxi qaytadi.
-- Qayta ishga tushirish xavfsiz. Talab: 001..006.
-- ============================================================

-- ---------- 1. Jadvallar ----------
CREATE TABLE IF NOT EXISTS purchase_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  supplier_id   uuid NOT NULL REFERENCES suppliers(id),
  doc_date      date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tashkent')::date),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  subtotal      bigint NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  ts_total      bigint,
  pg_total      bigint,
  calc_match    boolean,
  client_op_id  text NOT NULL,
  created_by    uuid NOT NULL,
  posted_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, client_op_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_supplier ON purchase_documents (shop_id, supplier_id, doc_date);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES purchase_documents(id) ON DELETE CASCADE,
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  line_index    int NOT NULL CHECK (line_index >= 0),
  product_id    uuid NOT NULL REFERENCES products(id),
  product_name  text NOT NULL CHECK (char_length(product_name) > 0),
  qty_milli     bigint NOT NULL CHECK (qty_milli > 0),
  unit          text NOT NULL,
  unit_cost     bigint NOT NULL CHECK (unit_cost >= 0),
  line_total    bigint NOT NULL CHECK (line_total >= 0),
  UNIQUE (document_id, line_index)
);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_product ON purchase_lines (shop_id, product_id);

CREATE TABLE IF NOT EXISTS purchase_reversals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL UNIQUE REFERENCES purchase_documents(id),
  client_op_id  text NOT NULL,
  amount        bigint NOT NULL CHECK (amount >= 0),
  reason        text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, client_op_id)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id            uuid PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_op_id  text NOT NULL,
  supplier_id   uuid NOT NULL REFERENCES suppliers(id),
  amount        bigint NOT NULL CHECK (amount > 0),
  method        text NOT NULL CHECK (method IN ('naqd', 'karta', 'otkazma')),
  note          text,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, client_op_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments (shop_id, supplier_id);

CREATE TABLE IF NOT EXISTS supplier_payment_voids (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  payment_id  uuid NOT NULL UNIQUE REFERENCES supplier_payments(id),
  reason      text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: a'zolar o'qiydi; yozuv faqat RPC; OAuth token na o'qiydi, na yozadi
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_documents', 'purchase_lines', 'purchase_reversals', 'supplier_payments', 'supplier_payment_voids'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (is_shop_member(shop_id))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_no_oauth', t);
    EXECUTE format('CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token())', t || '_no_oauth', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON %I TO authenticated', t);
  END LOOP;
  -- append-only: qatorlar, bekor qilishlar, to'lovlar va ularning bekor qilinishi
  FOREACH t IN ARRAY ARRAY['purchase_lines', 'purchase_reversals', 'supplier_payments', 'supplier_payment_voids'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change()', 'trg_' || t || '_append_only', t);
  END LOOP;
END $$;

-- ---------- 2. Ta'minotchi balansi (biz unga qarz) ----------
-- = kirimlar (bekor qilinmagan) - to'lovlar (bekor qilinmagan). A'zolik tekshiriladi (customer_outstanding xatosi takrorlanmasin).
CREATE OR REPLACE FUNCTION supplier_outstanding(p_shop_id uuid, p_supplier_id uuid)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  RETURN
    COALESCE((SELECT SUM(d.subtotal) FROM purchase_documents d
              WHERE d.shop_id = p_shop_id AND d.supplier_id = p_supplier_id AND d.status = 'posted'), 0)
    - COALESCE((SELECT SUM(p.amount) FROM supplier_payments p
                WHERE p.shop_id = p_shop_id AND p.supplier_id = p_supplier_id
                  AND NOT EXISTS (SELECT 1 FROM supplier_payment_voids v WHERE v.payment_id = p.id)), 0);
END;
$$;

-- ---------- 3. post_purchase ----------
-- p_lines: [{"product_id": "<uuid>", "qty_milli": "100000", "unit_cost": "9000"}]; birlik va nom tovardan olinadi (server).
-- p_paid: shu kirim bilan ta'minotchiga berilgan to'lov (bir tranzaksiyada); ta'minotchi balansidan oshmasligi kerak.
CREATE OR REPLACE FUNCTION post_purchase(
  p_shop_id uuid,
  p_purchase_id uuid,
  p_client_op_id text,
  p_supplier_id uuid,
  p_doc_date date,
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
  v_cost bigint;
  v_lt bigint;
  v_total bigint := 0;
  v_prod products%ROWTYPE;
  v_date date := coalesce(p_doc_date, (now() AT TIME ZONE 'Asia/Tashkent')::date);
BEGIN
  PERFORM require_shop_member(p_shop_id);

  SELECT id INTO v_existing FROM purchase_documents WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_documents WHERE id = p_purchase_id) THEN
    RAISE EXCEPTION 'id_conflict' USING ERRCODE = '23505';
  END IF;
  -- Ta'minotchi qatorini qulflash: parallel kirim/to'lovlar balansni buzmasin
  PERFORM 1 FROM suppliers WHERE id = p_supplier_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_in_shop' USING ERRCODE = '42501';
  END IF;
  IF v_date < DATE '2000-01-01' OR v_date > (now() AT TIME ZONE 'Asia/Tashkent')::date + 1 THEN
    RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023';
  END IF;
  IF p_paid IS NOT NULL AND p_paid < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_paid IS NOT NULL AND p_paid > 0 AND (p_payment_method IS NULL OR p_payment_method NOT IN ('naqd', 'karta', 'otkazma')) THEN
    RAISE EXCEPTION 'invalid_method' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_document' USING ERRCODE = '22023';
  END IF;

  INSERT INTO purchase_documents (id, shop_id, supplier_id, doc_date, status, subtotal, ts_total, client_op_id, created_by, created_at)
  VALUES (p_purchase_id, p_shop_id, p_supplier_id, v_date, 'draft', 0, p_client_total, p_client_op_id, auth.uid(), p_created_at);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := (v_line->>'qty_milli')::bigint;
    v_cost := (v_line->>'unit_cost')::bigint;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
      RAISE EXCEPTION 'invalid_qty' USING ERRCODE = '22023';
    END IF;
    IF v_cost IS NULL OR v_cost < 0 OR v_cost > 100000000 THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
    END IF;
    IF v_line->>'product_id' IS NULL OR v_line->>'product_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid_product' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_prod FROM products WHERE id = (v_line->>'product_id')::uuid AND shop_id = p_shop_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_lt := calculate_line_total(v_qty, v_cost);
    INSERT INTO purchase_lines (document_id, shop_id, line_index, product_id, product_name, qty_milli, unit, unit_cost, line_total)
    VALUES (p_purchase_id, p_shop_id, v_idx, v_prod.id, v_prod.name, v_qty, v_prod.unit, v_cost, v_lt);
    INSERT INTO stock_movements (shop_id, product_id, kind, qty_milli, document_id, created_by, created_at)
    VALUES (p_shop_id, v_prod.id, 'purchase', v_qty, p_purchase_id, auth.uid(), p_created_at);
    -- Oxirgi kirim tan narxi
    UPDATE products SET cost_price = v_cost, updated_at = now() WHERE id = v_prod.id;
    v_total := v_total + v_lt;
    v_idx := v_idx + 1;
  END LOOP;

  -- Mustaqil server hisobi; mos kelmasa hech narsa saqlanmaydi
  IF v_total <> p_client_total THEN
    RAISE EXCEPTION 'calc_mismatch: server=%, client=%', v_total, p_client_total USING ERRCODE = '22000';
  END IF;

  UPDATE purchase_documents SET status = 'posted', subtotal = v_total, pg_total = v_total, calc_match = true, posted_at = now()
  WHERE id = p_purchase_id;

  IF p_paid IS NOT NULL AND p_paid > 0 THEN
    IF p_paid > supplier_outstanding(p_shop_id, p_supplier_id) THEN
      RAISE EXCEPTION 'payment_exceeds_debt: debt=%', supplier_outstanding(p_shop_id, p_supplier_id) USING ERRCODE = '22000';
    END IF;
    INSERT INTO supplier_payments (id, shop_id, client_op_id, supplier_id, amount, method, note, created_by, created_at)
    VALUES (gen_random_uuid(), p_shop_id, 'purchase-pay:' || p_client_op_id, p_supplier_id, p_paid, p_payment_method,
            'kirim bilan', auth.uid(), p_created_at);
  END IF;
  RETURN p_purchase_id;
END;
$$;

-- ---------- 4. reverse_purchase ----------
-- Teskari yozuv: qoldiq qaytadi, ta'minotchiga qarz kamayadi, tan narx oldingi kirimdagisiga qaytadi.
-- Kirim bilan berilgan to'lov bekor qilinmaydi (ta'minotchining hisobi bor): u hisobda ortiqcha to'lov bo'lib qoladi.
CREATE OR REPLACE FUNCTION reverse_purchase(p_shop_id uuid, p_document_id uuid, p_client_op_id text, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc purchase_documents%ROWTYPE;
  v_rev uuid;
  v_pid uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  SELECT id INTO v_rev FROM purchase_reversals WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_rev IS NOT NULL THEN
    RETURN v_rev;
  END IF;
  SELECT * INTO v_doc FROM purchase_documents WHERE id = p_document_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.status <> 'posted' THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = '23505';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO purchase_reversals (shop_id, document_id, client_op_id, amount, reason, created_by)
  VALUES (p_shop_id, p_document_id, p_client_op_id, v_doc.subtotal, trim(p_reason), auth.uid())
  RETURNING id INTO v_rev;
  UPDATE purchase_documents SET status = 'reversed' WHERE id = p_document_id;

  INSERT INTO stock_movements (shop_id, product_id, kind, qty_milli, document_id, note, created_by)
  SELECT shop_id, product_id, 'purchase_reversal', -qty_milli, document_id, trim(p_reason), auth.uid()
  FROM stock_movements WHERE document_id = p_document_id AND kind = 'purchase';

  -- Tan narx: bekor qilingan kirimdagi tovarlar uchun oxirgi QOLGAN kirim narxi (yo'q bo'lsa NULL)
  FOR v_pid IN SELECT DISTINCT product_id FROM purchase_lines WHERE document_id = p_document_id LOOP
    UPDATE products SET updated_at = now(), cost_price = (
      SELECT l.unit_cost FROM purchase_lines l JOIN purchase_documents d ON d.id = l.document_id
      WHERE l.product_id = v_pid AND d.status = 'posted' AND d.shop_id = p_shop_id
      ORDER BY d.posted_at DESC, l.line_index DESC LIMIT 1)
    WHERE id = v_pid;
  END LOOP;
  RETURN v_rev;
END;
$$;

-- ---------- 5. Ta'minotchiga to'lov ----------
CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_shop_id uuid,
  p_payment_id uuid,
  p_client_op_id text,
  p_supplier_id uuid,
  p_amount bigint,
  p_method text,
  p_note text,
  p_created_at timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_outstanding bigint;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  SELECT id INTO v_existing FROM supplier_payments WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('naqd', 'karta', 'otkazma') THEN
    RAISE EXCEPTION 'invalid_method' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM suppliers WHERE id = p_supplier_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_in_shop' USING ERRCODE = '42501';
  END IF;
  v_outstanding := supplier_outstanding(p_shop_id, p_supplier_id);
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'payment_exceeds_debt: debt=%', v_outstanding USING ERRCODE = '22000';
  END IF;
  INSERT INTO supplier_payments (id, shop_id, client_op_id, supplier_id, amount, method, note, created_by, created_at)
  VALUES (p_payment_id, p_shop_id, p_client_op_id, p_supplier_id, p_amount, p_method, nullif(trim(p_note), ''), auth.uid(), p_created_at);
  RETURN p_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION void_supplier_payment(p_shop_id uuid, p_payment_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  IF NOT EXISTS (SELECT 1 FROM supplier_payments WHERE id = p_payment_id AND shop_id = p_shop_id) THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_id FROM supplier_payment_voids WHERE payment_id = p_payment_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO supplier_payment_voids (shop_id, payment_id, reason, created_by)
  VALUES (p_shop_id, p_payment_id, trim(p_reason), auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 6. Oldi-berdi (Eski / Tovar / Jami / Berildi / Ostatka) ----------
-- Hamkor bo'yicha davr hisoboti (Toshkent sanasi, ikkala chegara ham kiradi).
--   Eski    = davr boshigacha bo'lgan qoldiq
--   Tovar   = davrdagi savdo (mijoz) yoki kirim (ta'minotchi)
--   Jami    = Eski + Tovar
--   Berildi = davrdagi to'lovlar (bekor qilinmagan)
--   Ostatka = Jami - Berildi
-- Bekor qilingan hujjat/to'lov hech qachon hisobga olinmaydi (customer_outstanding va supplier_outstanding bilan bir xil qoida).
-- Mijoz uchun hujjat sanasi documents.created_at, ta'minotchi uchun purchase_documents.doc_date.
CREATE OR REPLACE FUNCTION partner_statement(p_shop_id uuid, p_kind text, p_partner_id uuid, p_from date, p_to date)
RETURNS TABLE (opening bigint, goods bigint, total bigint, paid bigint, balance bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_open_g bigint;
  v_open_p bigint;
  v_goods bigint;
  v_paid bigint;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_kind NOT IN ('customer', 'supplier') OR p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;
  v_from := p_from::timestamp AT TIME ZONE 'Asia/Tashkent';
  v_to := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Tashkent';
  IF p_kind = 'customer' THEN
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_partner_id AND shop_id = p_shop_id) THEN
      RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(SUM(subtotal) FILTER (WHERE created_at < v_from), 0), COALESCE(SUM(subtotal) FILTER (WHERE created_at >= v_from AND created_at < v_to), 0)
      INTO v_open_g, v_goods
      FROM documents WHERE shop_id = p_shop_id AND customer_id = p_partner_id AND status = 'posted';
    SELECT COALESCE(SUM(amount) FILTER (WHERE created_at < v_from), 0), COALESCE(SUM(amount) FILTER (WHERE created_at >= v_from AND created_at < v_to), 0)
      INTO v_open_p, v_paid
      FROM payments p WHERE shop_id = p_shop_id AND customer_id = p_partner_id
        AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id);
  ELSE
    IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_partner_id AND shop_id = p_shop_id) THEN
      RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(SUM(subtotal) FILTER (WHERE doc_date < p_from), 0), COALESCE(SUM(subtotal) FILTER (WHERE doc_date >= p_from AND doc_date <= p_to), 0)
      INTO v_open_g, v_goods
      FROM purchase_documents WHERE shop_id = p_shop_id AND supplier_id = p_partner_id AND status = 'posted';
    SELECT COALESCE(SUM(amount) FILTER (WHERE created_at < v_from), 0), COALESCE(SUM(amount) FILTER (WHERE created_at >= v_from AND created_at < v_to), 0)
      INTO v_open_p, v_paid
      FROM supplier_payments p WHERE shop_id = p_shop_id AND supplier_id = p_partner_id
        AND NOT EXISTS (SELECT 1 FROM supplier_payment_voids v WHERE v.payment_id = p.id);
  END IF;
  RETURN QUERY SELECT v_open_g - v_open_p, v_goods, v_open_g - v_open_p + v_goods, v_paid, v_open_g - v_open_p + v_goods - v_paid;
END;
$$;

-- ---------- 7. Funksiya huquqlari ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'supplier_outstanding', 'post_purchase', 'reverse_purchase', 'record_supplier_payment', 'void_supplier_payment', 'partner_statement'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
