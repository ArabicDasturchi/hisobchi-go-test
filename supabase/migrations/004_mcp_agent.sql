-- ============================================================
-- HISOBCHI GO — 004: MCP agent uchun xavfsiz qatlam
-- ============================================================
-- Maqsad: tashqi AI (Claude/ChatGPT) Supabase OAuth 2.1 tokeni bilan faqat KO'RA oladi va
-- QORALAMA yarata oladi. Tasdiqlash, bekor qilish va to'g'ridan-to'g'ri yozuv taqiqlanadi.
--
-- Muhim: OAuth tokeni oddiy foydalanuvchi JWT'si, unda `client_id` claim bor (Supabase hujjati).
-- Token AI klientning qo'lida, shuning uchun "MCP serverda confirm yo'q" degan qoida yetarli emas:
-- klient PostgREST orqali post_sale ni o'zi chaqira olardi. Kafolat bazada:
--   1. `client_id` bor token yozuv RPC'larini (create_shop, post_sale, reverse_sale, record_payment,
--      void_payment) va tasdiqlash RPC'larini chaqira olmaydi (require_shop_member / assert_first_party).
--   2. Barcha ijarachi jadvallarida RESTRICTIVE siyosat: OAuth token jadvallarni to'g'ridan-to'g'ri
--      o'qiy ham, yoza ham olmaydi (mijoz telefoni va izohlar AI provayderga chiqmasligi uchun).
--   3. Agent faqat agent_* RPC'larini chaqiradi: ular a'zolikni tekshiradi va faqat xavfsiz ustunlarni qaytaradi.
-- Xavfsizlik xatosi tuzatildi: customer_outstanding() a'zolikni tekshirmasdi (boshqa do'kon qarzi ko'rinardi).
--
-- Qayta ishga tushirish xavfsiz (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE). Ma'lumot o'chirilmaydi.
-- Talab: 001 va 003 qo'llangan bo'lishi kerak.
-- ============================================================

-- ---------- 1. Token turi ----------
CREATE OR REPLACE FUNCTION is_oauth_client_token()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.jwt() ->> 'client_id', '') <> '';
$$;

CREATE OR REPLACE FUNCTION assert_first_party()
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF is_oauth_client_token() THEN
    RAISE EXCEPTION 'oauth_client_forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ---------- 2. A'zolik tekshiruvi ----------
-- require_shop_member endi faqat birinchi tomon (ilova/veb) sessiyasiga ruxsat beradi.
-- Uni 003 dagi barcha yozuv RPC'lari chaqiradi (post_sale, reverse_sale, record_payment, void_payment),
-- shuning uchun ular OAuth token bilan ishlamaydi. Kelajakdagi yozuv RPC'lari ham shu bilan xavfsiz bo'ladi.
CREATE OR REPLACE FUNCTION require_shop_member(p_shop_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  PERFORM assert_first_party();
  IF p_shop_id IS NULL OR NOT is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Agent o'qish/qoralama RPC'lari uchun: a'zolik tekshiriladi, token turi cheklanmaydi.
CREATE OR REPLACE FUNCTION require_shop_member_agent(p_shop_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_shop_id IS NULL OR NOT is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- create_shop (003 dagi tana + OAuth to'sig'i)
CREATE OR REPLACE FUNCTION create_shop(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  PERFORM assert_first_party();
  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_shop_name' USING ERRCODE = '22023';
  END IF;
  SELECT m.shop_id INTO v_shop FROM shop_members m WHERE m.user_id = auth.uid() AND m.role = 'owner' LIMIT 1;
  IF v_shop IS NOT NULL THEN
    RETURN v_shop;
  END IF;
  INSERT INTO shops (name) VALUES (trim(p_name)) RETURNING id INTO v_shop;
  INSERT INTO shop_members (shop_id, user_id, role) VALUES (v_shop, auth.uid(), 'owner');
  RETURN v_shop;
END;
$$;

-- ---------- 3. customer_outstanding: a'zolik tekshiruvi (xavfsizlik xatosi tuzatildi) ----------
-- Qoida 003 dagi bilan bir xil; faqat boshida a'zolik tekshiriladi. record_payment ham shuni chaqiradi
-- (u allaqachon a'zolikni tekshirgan, ikkinchi tekshiruv zarar qilmaydi). Mobil va veb uni RPC sifatida
-- chaqirmaydi (qarzni o'zlari hisoblaydi), shuning uchun ularga ta'sir qilmaydi.
CREATE OR REPLACE FUNCTION customer_outstanding(p_shop_id uuid, p_customer_id uuid)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  RETURN
    COALESCE((SELECT SUM(d.subtotal) FROM documents d
              WHERE d.shop_id = p_shop_id AND d.customer_id = p_customer_id AND d.status = 'posted'), 0)
    - COALESCE((SELECT SUM(p.amount) FROM payments p
                WHERE p.shop_id = p_shop_id AND p.customer_id = p_customer_id
                  AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id)), 0);
END;
$$;

-- ---------- 4. Qoralamalar jadvali ----------
-- Ledger'dan butunlay alohida: qoralama savdo, ledger va qarzga ta'sir qilmaydi.
-- Qabul qilinganda hujjat/to'lov id si = qoralama id si.
CREATE TABLE IF NOT EXISTS agent_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('sale', 'payment')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'accepted', 'rejected')),
  customer_id   uuid REFERENCES customers(id),
  -- PostgreSQL hisoblagan jami (butun so'm)
  total         bigint NOT NULL CHECK (total >= 0),
  -- sale: {raw_input, lines:[{product_name, qty_milli, unit, unit_price, line_total, raw_text, warnings}]}
  -- payment: {method, note}
  payload       jsonb NOT NULL,
  client_op_id  text NOT NULL,
  -- OAuth klient (client_id claim); birinchi tomon sessiyasi bo'lsa 'first_party'
  client_id     text NOT NULL,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid,
  decided_at    timestamptz,
  reject_reason text,
  UNIQUE (shop_id, client_op_id),
  CHECK (kind <> 'payment' OR customer_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_shop_status ON agent_drafts(shop_id, status, created_at DESC);

ALTER TABLE agent_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_drafts_select ON agent_drafts;
CREATE POLICY agent_drafts_select ON agent_drafts FOR SELECT USING (is_shop_member(shop_id));

-- Qoralama mazmuni o'zgarmaydi; faqat 'draft' → 'accepted' | 'rejected'. O'chirish yo'q.
CREATE OR REPLACE FUNCTION agent_drafts_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only: agent_drafts yozuvini o''chirish taqiqlangan';
  END IF;
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'draft_already_decided';
  END IF;
  IF NEW.status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'draft_invalid_transition';
  END IF;
  IF (NEW.id, NEW.shop_id, NEW.kind, NEW.customer_id, NEW.total, NEW.payload, NEW.client_op_id, NEW.client_id,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.shop_id, OLD.kind, OLD.customer_id, OLD.total, OLD.payload, OLD.client_op_id, OLD.client_id,
      OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'draft_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_agent_drafts_guard ON agent_drafts;
CREATE TRIGGER trg_agent_drafts_guard BEFORE UPDATE OR DELETE ON agent_drafts
  FOR EACH ROW EXECUTE FUNCTION agent_drafts_guard();

REVOKE ALL ON agent_drafts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON agent_drafts FROM authenticated;
GRANT SELECT ON agent_drafts TO authenticated;

-- ---------- 5. OAuth token jadvallarga to'g'ridan-to'g'ri tegmaydi ----------
-- RESTRICTIVE siyosat boshqa siyosatlar bilan AND qilinadi. SECURITY DEFINER RPC'lar (agent_*) buni chetlab o'tadi,
-- chunki ular jadval egasi sifatida ishlaydi va o'zlari a'zolikni tekshiradi.
-- YANGI ijarachi jadval qo'shilsa — shu ro'yxatga qo'shing (testda tekshiriladi).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'shops', 'shop_members', 'products', 'product_aliases', 'customers', 'documents', 'document_lines',
    'ledger_entries', 'audit_log', 'document_reversals', 'payments', 'payment_voids', 'agent_drafts'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_no_oauth', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token())',
      t || '_no_oauth', t);
  END LOOP;
END $$;

-- ---------- 6. Agent: o'qish RPC'lari (faqat xavfsiz ustunlar) ----------
-- Telefon, izoh (notes), xom matn (raw_input/raw_text) va to'lov izohi QAYTARILMAYDI.

CREATE OR REPLACE FUNCTION agent_whoami()
RETURNS TABLE (shop_id uuid, shop_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, m.role
  FROM shop_members m JOIN shops s ON s.id = m.shop_id
  WHERE m.user_id = auth.uid()
  ORDER BY s.created_at, s.id;
$$;

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
    WHERE c.shop_id = p_shop_id AND (v_like IS NULL OR c.name ILIKE v_like)
    ORDER BY c.name, c.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
    OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

CREATE OR REPLACE FUNCTION agent_customer_balance(p_shop_id uuid, p_customer_id uuid)
RETURNS TABLE (id uuid, name text, outstanding bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  RETURN QUERY
    SELECT c.id, c.name, customer_outstanding(p_shop_id, c.id)
    FROM customers c WHERE c.id = p_customer_id AND c.shop_id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION agent_list_sales(
  p_shop_id uuid, p_customer_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_status text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE (id uuid, customer_id uuid, customer_name text, status text, subtotal bigint, line_count bigint, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_status IS NOT NULL AND p_status NOT IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT d.id, d.customer_id, c.name, d.status, d.subtotal,
           (SELECT count(*) FROM document_lines l WHERE l.document_id = d.id), d.created_at
    FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.shop_id = p_shop_id
      AND d.status IN ('posted', 'reversed')
      AND (p_customer_id IS NULL OR d.customer_id = p_customer_id)
      AND (p_status IS NULL OR d.status = p_status)
      -- Sana Toshkent vaqti bo'yicha (UTC+5, yozgi vaqt yo'q)
      AND (p_from IS NULL OR d.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Tashkent'))
      AND (p_to IS NULL OR d.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Tashkent'))
    ORDER BY d.created_at DESC, d.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
    OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

CREATE OR REPLACE FUNCTION agent_get_sale(p_shop_id uuid, p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc documents%ROWTYPE;
  v_name text;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  SELECT * INTO v_doc FROM documents WHERE id = p_sale_id AND shop_id = p_shop_id AND status IN ('posted', 'reversed');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT name INTO v_name FROM customers WHERE id = v_doc.customer_id;
  RETURN jsonb_build_object(
    'id', v_doc.id,
    'customer_id', v_doc.customer_id,
    'customer_name', v_name,
    'status', v_doc.status,
    'subtotal', v_doc.subtotal,
    'created_at', v_doc.created_at,
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'line_index', l.line_index, 'product_name', l.product_name, 'qty_milli', l.qty_milli,
        'unit', l.unit, 'unit_price', l.unit_price, 'line_total', l.line_total) ORDER BY l.line_index)
      FROM document_lines l WHERE l.document_id = v_doc.id), '[]'::jsonb),
    'reversal', (SELECT jsonb_build_object('reason', r.reason, 'created_at', r.created_at)
                 FROM document_reversals r WHERE r.document_id = v_doc.id)
  );
END;
$$;

-- Kunlik hisobot uchun xom qatorlar. Jamini TypeScript (BigInt) hisoblaydi; `pg_totals` — ikkinchi, mustaqil
-- PostgreSQL yig'indisi: server ikkalasini solishtiradi, mos kelmasa hisobot berilmaydi.
CREATE OR REPLACE FUNCTION agent_day_rows(p_shop_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_day IS NULL THEN
    RAISE EXCEPTION 'invalid_day' USING ERRCODE = '22023';
  END IF;
  v_from := p_day::timestamp AT TIME ZONE 'Asia/Tashkent';
  v_to := (p_day + 1)::timestamp AT TIME ZONE 'Asia/Tashkent';
  RETURN jsonb_build_object(
    'day', p_day,
    'sales', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'status', d.status, 'subtotal', d.subtotal) ORDER BY d.created_at, d.id)
                       FROM documents d WHERE d.shop_id = p_shop_id AND d.status IN ('posted', 'reversed')
                         AND d.created_at >= v_from AND d.created_at < v_to), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'id', p.id, 'amount', p.amount,
                            'voided', EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id)) ORDER BY p.created_at, p.id)
                          FROM payments p WHERE p.shop_id = p_shop_id AND p.created_at >= v_from AND p.created_at < v_to), '[]'::jsonb),
    'pg_totals', jsonb_build_object(
      'sales_posted', COALESCE((SELECT SUM(d.subtotal) FROM documents d WHERE d.shop_id = p_shop_id AND d.status = 'posted'
                                AND d.created_at >= v_from AND d.created_at < v_to), 0),
      'sales_reversed', COALESCE((SELECT SUM(d.subtotal) FROM documents d WHERE d.shop_id = p_shop_id AND d.status = 'reversed'
                                  AND d.created_at >= v_from AND d.created_at < v_to), 0),
      'payments', COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.shop_id = p_shop_id
                            AND p.created_at >= v_from AND p.created_at < v_to
                            AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id)), 0))
  );
END;
$$;

-- ---------- 7. Agent: qoralama yaratish ----------
-- p_lines: [{"product_name","qty_milli":"10000","unit":"dona","unit_price":"13000","raw_text":"...","warnings":["..."]}]
-- Jami PostgreSQL'da hisoblanadi va klient (TypeScript) jami bilan solishtiriladi: mos kelmasa qoralama yaratilmaydi.
CREATE OR REPLACE FUNCTION agent_draft_sale(
  p_shop_id uuid,
  p_client_op_id text,
  p_customer_id uuid,
  p_raw_input text,
  p_lines jsonb,
  p_client_total bigint
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

  INSERT INTO agent_drafts (shop_id, kind, customer_id, total, payload, client_op_id, client_id, created_by)
  VALUES (p_shop_id, 'sale', p_customer_id, v_total,
          jsonb_build_object('raw_input', left(p_raw_input, 2000), 'lines', v_out),
          p_client_op_id, coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION agent_draft_payment(
  p_shop_id uuid,
  p_client_op_id text,
  p_customer_id uuid,
  p_amount bigint,
  p_method text,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_outstanding bigint;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_client_op_id IS NULL OR char_length(p_client_op_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_client_op_id' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM agent_drafts WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF (SELECT count(*) FROM agent_drafts WHERE shop_id = p_shop_id AND status = 'draft') >= 50 THEN
    RAISE EXCEPTION 'too_many_drafts' USING ERRCODE = '54000';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('naqd', 'karta', 'otkazma') THEN
    RAISE EXCEPTION 'invalid_method' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_note, '')) > 200 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND shop_id = p_shop_id) THEN
    RAISE EXCEPTION 'customer_not_in_shop' USING ERRCODE = '42501';
  END IF;
  -- Tasdiqlashda record_payment qarzni yana tekshiradi (qoralama va tasdiq orasida qarz o'zgarishi mumkin)
  v_outstanding := customer_outstanding(p_shop_id, p_customer_id);
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'payment_exceeds_debt: debt=%', v_outstanding USING ERRCODE = '22000';
  END IF;
  INSERT INTO agent_drafts (shop_id, kind, customer_id, total, payload, client_op_id, client_id, created_by)
  VALUES (p_shop_id, 'payment', p_customer_id, p_amount,
          jsonb_build_object('method', p_method, 'note', nullif(trim(p_note), '')),
          p_client_op_id, coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 8. Tasdiqlash / rad etish: FAQAT birinchi tomon (ilova/veb) sessiyasi ----------
-- OAuth token (client_id bor) bu RPC'larni chaqira olmaydi. MCP serverda ular YO'Q.
-- Tasdiqlash mavjud post_sale / record_payment orqali o'tadi: ikki mustaqil hisob va qarz tekshiruvi qayta ishlaydi.
CREATE OR REPLACE FUNCTION accept_agent_draft(p_draft_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d agent_drafts%ROWTYPE;
  v_lines jsonb;
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
    PERFORM post_sale(v_d.shop_id, v_d.id, 'agent-draft:' || v_d.id::text, v_d.customer_id,
                      v_d.payload->>'raw_input', v_lines, v_d.total, now());
  ELSE
    PERFORM record_payment(v_d.shop_id, v_d.id, 'agent-draft:' || v_d.id::text, v_d.customer_id,
                           v_d.total, v_d.payload->>'method', v_d.payload->>'note', now());
  END IF;

  UPDATE agent_drafts SET status = 'accepted', decided_by = auth.uid(), decided_at = now() WHERE id = v_d.id;
  RETURN v_d.id;
END;
$$;

CREATE OR REPLACE FUNCTION reject_agent_draft(p_draft_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d agent_drafts%ROWTYPE;
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
  UPDATE agent_drafts
     SET status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         reject_reason = left(nullif(trim(p_reason), ''), 200)
   WHERE id = v_d.id;
  RETURN v_d.id;
END;
$$;

-- ---------- 9. Funksiya huquqlari ----------
-- Supabase public sxemadagi yangi funksiyalarga anon'ga ham EXECUTE beradi: har biridan aniq olib tashlanadi.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'is_oauth_client_token', 'assert_first_party', 'require_shop_member_agent', 'agent_drafts_guard',
      'agent_whoami', 'agent_list_customers', 'agent_customer_balance', 'agent_list_sales', 'agent_get_sale',
      'agent_day_rows', 'agent_draft_sale', 'agent_draft_payment', 'accept_agent_draft', 'reject_agent_draft',
      'customer_outstanding', 'require_shop_member'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.proname IN ('assert_first_party', 'require_shop_member_agent', 'agent_drafts_guard', 'require_shop_member') THEN
      -- ichki yordamchilar: faqat SECURITY DEFINER funksiyalar ichidan chaqiriladi
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;
