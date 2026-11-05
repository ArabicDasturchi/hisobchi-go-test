-- ============================================================
-- HISOBCHI GO — 005: agent katalogi (mijoz va tovar)
-- ============================================================
-- Qaror (docs/QARORLAR.md, 03.11.2026): qoida "AI bazaga yozmaydi" FAQAT katalog uchun o'zgaradi.
--   * Agent mijoz va tovar QO'SHA oladi (tasdiqsiz): agent_add_customer, agent_add_products.
--   * O'zgartirish va arxiv faqat TASDIQLASH SO'ROVI (agent_drafts): agent_propose_*; savdogar ilovada tasdiqlaydi.
--   * Savdo va to'lov o'zgarmaydi: faqat qoralama. post_sale, reverse_sale, record_payment, void_payment OAuth tokenga yopiq.
--   * Haqiqiy DELETE yo'q: "o'chirish" = arxiv (is_active = false), tarix saqlanadi.
-- OAuth token jadvallarga to'g'ridan-to'g'ri yoza olmaydi (004 dagi *_no_oauth siyosatlari qoladi); faqat shu RPC'lar orqali.
-- Agent telefon va izohni (notes) qo'ymaydi va o'zgartirmaydi.
--
-- Eslatma: products.last_price hozir "sotuv narxi" vazifasini bajaradi; keyingi migratsiya (006) uni sale_price ga ko'chiradi.
-- Qayta ishga tushirish xavfsiz (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE). Ma'lumot o'chirilmaydi.
-- Talab: 001, 003, 004 qo'llangan bo'lishi kerak.
-- ============================================================

-- ---------- 1. Ustunlar ----------
-- customers: arxiv belgisi (tovardagi is_active bilan bir xil nom) va manba belgisi
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_client_id text;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
ALTER TABLE products  ADD COLUMN IF NOT EXISTS source_client_id text;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_source_check;
ALTER TABLE customers ADD CONSTRAINT customers_source_check CHECK (source IN ('app', 'agent'));
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_source_check;
ALTER TABLE products ADD CONSTRAINT products_source_check CHECK (source IN ('app', 'agent'));

-- Nomni normallashtirish (dublikat topish uchun): kichik harf, ortiqcha bo'shliqsiz, apostrof variantlari bitta ('),
-- ʻ ʼ ‘ ’ ` ´ → '. Kirill va lotin moslashtirilmaydi.
CREATE OR REPLACE FUNCTION catalog_norm(t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT lower(btrim(regexp_replace(
    translate(coalesce(t, ''), chr(699) || chr(700) || chr(8216) || chr(8217) || chr(96) || chr(180), repeat(chr(39), 6)),
    '\s+', ' ', 'g')));
$$;

CREATE INDEX IF NOT EXISTS idx_customers_shop_norm ON customers (shop_id, catalog_norm(name));
CREATE INDEX IF NOT EXISTS idx_products_shop_norm ON products (shop_id, catalog_norm(name));

-- ---------- 2. Takroriy so'rovlardan himoya (request_id) ----------
-- Bir xil request_id bilan qayta chaqirish yangi yozuv yaratmaydi, avvalgi natijani qaytaradi.
-- Faqat RPC yozadi va o'qiydi: jadvalga hech kimning (OAuth ham, ilova ham) to'g'ridan-to'g'ri huquqi yo'q.
CREATE TABLE IF NOT EXISTS agent_requests (
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  request_id    text NOT NULL CHECK (char_length(request_id) BETWEEN 8 AND 100),
  kind          text NOT NULL CHECK (kind IN ('add_customer', 'add_products')),
  payload_hash  text NOT NULL,
  result        jsonb NOT NULL,
  client_id     text NOT NULL,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, request_id)
);
ALTER TABLE agent_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_requests FROM anon, authenticated;
DROP TRIGGER IF EXISTS trg_agent_requests_append_only ON agent_requests;
CREATE TRIGGER trg_agent_requests_append_only BEFORE UPDATE OR DELETE ON agent_requests
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
DROP POLICY IF EXISTS agent_requests_no_oauth ON agent_requests;
CREATE POLICY agent_requests_no_oauth ON agent_requests AS RESTRICTIVE FOR ALL
  USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token());

-- ---------- 3. agent_drafts: yangi turlar ----------
ALTER TABLE agent_drafts ADD COLUMN IF NOT EXISTS target_id uuid;
CREATE INDEX IF NOT EXISTS idx_agent_drafts_target ON agent_drafts (shop_id, target_id) WHERE status = 'draft';
ALTER TABLE agent_drafts DROP CONSTRAINT IF EXISTS agent_drafts_kind_check;
ALTER TABLE agent_drafts ADD CONSTRAINT agent_drafts_kind_check
  CHECK (kind IN ('sale', 'payment', 'customer_update', 'product_update', 'customer_archive', 'product_archive'));

-- Qoralama mazmuni o'zgarmasligi qo'riqchisi target_id ni ham qamrab oladi (004 dagi tana + target_id)
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
  IF (NEW.id, NEW.shop_id, NEW.kind, NEW.customer_id, NEW.target_id, NEW.total, NEW.payload, NEW.client_op_id, NEW.client_id,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.shop_id, OLD.kind, OLD.customer_id, OLD.target_id, OLD.total, OLD.payload, OLD.client_op_id, OLD.client_id,
      OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'draft_immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 4. Agent: o'qish ----------
-- Arxivlangan mijoz agentga ko'rinmaydi (balans so'rovi ishlayveradi). Imzo va ustunlar o'zgarmagan.
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
    WHERE c.shop_id = p_shop_id AND c.is_active AND (v_like IS NULL OR c.name ILIKE v_like)
    ORDER BY c.name, c.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
    OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- Tovarlar: nom, birlik, narx (hozircha last_price), arxiv va manba belgisi
CREATE OR REPLACE FUNCTION agent_list_products(
  p_shop_id uuid, p_query text DEFAULT NULL, p_include_archived boolean DEFAULT false,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE (id uuid, name text, unit text, price bigint, is_active boolean, source text)
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
    SELECT p.id, p.name, p.unit, p.last_price, p.is_active, p.source
    FROM products p
    WHERE p.shop_id = p_shop_id AND (coalesce(p_include_archived, false) OR p.is_active)
      AND (v_like IS NULL OR p.name ILIKE v_like)
    ORDER BY p.name, p.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
    OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- ---------- 5. Agent: qo'shish (tasdiqsiz, qaytariladigan) ----------
-- Kunlik limit (Toshkent kuni, do'kon boshiga, source = 'agent'): 100 mijoz, 500 tovar. Oshsa daily_limit_exceeded.
CREATE OR REPLACE FUNCTION agent_add_customer(p_shop_id uuid, p_request_id text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_daily_limit CONSTANT int := 100;
  v_name text;
  v_hash text;
  v_req agent_requests%ROWTYPE;
  v_row customers%ROWTYPE;
  v_result jsonb;
  v_used int;
  v_client text := coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party');
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_request_id IS NULL OR char_length(p_request_id) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = '22023';
  END IF;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  IF char_length(v_name) NOT BETWEEN 1 AND 120 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  -- Bir do'konda katalog yozuvlari ketma-ket (parallel chaqiruvlar dublikat yaratmasin)
  PERFORM pg_advisory_xact_lock(hashtextextended('agent_catalog:' || p_shop_id::text, 0));

  v_hash := md5('add_customer|' || catalog_norm(v_name));
  SELECT * INTO v_req FROM agent_requests WHERE shop_id = p_shop_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_req.kind <> 'add_customer' OR v_req.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'request_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_req.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_row FROM customers
   WHERE shop_id = p_shop_id AND catalog_norm(name) = catalog_norm(v_name)
   ORDER BY is_active DESC, created_at, id LIMIT 1;
  IF FOUND THEN
    v_result := jsonb_build_object('id', v_row.id, 'name', v_row.name, 'created', false, 'is_active', v_row.is_active, 'source', v_row.source);
  ELSE
    SELECT count(*) INTO v_used FROM customers
     WHERE shop_id = p_shop_id AND source = 'agent'
       AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent');
    IF v_used >= c_daily_limit THEN
      RAISE EXCEPTION 'daily_limit_exceeded: kind=customer, limit=%, used=%', c_daily_limit, v_used USING ERRCODE = '54000';
    END IF;
    INSERT INTO customers (shop_id, name, source, source_client_id)
    VALUES (p_shop_id, v_name, 'agent', v_client) RETURNING * INTO v_row;
    v_result := jsonb_build_object('id', v_row.id, 'name', v_row.name, 'created', true, 'is_active', v_row.is_active, 'source', v_row.source);
  END IF;

  INSERT INTO agent_requests (shop_id, request_id, kind, payload_hash, result, client_id, created_by)
  VALUES (p_shop_id, p_request_id, 'add_customer', v_hash, v_result, v_client, auth.uid());
  RETURN v_result;
END;
$$;

-- p_items: [{"name": "...", "unit": "dona", "price": 13000}] (bir chaqiriqda 1..100). Butun chaqiriq bitta tranzaksiya:
-- bitta qator noto'g'ri bo'lsa hech narsa qo'shilmaydi (invalid_item: index=N, field=...).
CREATE OR REPLACE FUNCTION agent_add_products(p_shop_id uuid, p_request_id text, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_daily_limit CONSTANT int := 500;
  v_hash text;
  v_req agent_requests%ROWTYPE;
  v_item jsonb;
  v_idx int := 0;
  v_name text;
  v_unit text;
  v_price_text text;
  v_price bigint;
  v_row products%ROWTYPE;
  v_created jsonb := '[]'::jsonb;
  v_existing jsonb := '[]'::jsonb;
  v_used int;
  v_new int := 0;
  v_result jsonb;
  v_client text := coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party');
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_request_id IS NULL OR char_length(p_request_id) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_items: 1..100 ta tovar kerak' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agent_catalog:' || p_shop_id::text, 0));

  v_hash := md5('add_products|' || p_items::text);
  SELECT * INTO v_req FROM agent_requests WHERE shop_id = p_shop_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_req.kind <> 'add_products' OR v_req.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'request_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_req.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT count(*) INTO v_used FROM products
   WHERE shop_id = p_shop_id AND source = 'agent'
     AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'invalid_item: index=%, field=item', v_idx USING ERRCODE = '22023';
    END IF;
    v_name := btrim(regexp_replace(coalesce(v_item ->> 'name', ''), '\s+', ' ', 'g'));
    IF char_length(v_name) NOT BETWEEN 1 AND 120 OR v_name ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'invalid_item: index=%, field=name', v_idx USING ERRCODE = '22023';
    END IF;
    v_unit := coalesce(nullif(v_item ->> 'unit', ''), 'dona');
    IF v_unit NOT IN ('dona','kg','g','litr','metr','pachka','qop','karobka','tonna') THEN
      RAISE EXCEPTION 'invalid_item: index=%, field=unit', v_idx USING ERRCODE = '22023';
    END IF;
    v_price_text := v_item ->> 'price';
    IF v_price_text IS NULL THEN
      v_price := NULL;
    ELSIF v_price_text !~ '^\d{1,9}$' THEN
      RAISE EXCEPTION 'invalid_item: index=%, field=price', v_idx USING ERRCODE = '22023';
    ELSE
      v_price := v_price_text::bigint;
      IF v_price > 100000000 THEN
        RAISE EXCEPTION 'invalid_item: index=%, field=price', v_idx USING ERRCODE = '22023';
      END IF;
    END IF;

    SELECT * INTO v_row FROM products
     WHERE shop_id = p_shop_id AND catalog_norm(name) = catalog_norm(v_name)
     ORDER BY is_active DESC, created_at, id LIMIT 1;
    IF FOUND THEN
      v_existing := v_existing || jsonb_build_array(jsonb_build_object(
        'id', v_row.id, 'name', v_row.name, 'unit', v_row.unit, 'price', v_row.last_price, 'is_active', v_row.is_active));
    ELSE
      v_new := v_new + 1;
      IF v_used + v_new > c_daily_limit THEN
        RAISE EXCEPTION 'daily_limit_exceeded: kind=product, limit=%, used=%', c_daily_limit, v_used USING ERRCODE = '54000';
      END IF;
      INSERT INTO products (shop_id, name, unit, last_price, source, source_client_id)
      VALUES (p_shop_id, v_name, v_unit, v_price, 'agent', v_client) RETURNING * INTO v_row;
      v_created := v_created || jsonb_build_array(jsonb_build_object(
        'id', v_row.id, 'name', v_row.name, 'unit', v_row.unit, 'price', v_row.last_price, 'is_active', v_row.is_active));
    END IF;
  END LOOP;

  v_result := jsonb_build_object('created', v_created, 'existing', v_existing,
                                 'created_count', v_new, 'existing_count', jsonb_array_length(v_existing));
  INSERT INTO agent_requests (shop_id, request_id, kind, payload_hash, result, client_id, created_by)
  VALUES (p_shop_id, p_request_id, 'add_products', v_hash, v_result, v_client, auth.uid());
  RETURN v_result;
END;
$$;

-- ---------- 6. Agent: o'zgartirish va arxiv SO'ROVLARI (qoralama; savdogar ilovada tasdiqlaydi) ----------
-- Mijozda faqat nom, tovarda nom, birlik, narx. Telefon va izoh o'zgartirilmaydi.
-- p_request_id agent_drafts.client_op_id sifatida saqlanadi (takror = o'sha so'rov). Bir yozuv uchun bitta ochiq so'rov.
CREATE OR REPLACE FUNCTION agent_propose_customer_update(p_shop_id uuid, p_request_id text, p_customer_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_cur customers%ROWTYPE;
  v_name text;
  v_pending uuid;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_request_id IS NULL OR char_length(p_request_id) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM agent_drafts WHERE shop_id = p_shop_id AND client_op_id = p_request_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF (SELECT count(*) FROM agent_drafts WHERE shop_id = p_shop_id AND status = 'draft') >= 50 THEN
    RAISE EXCEPTION 'too_many_drafts' USING ERRCODE = '54000';
  END IF;
  SELECT * INTO v_cur FROM customers WHERE id = p_customer_id AND shop_id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_cur.is_active THEN
    RAISE EXCEPTION 'target_archived' USING ERRCODE = '22023';
  END IF;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  IF char_length(v_name) NOT BETWEEN 1 AND 120 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_name = v_cur.name THEN
    RAISE EXCEPTION 'no_change' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_pending FROM agent_drafts
   WHERE shop_id = p_shop_id AND status = 'draft' AND target_id = p_customer_id
     AND kind IN ('customer_update', 'customer_archive') LIMIT 1;
  IF v_pending IS NOT NULL THEN
    RAISE EXCEPTION 'proposal_pending: %', v_pending USING ERRCODE = '23505';
  END IF;
  INSERT INTO agent_drafts (shop_id, kind, customer_id, target_id, total, payload, client_op_id, client_id, created_by)
  VALUES (p_shop_id, 'customer_update', p_customer_id, p_customer_id, 0,
          jsonb_build_object('target_id', p_customer_id, 'target_name', v_cur.name,
                             'changes', jsonb_build_object('name', jsonb_build_object('from', v_cur.name, 'to', v_name))),
          p_request_id, coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- p_changes: {"name": "...", "unit": "kg", "price": 13000}; faqat berilgan kalitlar o'zgaradi ("price": null narxni tozalaydi)
CREATE OR REPLACE FUNCTION agent_propose_product_update(p_shop_id uuid, p_request_id text, p_product_id uuid, p_changes jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_cur products%ROWTYPE;
  v_key text;
  v_changes jsonb := '{}'::jsonb;
  v_name text;
  v_unit text;
  v_price_text text;
  v_price bigint;
  v_pending uuid;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_request_id IS NULL OR char_length(p_request_id) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM agent_drafts WHERE shop_id = p_shop_id AND client_op_id = p_request_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF (SELECT count(*) FROM agent_drafts WHERE shop_id = p_shop_id AND status = 'draft') >= 50 THEN
    RAISE EXCEPTION 'too_many_drafts' USING ERRCODE = '54000';
  END IF;
  SELECT * INTO v_cur FROM products WHERE id = p_product_id AND shop_id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_cur.is_active THEN
    RAISE EXCEPTION 'target_archived' USING ERRCODE = '22023';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'invalid_changes' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF v_key NOT IN ('name', 'unit', 'price') THEN
      RAISE EXCEPTION 'invalid_changes: field=%', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF p_changes ? 'name' THEN
    v_name := btrim(regexp_replace(coalesce(p_changes ->> 'name', ''), '\s+', ' ', 'g'));
    IF char_length(v_name) NOT BETWEEN 1 AND 120 OR v_name ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
    END IF;
    IF v_name <> v_cur.name THEN
      IF EXISTS (SELECT 1 FROM products WHERE shop_id = p_shop_id AND id <> p_product_id AND catalog_norm(name) = catalog_norm(v_name)) THEN
        RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505';
      END IF;
      v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('from', v_cur.name, 'to', v_name));
    END IF;
  END IF;
  IF p_changes ? 'unit' THEN
    v_unit := p_changes ->> 'unit';
    IF v_unit IS NULL OR v_unit NOT IN ('dona','kg','g','litr','metr','pachka','qop','karobka','tonna') THEN
      RAISE EXCEPTION 'invalid_unit' USING ERRCODE = '22023';
    END IF;
    IF v_unit <> v_cur.unit THEN
      v_changes := v_changes || jsonb_build_object('unit', jsonb_build_object('from', v_cur.unit, 'to', v_unit));
    END IF;
  END IF;
  IF p_changes ? 'price' THEN
    v_price_text := p_changes ->> 'price';
    IF v_price_text IS NULL THEN
      v_price := NULL;
    ELSIF v_price_text !~ '^\d{1,9}$' OR v_price_text::bigint > 100000000 THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
    ELSE
      v_price := v_price_text::bigint;
    END IF;
    IF v_price IS DISTINCT FROM v_cur.last_price THEN
      v_changes := v_changes || jsonb_build_object('price', jsonb_build_object('from', v_cur.last_price, 'to', v_price));
    END IF;
  END IF;
  IF v_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'no_change' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_pending FROM agent_drafts
   WHERE shop_id = p_shop_id AND status = 'draft' AND target_id = p_product_id
     AND kind IN ('product_update', 'product_archive') LIMIT 1;
  IF v_pending IS NOT NULL THEN
    RAISE EXCEPTION 'proposal_pending: %', v_pending USING ERRCODE = '23505';
  END IF;
  INSERT INTO agent_drafts (shop_id, kind, target_id, total, payload, client_op_id, client_id, created_by)
  VALUES (p_shop_id, 'product_update', p_product_id, 0,
          jsonb_build_object('target_id', p_product_id, 'target_name', v_cur.name, 'changes', v_changes),
          p_request_id, coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- p_kind: 'customer' | 'product'. Arxivlash = is_active = false (tarix, savdo va qarz saqlanadi). Tasdiqlangunga qadar hech narsa o'zgarmaydi.
CREATE OR REPLACE FUNCTION agent_propose_archive(p_shop_id uuid, p_request_id text, p_kind text, p_target_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_active boolean;
  v_pending uuid;
  v_payload jsonb;
BEGIN
  PERFORM require_shop_member_agent(p_shop_id);
  IF p_request_id IS NULL OR char_length(p_request_id) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'invalid_request_id' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('customer', 'product') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM agent_drafts WHERE shop_id = p_shop_id AND client_op_id = p_request_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF (SELECT count(*) FROM agent_drafts WHERE shop_id = p_shop_id AND status = 'draft') >= 50 THEN
    RAISE EXCEPTION 'too_many_drafts' USING ERRCODE = '54000';
  END IF;
  IF p_kind = 'customer' THEN
    SELECT name, is_active INTO v_name, v_active FROM customers WHERE id = p_target_id AND shop_id = p_shop_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002'; END IF;
  ELSE
    SELECT name, is_active INTO v_name, v_active FROM products WHERE id = p_target_id AND shop_id = p_shop_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'target_archived' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_pending FROM agent_drafts
   WHERE shop_id = p_shop_id AND status = 'draft' AND target_id = p_target_id
     AND kind IN (p_kind || '_update', p_kind || '_archive') LIMIT 1;
  IF v_pending IS NOT NULL THEN
    RAISE EXCEPTION 'proposal_pending: %', v_pending USING ERRCODE = '23505';
  END IF;
  v_payload := jsonb_build_object('target_id', p_target_id, 'target_name', v_name);
  IF p_kind = 'customer' THEN
    -- ilovada ko'rsatish uchun: qarzi bor mijozni arxivlashdan oldin savdogar buni ko'rsin
    v_payload := v_payload || jsonb_build_object('outstanding', customer_outstanding(p_shop_id, p_target_id));
  END IF;
  INSERT INTO agent_drafts (shop_id, kind, customer_id, target_id, total, payload, client_op_id, client_id, created_by)
  VALUES (p_shop_id, p_kind || '_archive', CASE WHEN p_kind = 'customer' THEN p_target_id END, p_target_id, 0, v_payload,
          p_request_id, coalesce(nullif(auth.jwt() ->> 'client_id', ''), 'first_party'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 7. Tasdiqlash: katalog qoralamalarini qo'llash (ichki yordamchi) ----------
-- Faqat accept_agent_draft chaqiradi. Yozuv qoralama yaratilgandagi qiymatdan farq qilsa (draft_stale) jim ustidan yozilmaydi.
CREATE OR REPLACE FUNCTION apply_catalog_draft(p_d agent_drafts)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cust customers%ROWTYPE;
  v_prod products%ROWTYPE;
  v_ch jsonb := p_d.payload -> 'changes';
  v_new_name text;
BEGIN
  IF p_d.kind IN ('customer_update', 'customer_archive') THEN
    SELECT * INTO v_cust FROM customers WHERE id = p_d.target_id AND shop_id = p_d.shop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0002'; END IF;
    IF NOT v_cust.is_active THEN RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001'; END IF;
    IF p_d.kind = 'customer_archive' THEN
      UPDATE customers SET is_active = false, updated_at = now() WHERE id = v_cust.id;
    ELSE
      IF v_cust.name IS DISTINCT FROM (v_ch -> 'name' ->> 'from') THEN RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001'; END IF;
      UPDATE customers SET name = v_ch -> 'name' ->> 'to', updated_at = now() WHERE id = v_cust.id;
    END IF;
  ELSIF p_d.kind IN ('product_update', 'product_archive') THEN
    SELECT * INTO v_prod FROM products WHERE id = p_d.target_id AND shop_id = p_d.shop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0002'; END IF;
    IF NOT v_prod.is_active THEN RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001'; END IF;
    IF p_d.kind = 'product_archive' THEN
      UPDATE products SET is_active = false, updated_at = now() WHERE id = v_prod.id;
    ELSE
      IF v_ch ? 'name' AND v_prod.name IS DISTINCT FROM (v_ch -> 'name' ->> 'from') THEN RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001'; END IF;
      IF v_ch ? 'unit' AND v_prod.unit IS DISTINCT FROM (v_ch -> 'unit' ->> 'from') THEN RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001'; END IF;
      IF v_ch ? 'price' AND v_prod.last_price IS DISTINCT FROM ((v_ch -> 'price' ->> 'from')::bigint) THEN RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001'; END IF;
      v_new_name := coalesce(v_ch -> 'name' ->> 'to', v_prod.name);
      IF v_ch ? 'name' AND EXISTS (SELECT 1 FROM products WHERE shop_id = v_prod.shop_id AND id <> v_prod.id AND catalog_norm(name) = catalog_norm(v_new_name)) THEN
        RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505';
      END IF;
      UPDATE products SET
        name = v_new_name,
        unit = coalesce(v_ch -> 'unit' ->> 'to', v_prod.unit),
        last_price = CASE WHEN v_ch ? 'price' THEN (v_ch -> 'price' ->> 'to')::bigint ELSE v_prod.last_price END,
        updated_at = now()
      WHERE id = v_prod.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported_kind' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- accept_agent_draft: 004 dagi tana + katalog turlari (faqat oddiy sessiya; OAuth token chaqira olmaydi)
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

-- ---------- 8. Funksiya huquqlari ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'agent_list_customers', 'agent_list_products', 'agent_add_customer', 'agent_add_products',
      'agent_propose_customer_update', 'agent_propose_product_update', 'agent_propose_archive',
      'apply_catalog_draft', 'accept_agent_draft', 'agent_drafts_guard'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.proname IN ('apply_catalog_draft', 'agent_drafts_guard') THEN
      -- ichki yordamchilar: faqat SECURITY DEFINER funksiyalar/trigger ichidan chaqiriladi
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;
