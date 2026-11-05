-- ============================================================
-- 008: Agent kirim qoralamasi, ta'minotchilar va tovar qoldig'i (PROMPT-3, S5)
--
-- Agent (MCP) yozmaydi. Bu migratsiya faqat QORALAMA va O'QISH imkoniyatlarini qo'shadi:
--   * agent_drafts.kind 'purchase' (kirim qoralamasi): ta'minotchi = target_id, qatorlar tovar id bilan.
--     Qoralama ledger, ombor va ta'minotchi qarziga TA'SIR QILMAYDI. Tasdiqlash faqat ilova/veb sessiyasida
--     (accept_agent_draft -> mavjud post_purchase: ikki mustaqil hisob, qarz tekshiruvi qayta ishlaydi).
--   * agent_draft_sale: bir martalik mijoz (p_walkin) va to'lov usuli/summasi. Bir martalik mijoz qarzga olmaydi
--     (jami to'liq to'lanishi shart). Bir martalik mijoz id'si TASDIQLASH paytida ensure_walkin_customer bilan olinadi
--     (agent tizim mijozini yaratmaydi).
--   * agent_list_products: qoldiq (stock_milli) va tan narx (cost_price) qo'shildi; narx = sale_price (yo'q bo'lsa last_price).
--   * agent_list_suppliers: ta'minotchilar va ularga qarzimiz.
-- accept_agent_draft: sale (walkin/to'lov bilan) va purchase tarmoqlari; eskirgan qoralama (arxivlangan ta'minotchi/tovar) rad etiladi.
--
-- Eslatma: agent_list_products va agent_draft_sale qaytish/argumentlar ro'yxati o'zgargani uchun avval DROP FUNCTION,
-- keyin yangidan yaratiladi (eski chaqiruvlar yangi ixtiyoriy argumentlar tufayli ishlayveradi; qo'shimcha ustunlar qo'shilgan).
-- Qayta ishga tushirish xavfsiz. Talab: 001..007.
-- ============================================================

-- ---------- 1. agent_drafts: 'purchase' turi ----------
ALTER TABLE agent_drafts DROP CONSTRAINT IF EXISTS agent_drafts_kind_check;
ALTER TABLE agent_drafts ADD CONSTRAINT agent_drafts_kind_check
  CHECK (kind IN ('sale', 'payment', 'customer_update', 'product_update', 'customer_archive', 'product_archive', 'purchase'));
ALTER TABLE agent_drafts DROP CONSTRAINT IF EXISTS agent_drafts_purchase_supplier;
ALTER TABLE agent_drafts ADD CONSTRAINT agent_drafts_purchase_supplier CHECK (kind <> 'purchase' OR target_id IS NOT NULL);

-- ---------- 2. Agent o'qish: tovarlar (qoldiq va tan narx bilan) ----------
DROP FUNCTION IF EXISTS agent_list_products(uuid, text, boolean, int, int);
CREATE OR REPLACE FUNCTION agent_list_products(
  p_shop_id uuid, p_query text DEFAULT NULL, p_include_archived boolean DEFAULT false,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE (id uuid, name text, unit text, price bigint, is_active boolean, source text, stock_milli bigint, cost_price bigint)
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
    SELECT p.id, p.name, p.unit, coalesce(p.sale_price, p.last_price), p.is_active, p.source,
           coalesce((SELECT sum(m.qty_milli) FROM stock_movements m WHERE m.shop_id = p_shop_id AND m.product_id = p.id), 0)::bigint,
           p.cost_price
    FROM products p
    WHERE p.shop_id = p_shop_id AND (coalesce(p_include_archived, false) OR p.is_active)
      AND (v_like IS NULL OR p.name ILIKE v_like)
    ORDER BY p.name, p.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
    OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- ---------- 3. Agent o'qish: ta'minotchilar (biz ularga qarz) ----------
CREATE OR REPLACE FUNCTION agent_list_suppliers(
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
    SELECT s.id, s.name, supplier_outstanding(p_shop_id, s.id)
    FROM suppliers s
    WHERE s.shop_id = p_shop_id AND s.is_active AND (v_like IS NULL OR s.name ILIKE v_like)
    ORDER BY s.name, s.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
    OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- ---------- 4. Agent qoralama: savdo (bir martalik mijoz va to'lov bilan) ----------
-- p_walkin = true: mijoz id yuborilmaydi; to'lov usuli majburiy, to'lov jamiga teng.
-- Jami PostgreSQL'da hisoblanadi va klient jami bilan solishtiriladi: mos kelmasa qoralama yaratilmaydi.
DROP FUNCTION IF EXISTS agent_draft_sale(uuid, text, uuid, text, jsonb, bigint);
CREATE OR REPLACE FUNCTION agent_draft_sale(
  p_shop_id uuid,
  p_client_op_id text,
  p_customer_id uuid,
  p_raw_input text,
  p_lines jsonb,
  p_client_total bigint,
  p_walkin boolean DEFAULT false,
  p_payment_method text DEFAULT NULL,
  p_paid bigint DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_line jsonb;
  v_out jsonb := '[]'::jsonb;
  v_qty bigint;
  v_price bigint;
  v_lt bigint;
  v_total bigint := 0;
  v_warn jsonb;
  v_paid bigint;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_client_op_id IS NULL OR char_length(p_client_op_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_client_op_id' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM agent_drafts WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id; -- idempotent
  END IF;
  IF (SELECT count(*) FROM agent_drafts WHERE shop_id = p_shop_id AND status = 'draft') >= 50 THEN
    RAISE EXCEPTION 'too_many_drafts' USING ERRCODE = '54000';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND shop_id = p_shop_id) THEN
    RAISE EXCEPTION 'customer_not_in_shop' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_walkin, false) AND p_customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_customer' USING ERRCODE = '22023';
  END IF;
  IF p_paid IS NOT NULL AND p_paid < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF (coalesce(p_walkin, false) OR coalesce(p_paid, 0) > 0)
     AND (p_payment_method IS NULL OR p_payment_method NOT IN ('naqd', 'karta', 'otkazma')) THEN
    RAISE EXCEPTION 'invalid_method' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_paid, 0) > 0 AND NOT coalesce(p_walkin, false) AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'payment_requires_customer' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_raw_input, '')) > 2000 THEN
    RAISE EXCEPTION 'raw_input_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_lines' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := (v_line->>'qty_milli')::bigint;
    v_price := (v_line->>'unit_price')::bigint;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
      RAISE EXCEPTION 'invalid_qty' USING ERRCODE = '22023';
    END IF;
    IF v_price IS NULL OR v_price < 0 OR v_price > 100000000 THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
    END IF;
    IF char_length(trim(coalesce(v_line->>'product_name', ''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'invalid_product_name' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_line->>'unit', '') NOT IN ('dona','kg','g','litr','metr','pachka','qop','karobka','tonna') THEN
      RAISE EXCEPTION 'invalid_unit' USING ERRCODE = '22023';
    END IF;
    v_warn := CASE WHEN jsonb_typeof(v_line->'warnings') = 'array'
                   THEN (SELECT COALESCE(jsonb_agg(left(w, 200)), '[]'::jsonb)
                         FROM (SELECT w FROM jsonb_array_elements_text(v_line->'warnings') AS w LIMIT 5) x)
                   ELSE '[]'::jsonb END;
    v_lt := calculate_line_total(v_qty, v_price);
    v_total := v_total + v_lt;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'product_name', trim(v_line->>'product_name'),
      'qty_milli', v_qty::text,
      'unit', v_line->>'unit',
      'unit_price', v_price::text,
      'line_total', v_lt::text,
      'raw_text', left(v_line->>'raw_text', 500),
      'warnings', v_warn));
  END LOOP;

  IF v_total <> p_client_total THEN
    RAISE EXCEPTION 'calc_mismatch: server=%, client=%', v_total, p_client_total USING ERRCODE = '22000';
  END IF;

  -- Bir martalik mijoz qarzga olmaydi: to'liq to'lanadi. Doimiy mijoz: to'lov jamidan oshmasligi kerak.
  IF coalesce(p_walkin, false) THEN
    IF p_paid IS NOT NULL AND p_paid <> v_total THEN
      RAISE EXCEPTION 'walkin_requires_full_payment: total=%', v_total USING ERRCODE = '22000';
    END IF;
    v_paid := v_total;
  ELSE
    IF p_paid IS NOT NULL AND p_paid > v_total THEN
      RAISE EXCEPTION 'payment_exceeds_debt: debt=%', v_total USING ERRCODE = '22000';
    END IF;
    v_paid := nullif(p_paid, 0);
  END IF;

  INSERT INTO agent_drafts (shop_id, kind, customer_id, total, payload, client_op_id, client_id, created_by)
  VALUES (p_shop_id, 'sale', p_customer_id, v_total,
          jsonb_build_object('raw_input', left(p_raw_input, 2000), 'lines', v_out,
                             'walkin', coalesce(p_walkin, false),
                             'payment_method', CASE WHEN v_paid IS NOT NULL THEN p_payment_method END,
                             'paid', v_paid::text),
          p_client_op_id, coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 5. Agent qoralama: kirim ----------
-- p_lines: [{"product_id":"<uuid>","qty_milli":"100000","unit_cost":"9000","warnings":["..."]}]
-- Birlik va nom tovardan olinadi (server). Jami PostgreSQL'da hisoblanadi, klient jami bilan solishtiriladi.
-- p_paid: shu kirim bilan berilishi rejalashtirilgan to'lov (Eski + Tovar dan oshmasligi kerak). Qoralama hech narsa yozmaydi.
CREATE OR REPLACE FUNCTION agent_draft_purchase(
  p_shop_id uuid,
  p_client_op_id text,
  p_supplier_id uuid,
  p_doc_date date,
  p_lines jsonb,
  p_client_total bigint,
  p_payment_method text DEFAULT NULL,
  p_paid bigint DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_line jsonb;
  v_out jsonb := '[]'::jsonb;
  v_qty bigint;
  v_cost bigint;
  v_lt bigint;
  v_total bigint := 0;
  v_warn jsonb;
  v_prod products%ROWTYPE;
  v_date date := coalesce(p_doc_date, (now() AT TIME ZONE 'Asia/Tashkent')::date);
  v_open bigint;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_client_op_id IS NULL OR char_length(p_client_op_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_client_op_id' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM agent_drafts WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id; -- idempotent
  END IF;
  IF (SELECT count(*) FROM agent_drafts WHERE shop_id = p_shop_id AND status = 'draft') >= 50 THEN
    RAISE EXCEPTION 'too_many_drafts' USING ERRCODE = '54000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id AND shop_id = p_shop_id AND is_active) THEN
    RAISE EXCEPTION 'supplier_not_in_shop' USING ERRCODE = '42501';
  END IF;
  IF v_date < DATE '2000-01-01' OR v_date > (now() AT TIME ZONE 'Asia/Tashkent')::date + 1 THEN
    RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_paid IS NOT NULL AND p_paid < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_paid, 0) > 0 AND (p_payment_method IS NULL OR p_payment_method NOT IN ('naqd', 'karta', 'otkazma')) THEN
    RAISE EXCEPTION 'invalid_method' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_lines' USING ERRCODE = '22023';
  END IF;

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
    SELECT * INTO v_prod FROM products WHERE id = (v_line->>'product_id')::uuid AND shop_id = p_shop_id AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_warn := CASE WHEN jsonb_typeof(v_line->'warnings') = 'array'
                   THEN (SELECT COALESCE(jsonb_agg(left(w, 200)), '[]'::jsonb)
                         FROM (SELECT w FROM jsonb_array_elements_text(v_line->'warnings') AS w LIMIT 5) x)
                   ELSE '[]'::jsonb END;
    v_lt := calculate_line_total(v_qty, v_cost);
    v_total := v_total + v_lt;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'product_id', v_prod.id::text,
      'product_name', v_prod.name,
      'qty_milli', v_qty::text,
      'unit', v_prod.unit,
      'unit_cost', v_cost::text,
      'line_total', v_lt::text,
      'warnings', v_warn));
  END LOOP;

  IF v_total <> p_client_total THEN
    RAISE EXCEPTION 'calc_mismatch: server=%, client=%', v_total, p_client_total USING ERRCODE = '22000';
  END IF;

  -- To'lov Eski + Tovar dan oshmasligi kerak (tasdiqlashda post_purchase ham tekshiradi)
  IF coalesce(p_paid, 0) > 0 THEN
    v_open := supplier_outstanding(p_shop_id, p_supplier_id);
    IF p_paid > v_open + v_total THEN
      RAISE EXCEPTION 'payment_exceeds_debt: debt=%', v_open + v_total USING ERRCODE = '22000';
    END IF;
  END IF;

  INSERT INTO agent_drafts (shop_id, kind, customer_id, target_id, total, payload, client_op_id, client_id, created_by)
  VALUES (p_shop_id, 'purchase', NULL, p_supplier_id, v_total,
          jsonb_build_object('doc_date', v_date::text, 'lines', v_out,
                             'payment_method', CASE WHEN coalesce(p_paid, 0) > 0 THEN p_payment_method END,
                             'paid', nullif(p_paid, 0)::text,
                             'note', left(p_note, 500)),
          p_client_op_id, coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 6. Tasdiqlash: faqat birinchi tomon (ilova/veb) sessiyasi ----------
-- 005 dagi tana + savdo (bir martalik mijoz, to'lov) va kirim tarmoqlari. OAuth token chaqira olmaydi.
CREATE OR REPLACE FUNCTION accept_agent_draft(p_draft_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d agent_drafts%ROWTYPE;
  v_lines jsonb;
  v_customer uuid;
  v_paid bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  PERFORM assert_first_party();
  SELECT * INTO v_d FROM agent_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR NOT is_shop_member(v_d.shop_id) THEN
    RAISE EXCEPTION 'draft_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_d.status <> 'draft' THEN
    RAISE EXCEPTION 'draft_already_decided' USING ERRCODE = '23505';
  END IF;

  IF v_d.kind = 'sale' THEN
    SELECT jsonb_agg(jsonb_build_object(
             'product_name', e.value->>'product_name', 'qty_milli', e.value->>'qty_milli',
             'unit', e.value->>'unit', 'unit_price', e.value->>'unit_price', 'raw_text', e.value->>'raw_text')
           ORDER BY e.ord)
      INTO v_lines
      FROM jsonb_array_elements(v_d.payload->'lines') WITH ORDINALITY AS e(value, ord);
    v_customer := v_d.customer_id;
    IF coalesce((v_d.payload->>'walkin')::boolean, false) THEN
      v_customer := ensure_walkin_customer(v_d.shop_id);
    END IF;
    v_paid := nullif(v_d.payload->>'paid', '')::bigint;
    PERFORM post_sale(v_d.shop_id, v_d.id, 'agent-draft:' || v_d.id::text, v_customer,
                      v_d.payload->>'raw_input', v_lines, v_d.total, now(),
                      CASE WHEN v_paid IS NOT NULL THEN v_d.payload->>'payment_method' END, v_paid);
  ELSIF v_d.kind = 'purchase' THEN
    -- Eskirgan qoralama: ta'minotchi yoki tovar shu orada arxivlangan
    IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_d.target_id AND shop_id = v_d.shop_id AND is_active) THEN
      RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_d.payload->'lines') AS e(value)
      WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = (e.value->>'product_id')::uuid AND shop_id = v_d.shop_id AND is_active)
    ) THEN
      RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001';
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
             'product_id', e.value->>'product_id', 'qty_milli', e.value->>'qty_milli', 'unit_cost', e.value->>'unit_cost')
           ORDER BY e.ord)
      INTO v_lines
      FROM jsonb_array_elements(v_d.payload->'lines') WITH ORDINALITY AS e(value, ord);
    v_paid := nullif(v_d.payload->>'paid', '')::bigint;
    PERFORM post_purchase(v_d.shop_id, v_d.id, 'agent-draft:' || v_d.id::text, v_d.target_id,
                          (v_d.payload->>'doc_date')::date, v_lines, v_d.total, now(),
                          CASE WHEN v_paid IS NOT NULL THEN v_d.payload->>'payment_method' END, v_paid);
  ELSIF v_d.kind = 'payment' THEN
    PERFORM record_payment(v_d.shop_id, v_d.id, 'agent-draft:' || v_d.id::text, v_d.customer_id,
                           v_d.total, v_d.payload->>'method', v_d.payload->>'note', now());
  ELSE
    PERFORM apply_catalog_draft(v_d);
  END IF;

  UPDATE agent_drafts SET status = 'accepted', decided_by = auth.uid(), decided_at = now() WHERE id = v_d.id;
  RETURN v_d.id;
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
      'agent_list_products', 'agent_list_suppliers', 'agent_draft_sale', 'agent_draft_purchase', 'accept_agent_draft'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
