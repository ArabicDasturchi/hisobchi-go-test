-- ============================================================
-- HISOBCHI GO — 014: xavfsizlik va barqarorlik (BACKEND-AUDIT 4–6-bo'limlar, KEYINGI-BOSQICH K2/K3/A1)
-- ============================================================
-- Nima va nega (har band uchun test: supabase/tests/91_xavfsizlik_014.test.sql, eski kodda yiqiladi):
--   B8   is_shop_member(uuid) PUBLIC orqali anon'ga ochiq edi -> faqat authenticated.
--   B9   9 ta INVOKER funksiyada search_path yo'q edi -> SET search_path = public, pg_temp.
--   B10  Yozish RPC'lari "tekshir, keyin yoz": bir xil client_op_id bilan parallel ikki chaqiruvda ikkinchisi xom 23505
--        olardi. Endi funksiya boshida (a'zolik tekshiruvidan keyin) tranzaksiya advisory qulfi (_op_lock): ikkinchi
--        chaqiruv birinchisi tugashini kutadi va mavjud natijani qaytaradi. Funksiya imzosi va xatti-harakati o'zgarmaydi;
--        tanalar 003/006/007/008/009/011/013 dagi oxirgi versiyadan aynan ko'chirilgan, faqat qulf qatori qo'shilgan.
--        void_payment / void_supplier_payment: to'lov qatori FOR UPDATE bilan qulflanadi (reverse_sale_with_payments ham
--        to'lov qatorini qulflaydi; advisory qulf u bilan deadlock berardi).
--   S1   agent_draft_sale: bir martalik (kind='one_time') mijoz id'si rad etiladi (p_walkin ishlatilsin) — aks holda
--        qoralama tasdiqda doim walkin_requires_full_payment bilan yiqilib, 50 lik limitni band qilardi.
--   S3   accept_agent_draft: arxivlangan mijozga savdo/to'lov qoralamasi -> draft_stale (ta'minotchi uchun 008 da bor edi).
--   S4   Klient (authenticated/anon) customers.kind, customers/products.source va source_client_id ni to'g'ridan-to'g'ri
--        o'zgartira olmaydi (trigger; SECURITY DEFINER RPC'lar jadval egasi sifatida ishlaydi va to'silmaydi).
--        Klient INSERT da source='agent' / source_client_id soxtalay olmaydi. products.cost_price KIRMADI (hisobotga qarang).
--   S5   Bir martalik mijoz to'lovini void_payment bilan alohida bekor qilish taqiqlanadi; savdoni bekor qilish
--        (reverse_sale avto-void, reverse_sale_with_payments) yo'li ishlaydi.
--   S10  admin_shop_stage endi _admin_gate orqali (admin_audit ga yoziladi).
--   H2   11 ta FK indeksi; shops_update siyosatida (select auth.uid()) (har qatorda qayta hisoblanmaydi).
--   K3/B4 Harakati bor tovarda (ombor harakati, savdo yoki kirim qatori) products.unit o'zgarmaydi (trigger);
--        harakat yo'q bo'lsa ruxsat.
--   B7   purchase_documents.note + post_purchase(..., p_note DEFAULT NULL) oxirida; eski 10 argumentli imzo DROP qilinadi
--        (overload qolmasin), eski chaqiruvlar (veb/mobil nomli argumentlar, accept_agent_draft) ishlayveradi.
--        accept_agent_draft kirim qoralamasi izohini uzatadi.
-- Kirmadi: S6 (payload hash + idempotency_conflict) — 6+ jadvalga ustun kerak; veb summani solishtiradi. Hisobot:
--   docs/reports/2026-11-12-B2-014-XAVFSIZLIK.md.
-- Mavjud ma'lumot o'zgartirilmaydi (faqat indeks, ustun, trigger, funksiya). Append-only buzilmaydi.
-- Qayta ishga tushirish xavfsiz (IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS). Talab: 001..013.
-- Qo'llash: main'ga merge bo'lganda CI (docs/MIGRATSIYA-CI.md), avval staging.
-- ============================================================

-- ---------- B8: is_shop_member faqat tizimga kirgan foydalanuvchiga ----------
-- RLS siyosatlari uni authenticated roli bilan chaqiradi (EXECUTE saqlanadi). anon'ning jadval huquqi yo'q (003).
REVOKE ALL ON FUNCTION is_shop_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_shop_member(uuid) TO authenticated;

-- ---------- B9: search_path (imzolar pg_proc dan tekshirilgan, 001..013 da bittadan overload) ----------
ALTER FUNCTION agent_drafts_guard() SET search_path = public, pg_temp;
ALTER FUNCTION calculate_document_total(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION calculate_line_total(bigint, bigint) SET search_path = public, pg_temp;
ALTER FUNCTION catalog_norm(text) SET search_path = public, pg_temp;
ALTER FUNCTION get_document_pg_total(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION prevent_append_only_change() SET search_path = public, pg_temp;
ALTER FUNCTION prevent_ledger_modification() SET search_path = public, pg_temp;
ALTER FUNCTION products_sync_prices() SET search_path = public, pg_temp;
ALTER FUNCTION update_updated_at() SET search_path = public, pg_temp;

-- ---------- H2: FK indekslari (Supabase advisor: unindexed foreign keys) ----------
-- Oddiy CREATE INDEX (CONCURRENTLY emas: CLI migratsiyani tranzaksiyada bajaradi). Qurilish paytida jadvalga yozish
-- qisqa to'xtaydi; jadvallar kichik.
CREATE INDEX IF NOT EXISTS idx_agent_drafts_customer ON agent_drafts (customer_id);
CREATE INDEX IF NOT EXISTS idx_document_lines_product ON document_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_document_lines_shop ON document_lines (shop_id);
CREATE INDEX IF NOT EXISTS idx_payment_voids_shop ON payment_voids (shop_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_product_aliases_product ON product_aliases (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_supplier_id ON purchase_documents (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_product_id ON purchase_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_voids_shop ON supplier_payment_voids (shop_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments (supplier_id);

-- shops_update: 003 dagi bilan bir xil qoida, auth.uid() bir marta hisoblanadi
DROP POLICY IF EXISTS shops_update ON shops;
CREATE POLICY shops_update ON shops
  FOR UPDATE USING (EXISTS (SELECT 1 FROM shop_members m WHERE m.shop_id = shops.id AND m.user_id = (SELECT auth.uid()) AND m.role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM shop_members m WHERE m.shop_id = shops.id AND m.user_id = (SELECT auth.uid()) AND m.role = 'owner'));

-- ---------- B10: idempotentlik qulfi (ichki yordamchi) ----------
-- Bir do'kon + bitta noyoblik maydoni (p_scope, odatda jadval nomi) + kalit (client_op_id) uchun tranzaksiya oxirigacha
-- qulf. Bir tranzaksiyada qayta olinsa bloklamaydi (reverse_sale_with_payments -> reverse_sale). Xesh to'qnashuvi faqat
-- ortiqcha kutishga olib keladi, xatoga emas.
CREATE OR REPLACE FUNCTION _op_lock(p_scope text, p_shop_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('op:' || p_scope || ':' || coalesce(p_shop_id::text, '') || ':' || coalesce(p_key, ''), 0));
END;
$$;

-- ---------- B7: kirim izohi ustuni ----------
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE purchase_documents DROP CONSTRAINT IF EXISTS purchase_documents_note_len;
ALTER TABLE purchase_documents ADD CONSTRAINT purchase_documents_note_len CHECK (note IS NULL OR char_length(note) <= 500);

-- ============================================================
-- Funksiyalar: tanalar oxirgi versiyadan aynan ko'chirilgan; o'zgarishlar "-- 014:" izohi bilan belgilangan.
-- ============================================================

-- ---------- post_sale (006) + B10 ----------
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
  PERFORM _op_lock('documents', p_shop_id, p_client_op_id); -- 014: B10

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

-- ---------- reverse_sale (006) + B10 ----------
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
  PERFORM _op_lock('document_reversals', p_shop_id, p_client_op_id); -- 014: B10
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

-- ---------- record_payment (003) + B10 ----------
CREATE OR REPLACE FUNCTION record_payment(
  p_shop_id uuid,
  p_payment_id uuid,
  p_client_op_id text,
  p_customer_id uuid,
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
  PERFORM _op_lock('payments', p_shop_id, p_client_op_id); -- 014: B10
  SELECT id INTO v_existing FROM payments WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  -- Mijoz qatorini qulflash: parallel to'lovlar qarzdan oshmasligi uchun
  PERFORM 1 FROM customers WHERE id = p_customer_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_not_in_shop' USING ERRCODE = '42501';
  END IF;
  v_outstanding := customer_outstanding(p_shop_id, p_customer_id);
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'payment_exceeds_debt: debt=%', v_outstanding USING ERRCODE = '22000';
  END IF;
  INSERT INTO payments (id, shop_id, client_op_id, customer_id, amount, method, note, created_by, created_at)
  VALUES (p_payment_id, p_shop_id, p_client_op_id, p_customer_id, p_amount, p_method, nullif(trim(p_note), ''), auth.uid(), p_created_at);
  RETURN p_payment_id;
END;
$$;

-- ---------- void_payment (003) + B10 (to'lov qatori qulfi) + S5 ----------
CREATE OR REPLACE FUNCTION void_payment(p_shop_id uuid, p_payment_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  -- 014: B10 — mavjudlik tekshiruvi qatorni qulflaydi: parallel ikkinchi bekor qilish birinchisini kutib, o'sha natijani oladi
  PERFORM 1 FROM payments WHERE id = p_payment_id AND shop_id = p_shop_id FOR UPDATE; -- 014: B10
  IF NOT FOUND THEN -- 014: B10
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_id FROM payment_voids WHERE payment_id = p_payment_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id; -- idempotent: allaqachon bekor qilingan
  END IF;
  -- 014: S5 — bir martalik mijoz to'lovi faqat savdo bilan birga bekor qilinadi (reverse_sale / reverse_sale_with_payments).
  -- Idempotent qaytishdan keyin: reverse_sale avto-void qilgan to'lovni reverse_sale_with_payments qayta so'rasa xato emas.
  IF EXISTS (SELECT 1 FROM payments p JOIN customers c ON c.id = p.customer_id
             WHERE p.id = p_payment_id AND c.kind = 'one_time') THEN
    RAISE EXCEPTION 'walkin_payment_void_forbidden: savdoni bekor qiling' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO payment_voids (shop_id, payment_id, reason, created_by)
  VALUES (p_shop_id, p_payment_id, trim(p_reason), auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- adjust_stock (006) + B10 ----------
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
  PERFORM _op_lock('stock_movements', p_shop_id, p_client_op_id); -- 014: B10
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

-- ---------- post_purchase (007) + B10 + B7 (p_note oxirida, DEFAULT NULL) ----------
-- Eski 10 argumentli imzo olib tashlanadi: ikkita overload qolsa 10 argumentli pozitsion chaqiruv noaniq bo'lardi.
-- Veb/mobil nomli argumentlar bilan chaqiradi (p_note'siz) — yangi imzoga mos keladi; accept_agent_draft ham.
DROP FUNCTION IF EXISTS post_purchase(uuid, uuid, text, uuid, date, jsonb, bigint, timestamptz, text, bigint);
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
  p_paid bigint DEFAULT NULL,
  p_note text DEFAULT NULL -- 014: B7
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
  PERFORM _op_lock('purchase_documents', p_shop_id, p_client_op_id); -- 014: B10

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
  -- 014: B7 — izoh (agent qoralamasi bilan bir xil chegara: 500 belgi)
  IF char_length(coalesce(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_document' USING ERRCODE = '22023';
  END IF;

  INSERT INTO purchase_documents (id, shop_id, supplier_id, doc_date, status, subtotal, ts_total, client_op_id, created_by, created_at, note)
  VALUES (p_purchase_id, p_shop_id, p_supplier_id, v_date, 'draft', 0, p_client_total, p_client_op_id, auth.uid(), p_created_at,
          nullif(trim(p_note), '')); -- 014: B7

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

-- ---------- reverse_purchase (007) + B10 ----------
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
  PERFORM _op_lock('purchase_reversals', p_shop_id, p_client_op_id); -- 014: B10
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

-- ---------- record_supplier_payment (007) + B10 ----------
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
  PERFORM _op_lock('supplier_payments', p_shop_id, p_client_op_id); -- 014: B10
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

-- ---------- void_supplier_payment (007) + B10 (to'lov qatori qulfi) ----------
CREATE OR REPLACE FUNCTION void_supplier_payment(p_shop_id uuid, p_payment_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  -- 014: B10 — mavjudlik tekshiruvi qatorni qulflaydi (parallel ikkinchi bekor qilish o'sha natijani oladi)
  PERFORM 1 FROM supplier_payments WHERE id = p_payment_id AND shop_id = p_shop_id FOR UPDATE; -- 014: B10
  IF NOT FOUND THEN -- 014: B10
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

-- ---------- post_supplier_opening_balance (009) + B10 ----------
CREATE OR REPLACE FUNCTION post_supplier_opening_balance(
  p_shop_id uuid,
  p_document_id uuid,
  p_client_op_id text,
  p_supplier_id uuid,
  p_amount bigint,
  p_doc_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_date date := coalesce(p_doc_date, (now() AT TIME ZONE 'Asia/Tashkent')::date);
BEGIN
  PERFORM require_shop_member(p_shop_id);
  PERFORM _op_lock('purchase_documents', p_shop_id, p_client_op_id); -- 014: B10

  -- Idempotent: o'sha client_op_id bilan qayta yuborilsa mavjud yozuv qaytadi
  SELECT id INTO v_existing FROM purchase_documents WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_documents WHERE id = p_document_id) THEN
    RAISE EXCEPTION 'id_conflict' USING ERRCODE = '23505';
  END IF;
  PERFORM 1 FROM suppliers WHERE id = p_supplier_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_in_shop' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF v_date < DATE '2000-01-01' OR v_date > (now() AT TIME ZONE 'Asia/Tashkent')::date + 1 THEN
    RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_documents WHERE shop_id = p_shop_id AND supplier_id = p_supplier_id AND kind = 'opening' AND status <> 'reversed') THEN
    RAISE EXCEPTION 'opening_balance_exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO purchase_documents (id, shop_id, supplier_id, doc_date, status, kind, subtotal, ts_total, pg_total, calc_match, client_op_id, created_by, posted_at)
  VALUES (p_document_id, p_shop_id, p_supplier_id, v_date, 'posted', 'opening', p_amount, p_amount, p_amount, true, p_client_op_id, auth.uid(), now());
  RETURN p_document_id;
END;
$$;

-- ---------- reverse_sale_with_payments (013) + B10 (reverse_sale bilan bir xil kalit: bir tranzaksiyada qayta olinadi) ----------
CREATE OR REPLACE FUNCTION reverse_sale_with_payments(
  p_shop_id uuid,
  p_document_id uuid,
  p_client_op_id text,
  p_reason text,
  p_void_payment_ids uuid[] DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rev uuid;
  v_doc documents%ROWTYPE;
  v_ids uuid[] := coalesce(p_void_payment_ids, ARRAY[]::uuid[]);
  v_found int;
  v_sum bigint;
  v_pid uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  PERFORM _op_lock('document_reversals', p_shop_id, p_client_op_id); -- 014: B10

  -- Idempotent: birinchi chaqiruv atomik tugagan (savdo + to'lovlar), qayta hech narsa qilinmaydi
  SELECT id INTO v_rev FROM document_reversals WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_rev IS NOT NULL THEN
    RETURN v_rev;
  END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Qulfdan keyin qayta: o'sha client_op_id bilan parallel chaqiruv (ikki marta bosish, timeout'dan keyin qayta
  -- yuborish) birinchisi tugashini kutgan bo'lsa, xato emas, o'sha natija qaytadi
  SELECT id INTO v_rev FROM document_reversals WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_rev IS NOT NULL THEN
    RETURN v_rev;
  END IF;

  IF cardinality(v_ids) > 0 THEN
    IF cardinality(v_ids) > 20 OR (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'invalid_payment_list' USING ERRCODE = '22023';
    END IF;
    IF v_doc.customer_id IS NULL THEN
      RAISE EXCEPTION 'payment_not_linked' USING ERRCODE = '22023';
    END IF;
    -- To'lovlarni qulflab tekshirish: shu do'kon, shu mijoz, bekor qilinmagan
    PERFORM 1 FROM payments WHERE id = ANY (v_ids) AND shop_id = p_shop_id FOR UPDATE;
    SELECT count(*), coalesce(sum(p.amount), 0) INTO v_found, v_sum
      FROM payments p
     WHERE p.id = ANY (v_ids) AND p.shop_id = p_shop_id AND p.customer_id = v_doc.customer_id
       AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id);
    IF v_found <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'payment_not_linked' USING ERRCODE = '22023';
    END IF;
    IF v_sum > v_doc.subtotal THEN
      RAISE EXCEPTION 'payment_exceeds_sale: payments=%, sale=%', v_sum, v_doc.subtotal USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Savdo: mavjud teskari yozuv mantiqi (holat, sabab, ombor, bir martalik mijoz to'lovi)
  v_rev := reverse_sale(p_shop_id, p_document_id, p_client_op_id, p_reason);

  -- To'lovlar: mavjud void_payment (teskari yozuv payment_voids, o'chirish yo'q)
  FOREACH v_pid IN ARRAY v_ids LOOP
    PERFORM void_payment(p_shop_id, v_pid, left('savdo bekor qilindi: ' || trim(p_reason), 300));
  END LOOP;
  RETURN v_rev;
END;
$$;

-- ---------- post_supplier_debt (013) + B10 ----------
CREATE OR REPLACE FUNCTION post_supplier_debt(
  p_shop_id uuid,
  p_document_id uuid,
  p_client_op_id text,
  p_supplier_id uuid,
  p_amount bigint,
  p_doc_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_date date := coalesce(p_doc_date, (now() AT TIME ZONE 'Asia/Tashkent')::date);
BEGIN
  PERFORM require_shop_member(p_shop_id);
  PERFORM _op_lock('purchase_documents', p_shop_id, p_client_op_id); -- 014: B10

  -- Idempotent: o'sha client_op_id bilan qayta yuborilsa mavjud yozuv qaytadi
  SELECT id INTO v_existing FROM purchase_documents WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_documents WHERE id = p_document_id) THEN
    RAISE EXCEPTION 'id_conflict' USING ERRCODE = '23505';
  END IF;
  PERFORM 1 FROM suppliers WHERE id = p_supplier_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_in_shop' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF v_date < DATE '2000-01-01' OR v_date > (now() AT TIME ZONE 'Asia/Tashkent')::date + 1 THEN
    RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023';
  END IF;

  INSERT INTO purchase_documents (id, shop_id, supplier_id, doc_date, status, kind, subtotal, ts_total, pg_total, calc_match, client_op_id, created_by, posted_at)
  VALUES (p_document_id, p_shop_id, p_supplier_id, v_date, 'posted', 'debt', p_amount, p_amount, p_amount, true, p_client_op_id, auth.uid(), now());
  RETURN p_document_id;
END;
$$;

-- ---------- agent_draft_sale (008) + B10 + S1 ----------
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
  PERFORM _op_lock('agent_drafts', p_shop_id, p_client_op_id); -- 014: B10
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
  -- 014: S1 — bir martalik mijoz id'si to'g'ridan-to'g'ri berilmaydi (p_walkin = true ishlatiladi); aks holda qoralama
  -- tasdiqda doim walkin_requires_full_payment bilan yiqilib, qoralamalar limitini band qilardi
  IF p_customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND shop_id = p_shop_id AND kind = 'one_time') THEN
    RAISE EXCEPTION 'walkin_customer_id_forbidden: p_walkin ishlating' USING ERRCODE = '22023';
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

-- ---------- accept_agent_draft (008) + S3 (arxivlangan mijoz -> draft_stale) + B7 (kirim izohi uzatiladi) ----------
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
    -- 014: S3 — qoralama va tasdiq orasida mijoz arxivlangan bo'lsa jim yozilmaydi
    IF v_customer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers WHERE id = v_customer AND shop_id = v_d.shop_id AND is_active) THEN
      RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001';
    END IF;
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
                          CASE WHEN v_paid IS NOT NULL THEN v_d.payload->>'payment_method' END, v_paid,
                          v_d.payload->>'note'); -- 014: B7
  ELSIF v_d.kind = 'payment' THEN
    -- 014: S3
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = v_d.customer_id AND shop_id = v_d.shop_id AND is_active) THEN
      RAISE EXCEPTION 'draft_stale' USING ERRCODE = '40001';
    END IF;
    PERFORM record_payment(v_d.shop_id, v_d.id, 'agent-draft:' || v_d.id::text, v_d.customer_id,
                           v_d.total, v_d.payload->>'method', v_d.payload->>'note', now());
  ELSE
    PERFORM apply_catalog_draft(v_d);
  END IF;

  UPDATE agent_drafts SET status = 'accepted', decided_by = auth.uid(), decided_at = now() WHERE id = v_d.id;
  RETURN v_d.id;
END;
$$;

-- ---------- admin_shop_stage (011) + S10 ----------
-- _admin_gate admin_audit ga yozadi, shuning uchun funksiya endi VOLATILE (STABLE funksiyada yozish bo'lmasin).
CREATE OR REPLACE FUNCTION admin_shop_stage(p_shop_id uuid)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER -- 014: S10 (011 da STABLE edi)
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage int;
BEGIN
  PERFORM _admin_gate('admin_shop_stage', p_shop_id::text); -- 014: S10 (admin emas -> not_platform_admin, audit yozilmaydi)
  SELECT f.stage INTO v_stage FROM _admin_shop_facts() f WHERE f.shop_id = p_shop_id;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'shop_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_stage;
END;
$$;

-- ---------- S4: klient tizim ustunlarini o'zgartira olmaydi ----------
-- Klient = PostgREST roli (authenticated/anon). SECURITY DEFINER RPC'lar (agent_add_*, ensure_walkin_customer,
-- apply_catalog_draft, post_purchase) ichida current_user = funksiya egasi, shuning uchun ular to'silmaydi.
-- Faqat qiymat O'ZGARSA rad etiladi: mobil upsert (o'sha qiymat bilan) ishlayveradi.
-- customers.kind INSERT'da tekshirilmaydi: ikkinchi one_time mijozni ux_customers_one_time baribir rad etadi.
CREATE OR REPLACE FUNCTION protect_system_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  -- OAuth (agent) tokenini RESTRICTIVE *_no_oauth siyosati baribir rad etadi (004); xato matni o'sha qolsin
  IF is_oauth_client_token() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.source IS DISTINCT FROM 'app' OR NEW.source_client_id IS NOT NULL THEN
      RAISE EXCEPTION 'system_column_forbidden: %.source', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.source IS DISTINCT FROM OLD.source OR NEW.source_client_id IS DISTINCT FROM OLD.source_client_id THEN
    RAISE EXCEPTION 'system_column_forbidden: %.source', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'customers' THEN
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'system_column_forbidden: customers.kind' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_customers_system_columns ON customers;
CREATE TRIGGER trg_customers_system_columns BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION protect_system_columns();
DROP TRIGGER IF EXISTS trg_products_system_columns ON products;
CREATE TRIGGER trg_products_system_columns BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION protect_system_columns();

-- ---------- K3/B4: harakati bor tovarning birligi o'zgarmaydi ----------
-- Harakat = ombor harakati, savdo qatori yoki kirim qatori shu tovarga bog'langan. Eski harakatlar yangi birlikda
-- o'qilib qolmasin. Hamma uchun (RPC ham: apply_catalog_draft birlik taklifi ham rad etiladi). Harakat yo'q bo'lsa ruxsat.
-- SECURITY DEFINER: RLS'dan qat'i nazar hamma harakatlar ko'rinsin (faqat mavjudlik tekshiriladi, hech narsa qaytmaydi).
CREATE OR REPLACE FUNCTION products_unit_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.unit IS DISTINCT FROM OLD.unit AND (
       EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = OLD.id)
    OR EXISTS (SELECT 1 FROM document_lines l WHERE l.product_id = OLD.id)
    OR EXISTS (SELECT 1 FROM purchase_lines l WHERE l.product_id = OLD.id)) THEN
    RAISE EXCEPTION 'unit_locked: tovarda harakat bor, birlikni o''zgartirib bo''lmaydi' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_products_unit_lock ON products;
CREATE TRIGGER trg_products_unit_lock BEFORE UPDATE OF unit ON products
  FOR EACH ROW EXECUTE FUNCTION products_unit_lock();

-- ---------- Funksiya huquqlari ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'post_sale', 'reverse_sale', 'record_payment', 'void_payment', 'adjust_stock', 'post_purchase', 'reverse_purchase',
      'record_supplier_payment', 'void_supplier_payment', 'post_supplier_opening_balance', 'reverse_sale_with_payments',
      'post_supplier_debt', 'agent_draft_sale', 'accept_agent_draft', 'admin_shop_stage',
      '_op_lock', 'protect_system_columns', 'products_unit_lock'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.proname IN ('_op_lock', 'protect_system_columns', 'products_unit_lock') THEN
      -- ichki yordamchi va trigger funksiyalari: hech kimga to'g'ridan-to'g'ri ochilmaydi
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;
