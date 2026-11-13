-- 014: xavfsizlik va barqarorlik (B7, B8, B9, B10, S1, S3, S4, S5, S10, H2, K3). 001..014 qo'llangandan keyin.
-- Har band eski kodda (001..013) yiqiladi: tekshiruv hisobotda (docs/reports/2026-11-12-B2-014-XAVFSIZLIK.md).
-- B10 parallel testi dblink orqali ikkita haqiqiy sessiya ochadi (lokal/CI PostgreSQL, superuser).
\set ON_ERROR_STOP 1
\set pgpass ''
\getenv pgpass PGPASSWORD

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claims', CASE WHEN p_uid IS NULL THEN '{}' ELSE json_build_object('sub', p_uid)::text END, false);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* p_pattern THEN
      RAISE EXCEPTION 'TEST FAIL: kutilgan xato "%" , olingan "%" — SQL: %', p_pattern, SQLERRM, p_sql;
    END IF;
    RAISE NOTICE 'PASS (xato kutilgandek): % → %', left(p_sql, 70), SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'TEST FAIL: xato kutilgan edi, lekin muvaffaqiyatli bajarildi — SQL: %', p_sql;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_actual anyelement, p_expected anyelement, p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'TEST FAIL [%]: kutilgan %, olingan %', p_name, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'PASS: %', p_name;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.affected(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- B10: bir xil SQL ni ikki sessiyada parallel bajarish. A tranzaksiyani ochib chaqiradi (commit qilmaydi), B o'sha
-- chaqiruvni yuboradi va kutib qoladi (busy=1), A commit qiladi, B natijasi o'qiladi (xato bo'lsa 'ERROR: ...').
CREATE OR REPLACE FUNCTION pg_temp.par(p_conn text, p_uid uuid, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_setup text := format($f$SELECT set_config('request.jwt.claim.sub', %L, false), set_config('request.jwt.claims', %L, false); SET ROLE authenticated$f$,
                         p_uid, json_build_object('sub', p_uid)::text);
  v_a text;
  v_b text;
  v_busy int;
BEGIN
  PERFORM dblink_connect('par_a', p_conn);
  PERFORM dblink_connect('par_b', p_conn);
  PERFORM dblink_exec('par_a', v_setup);
  PERFORM dblink_exec('par_b', v_setup);
  PERFORM dblink_exec('par_a', 'BEGIN');
  SELECT r INTO v_a FROM dblink('par_a', p_sql) AS x(r text);
  PERFORM dblink_send_query('par_b', p_sql);
  PERFORM pg_sleep(0.5);
  v_busy := dblink_is_busy('par_b');
  PERFORM dblink_exec('par_a', 'COMMIT');
  BEGIN
    SELECT r INTO v_b FROM dblink_get_result('par_b') AS x(r text);
  EXCEPTION WHEN OTHERS THEN
    v_b := 'ERROR: ' || SQLERRM;
  END;
  PERFORM dblink_disconnect('par_a');
  PERFORM dblink_disconnect('par_b');
  RETURN jsonb_build_object('a', v_a, 'b', v_b, 'busy', v_busy);
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE TEMP TABLE t (k text PRIMARY KEY, v uuid);
GRANT ALL ON t TO authenticated, anon;

-- ---------- Tayyorgarlik ----------
INSERT INTO auth.users (id, email) VALUES ('ad140000-0000-0000-0000-0000000000ad', 'admin14@test.local') ON CONFLICT DO NOTHING;
INSERT INTO platform_admins (user_id) VALUES ('ad140000-0000-0000-0000-0000000000ad') ON CONFLICT DO NOTHING;

SELECT pg_temp.as_user('a1400000-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A14 do''koni'));
SELECT pg_temp.as_user('b1400000-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B14 do''koni'));
SELECT pg_temp.as_user('a1400000-0000-0000-0000-000000000001');
INSERT INTO customers (id, shop_id, name) VALUES ('a1400000-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shopA'), 'Doimiy Ali');
INSERT INTO customers (id, shop_id, name) VALUES ('a1400000-0000-0000-0000-0000000000c2', (SELECT v FROM t WHERE k = 'shopA'), 'Arxiv Vali');
INSERT INTO customers (id, shop_id, name) VALUES ('a1400000-0000-0000-0000-0000000000c3', (SELECT v FROM t WHERE k = 'shopA'), 'Arxiv Soli');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a1400000-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopA'), 'Rahim aka');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('a1400000-0000-0000-0000-0000000000f1', (SELECT v FROM t WHERE k = 'shopA'), 'Shakar14', 'kg', 12000);
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('a1400000-0000-0000-0000-0000000000f2', (SELECT v FROM t WHERE k = 'shopA'), 'Tuz14', 'dona', 3000);
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('a1400000-0000-0000-0000-0000000000f3', (SELECT v FROM t WHERE k = 'shopA'), 'Un14', 'qop', 200000);
INSERT INTO t VALUES ('walkA', ensure_walkin_customer((SELECT v FROM t WHERE k = 'shopA')));

-- ============================================================
-- B8: is_shop_member faqat authenticated
-- ============================================================
RESET ROLE;
SELECT pg_temp.assert_eq(has_function_privilege('anon', 'is_shop_member(uuid)', 'EXECUTE'), false, 'B8: anon is_shop_member ni chaqira olmaydi');
SELECT pg_temp.assert_eq(has_function_privilege('authenticated', 'is_shop_member(uuid)', 'EXECUTE'), true, 'B8: authenticated chaqira oladi (RLS uchun)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                          WHERE p.oid = 'is_shop_member(uuid)'::regprocedure AND a.grantee = 0), 0::bigint, 'B8: PUBLIC grant yo''q');
SET ROLE anon;
SELECT pg_temp.expect_error(format($$SELECT is_shop_member(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied');
SET ROLE authenticated;
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 4::bigint, 'B8: RLS ishlaydi — A o''z mijozlarini ko''radi (3 + bir martalik)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM shops), 1::bigint, 'B8: RLS ishlaydi — A faqat o''z do''konini ko''radi');
SELECT pg_temp.as_user('b1400000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 0::bigint, 'B8: RLS ishlaydi — B A ning mijozlarini ko''rmaydi');
SELECT pg_temp.as_user('a1400000-0000-0000-0000-000000000001');

-- ============================================================
-- B9: search_path
-- ============================================================
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.oid IN ('agent_drafts_guard()'::regprocedure, 'calculate_document_total(uuid)'::regprocedure,
                    'calculate_line_total(bigint,bigint)'::regprocedure, 'catalog_norm(text)'::regprocedure,
                    'get_document_pg_total(uuid)'::regprocedure, 'prevent_append_only_change()'::regprocedure,
                    'prevent_ledger_modification()'::regprocedure, 'products_sync_prices()'::regprocedure,
                    'update_updated_at()'::regprocedure)
      AND 'search_path=public, pg_temp' = ANY (p.proconfig)), 9::bigint, 'B9: 9 funksiyada search_path = public, pg_temp');
SELECT pg_temp.assert_eq(calculate_line_total(10000, 13000) + calculate_line_total(5000, 15000) + calculate_line_total(20000, 9000), 385000::bigint, 'B9: hisob o''zgarmadi (385 000)');
SELECT pg_temp.assert_eq(catalog_norm('  Do‘kon   NON '), 'do''kon non'::text, 'B9: catalog_norm o''zgarmadi');

-- ============================================================
-- H2: FK indekslari va shops_update
-- ============================================================
SELECT pg_temp.assert_eq((SELECT count(*) FROM unnest(ARRAY[
    'idx_agent_drafts_customer', 'idx_document_lines_product', 'idx_document_lines_shop', 'idx_payment_voids_shop',
    'idx_payments_customer_id', 'idx_product_aliases_product', 'idx_purchase_documents_supplier_id',
    'idx_purchase_lines_product_id', 'idx_stock_movements_product_id', 'idx_supplier_payment_voids_shop',
    'idx_supplier_payments_supplier_id']) AS n WHERE to_regclass('public.' || n) IS NOT NULL), 11::bigint, 'H2: 11 ta FK indeksi bor');
-- Advisor ro'yxatidagi 11 FK: har birida shu ustun bilan boshlanadigan (qisman bo'lmagan) indeks bor
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM (VALUES ('agent_drafts', 'customer_id'), ('document_lines', 'product_id'), ('document_lines', 'shop_id'),
                                ('payment_voids', 'shop_id'), ('payments', 'customer_id'), ('product_aliases', 'product_id'),
                                ('purchase_documents', 'supplier_id'), ('purchase_lines', 'product_id'), ('stock_movements', 'product_id'),
                                ('supplier_payment_voids', 'shop_id'), ('supplier_payments', 'supplier_id')) AS fk(tbl, col)
    WHERE EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                  WHERE i.indrelid = ('public.' || fk.tbl)::regclass AND a.attname = fk.col AND i.indpred IS NULL)),
  11::bigint, 'H2: 11 ta FK ustuni indeksning birinchi ustuni');
SELECT pg_temp.assert_eq((SELECT qual LIKE '%( SELECT auth.uid()%' AND with_check LIKE '%( SELECT auth.uid()%' FROM pg_policies WHERE tablename = 'shops' AND policyname = 'shops_update'),
  true, 'H2: shops_update da (select auth.uid())');
SELECT pg_temp.assert_eq(pg_temp.affected(format($$UPDATE shops SET name = 'A14 yangi' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'shopA'))), 1::bigint, 'H2: ega o''z do''konini o''zgartiradi');
SELECT pg_temp.as_user('b1400000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq(pg_temp.affected(format($$UPDATE shops SET name = 'buzildi' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'shopA'))), 0::bigint, 'H2: begona do''konni o''zgartira olmaydi');
SELECT pg_temp.as_user('a1400000-0000-0000-0000-000000000001');

-- ============================================================
-- S1: agent_draft_sale bir martalik mijoz id'sini rad etadi
-- ============================================================
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'd14-walkin-id', %L, NULL,
  '[{"product_name":"Tuz14","qty_milli":"1000","unit":"dona","unit_price":"3000"}]'::jsonb, 3000, false, 'naqd', 3000)$$,
  (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkA')), 'walkin_customer_id_forbidden');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_drafts WHERE client_op_id = 'd14-walkin-id'), 0::bigint, 'S1: qoralama yaratilmadi');
INSERT INTO t VALUES ('dw', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'd14-walkin-ok', NULL, NULL,
  '[{"product_name":"Tuz14","qty_milli":"1000","unit":"dona","unit_price":"3000"}]'::jsonb, 3000, true, 'naqd', NULL));
SELECT pg_temp.assert_eq((SELECT payload->>'walkin' FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dw')), 'true'::text, 'S1: p_walkin yo''li ishlaydi');
SELECT pg_temp.assert_eq(accept_agent_draft((SELECT v FROM t WHERE k = 'dw')), (SELECT v FROM t WHERE k = 'dw'), 'S1: walk-in qoralama tasdiqlanadi');

-- ============================================================
-- S3: arxivlangan mijozga qoralama -> draft_stale
-- ============================================================
INSERT INTO t VALUES ('ds', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'd14-stale-sale', 'a1400000-0000-0000-0000-0000000000c2', NULL,
  '[{"product_name":"Tuz14","qty_milli":"2000","unit":"dona","unit_price":"3000"}]'::jsonb, 6000));
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000d3', 'op14-c3', 'a1400000-0000-0000-0000-0000000000c3', NULL,
  '[{"product_name":"Tuz14","qty_milli":"5000","unit":"dona","unit_price":"3000"}]'::jsonb, 15000);
INSERT INTO t VALUES ('dp', agent_draft_payment((SELECT v FROM t WHERE k = 'shopA'), 'd14-stale-pay', 'a1400000-0000-0000-0000-0000000000c3', 5000, 'naqd'));
UPDATE customers SET is_active = false WHERE id IN ('a1400000-0000-0000-0000-0000000000c2', 'a1400000-0000-0000-0000-0000000000c3');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'ds')), 'draft_stale');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dp')), 'draft_stale');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents WHERE id = (SELECT v FROM t WHERE k = 'ds')), 0::bigint, 'S3: arxiv mijozga savdo yozilmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments WHERE id = (SELECT v FROM t WHERE k = 'dp')), 0::bigint, 'S3: arxiv mijozga to''lov yozilmadi');
SELECT pg_temp.assert_eq((SELECT string_agg(status, ',' ORDER BY client_op_id) FROM agent_drafts WHERE id IN ((SELECT v FROM t WHERE k = 'ds'), (SELECT v FROM t WHERE k = 'dp'))),
  'draft,draft'::text, 'S3: qoralamalar ochiq qoldi (rad etish mumkin)');
SELECT reject_agent_draft((SELECT v FROM t WHERE k = 'ds'), 'mijoz arxivda');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'ds')), 'rejected'::text, 'S3: eskirgan qoralama rad etiladi');
UPDATE customers SET is_active = true WHERE id = 'a1400000-0000-0000-0000-0000000000c3';
SELECT pg_temp.assert_eq(accept_agent_draft((SELECT v FROM t WHERE k = 'dp')), (SELECT v FROM t WHERE k = 'dp'), 'S3: mijoz qaytarilsa to''lov qoralamasi tasdiqlanadi');

-- ============================================================
-- S4: klient tizim ustunlarini o'zgartira olmaydi; RPC'lar ishlaydi
-- ============================================================
SELECT pg_temp.expect_error($$UPDATE customers SET kind = 'one_time' WHERE id = 'a1400000-0000-0000-0000-0000000000c1'$$, 'system_column_forbidden');
SELECT pg_temp.expect_error(format($$UPDATE customers SET kind = 'regular' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'walkA')), 'system_column_forbidden');
SELECT pg_temp.expect_error($$UPDATE customers SET source = 'agent' WHERE id = 'a1400000-0000-0000-0000-0000000000c1'$$, 'system_column_forbidden');
SELECT pg_temp.expect_error($$UPDATE customers SET source_client_id = 'soxta' WHERE id = 'a1400000-0000-0000-0000-0000000000c1'$$, 'system_column_forbidden');
SELECT pg_temp.expect_error($$UPDATE products SET source = 'agent' WHERE id = 'a1400000-0000-0000-0000-0000000000f2'$$, 'system_column_forbidden');
SELECT pg_temp.expect_error($$UPDATE products SET source_client_id = 'soxta' WHERE id = 'a1400000-0000-0000-0000-0000000000f2'$$, 'system_column_forbidden');
SELECT pg_temp.expect_error(format($$INSERT INTO products (shop_id, name, source) VALUES (%L, 'Soxta14', 'agent')$$, (SELECT v FROM t WHERE k = 'shopA')), 'system_column_forbidden');
SELECT pg_temp.expect_error(format($$INSERT INTO customers (shop_id, name, source_client_id) VALUES (%L, 'Soxta14', 'claude')$$, (SELECT v FROM t WHERE k = 'shopA')), 'system_column_forbidden');
SELECT pg_temp.assert_eq((SELECT kind || '/' || source FROM customers WHERE id = 'a1400000-0000-0000-0000-0000000000c1'), 'regular/app'::text, 'S4: mijoz turi va manbasi o''zgarmadi');
SELECT pg_temp.assert_eq((SELECT kind FROM customers WHERE id = (SELECT v FROM t WHERE k = 'walkA')), 'one_time'::text, 'S4: bir martalik mijoz doimiyga aylanmadi');
-- Oddiy tahrir va mobil upsert (o'sha qiymatlar bilan) ishlaydi
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE customers SET name = 'Doimiy Ali aka', phone = '+998', notes = 'izoh' WHERE id = 'a1400000-0000-0000-0000-0000000000c1'$$), 1::bigint, 'S4: nom/telefon/izoh tahriri ishlaydi');
SELECT pg_temp.assert_eq(pg_temp.affected(format($$INSERT INTO products (id, shop_id, name, unit, last_price, is_active) VALUES ('a1400000-0000-0000-0000-0000000000f2', %L, 'Tuz14', 'dona', 3500, true)
  ON CONFLICT (id) DO UPDATE SET shop_id = excluded.shop_id, name = excluded.name, unit = excluded.unit, last_price = excluded.last_price, is_active = excluded.is_active$$,
  (SELECT v FROM t WHERE k = 'shopA'))), 1::bigint, 'S4: mobil upsert (tizim ustunlarisiz) ishlaydi');
-- SECURITY DEFINER RPC'lar tizim ustunlarini yozishda davom etadi
INSERT INTO t VALUES ('agentCust', (agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req14-cust-0001', 'Agent mijoz14') ->> 'id')::uuid);
SELECT pg_temp.assert_eq((SELECT source FROM customers WHERE id = (SELECT v FROM t WHERE k = 'agentCust')), 'agent'::text, 'S4: agent_add_customer source=agent yozadi');
SELECT pg_temp.assert_eq((agent_add_products((SELECT v FROM t WHERE k = 'shopA'), 'req14-prod-0001', '[{"name":"Agent tovar14","unit":"dona","price":1000}]'::jsonb) ->> 'created_count'), '1'::text, 'S4: agent_add_products ishlaydi');
SELECT pg_temp.assert_eq((SELECT source FROM products WHERE name = 'Agent tovar14'), 'agent'::text, 'S4: agent tovari source=agent');

-- ============================================================
-- S5: bir martalik mijoz to'lovini alohida void qilish taqiqlangan; savdo bekor qilish yo'li ishlaydi
-- ============================================================
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000e1', 'op14-w1', (SELECT v FROM t WHERE k = 'walkA'), NULL,
  '[{"product_name":"Tuz14","qty_milli":"2000","unit":"dona","unit_price":"3000"}]'::jsonb, 6000, now(), 'naqd', 6000);
INSERT INTO t VALUES ('wp1', (SELECT id FROM payments WHERE client_op_id = 'sale-pay:op14-w1'));
SELECT pg_temp.expect_error(format($$SELECT void_payment(%L, %L, 'xato kiritildi')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'wp1')), 'walkin_payment_void_forbidden');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkA')), 0::bigint, 'S5: walk-in "qarzi" paydo bo''lmadi');
-- reverse_sale avto-void (006)
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000e1', 'rev14-w1', 'xato savdo');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE payment_id = (SELECT v FROM t WHERE k = 'wp1')), 1::bigint, 'S5: reverse_sale walk-in to''lovini bekor qildi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkA')), 0::bigint, 'S5: bekor qilingandan keyin walk-in balansi 0');
-- reverse_sale_with_payments (013) walk-in to'lovi id'si bilan
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000e2', 'op14-w2', (SELECT v FROM t WHERE k = 'walkA'), NULL,
  '[{"product_name":"Tuz14","qty_milli":"1000","unit":"dona","unit_price":"3000"}]'::jsonb, 3000, now(), 'karta', 3000);
INSERT INTO t VALUES ('wp2', (SELECT id FROM payments WHERE client_op_id = 'sale-pay:op14-w2'));
SELECT reverse_sale_with_payments((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000e2', 'rev14-w2', 'xato savdo', ARRAY[(SELECT v FROM t WHERE k = 'wp2')]);
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = 'a1400000-0000-0000-0000-0000000000e2'), 'reversed'::text, 'S5: reverse_sale_with_payments walk-in savdoni bekor qildi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE payment_id = (SELECT v FROM t WHERE k = 'wp2')), 1::bigint, 'S5: walk-in to''lovi bir marta bekor qilindi');
-- doimiy mijoz to'lovini void qilish avvalgidek ishlaydi
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000d1', 'op14-c1', 'a1400000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"Shakar14","qty_milli":"10000","unit":"kg","unit_price":"12000"}]'::jsonb, 120000);
INSERT INTO t VALUES ('rp1', record_payment((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000b1', 'op14-rp1', 'a1400000-0000-0000-0000-0000000000c1', 20000, 'naqd', NULL));
SELECT pg_temp.assert_eq(void_payment((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'rp1'), 'xato kiritildi') IS NOT NULL, true, 'S5: doimiy mijoz to''lovi void qilinadi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000c1'), 120000::bigint, 'S5: void dan keyin qarz 120 000');

-- ============================================================
-- K3/B4: harakati bor tovar birligi o'zgarmaydi
-- ============================================================
-- Shakar14 savdoda (op14-c1) tovarga bog'langan (ombor harakati bor); Un14 da harakat yo'q
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements WHERE product_id = 'a1400000-0000-0000-0000-0000000000f1') > 0, true, 'K3: Shakar14 da harakat bor');
SELECT pg_temp.expect_error($$UPDATE products SET unit = 'g' WHERE id = 'a1400000-0000-0000-0000-0000000000f1'$$, 'unit_locked');
SELECT pg_temp.assert_eq((SELECT unit FROM products WHERE id = 'a1400000-0000-0000-0000-0000000000f1'), 'kg'::text, 'K3: birlik o''zgarmadi');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE products SET unit = 'kg', name = 'Shakar14', last_price = 12500 WHERE id = 'a1400000-0000-0000-0000-0000000000f1'$$), 1::bigint, 'K3: o''sha birlik bilan tahrir (narx) ishlaydi');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE products SET unit = 'kg' WHERE id = 'a1400000-0000-0000-0000-0000000000f3'$$), 1::bigint, 'K3: harakatsiz tovar birligi o''zgaradi');
SELECT pg_temp.assert_eq((SELECT unit FROM products WHERE id = 'a1400000-0000-0000-0000-0000000000f3'), 'kg'::text, 'K3: harakatsiz tovar birligi kg');
-- Agent birlik taklifi tasdiqda ham bloklanadi (apply_catalog_draft)
INSERT INTO t VALUES ('du', agent_propose_product_update((SELECT v FROM t WHERE k = 'shopA'), 'req14-unit-0001', 'a1400000-0000-0000-0000-0000000000f1', '{"unit":"dona"}'::jsonb));
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'du')), 'unit_locked');

-- ============================================================
-- B7: kirim izohi
-- ============================================================
SELECT pg_temp.assert_eq((SELECT count(*) FROM pg_proc WHERE proname = 'post_purchase' AND pronamespace = 'public'::regnamespace), 1::bigint, 'B7: post_purchase bitta overload');
INSERT INTO t VALUES ('pu1', post_purchase(p_shop_id => (SELECT v FROM t WHERE k = 'shopA'), p_purchase_id => 'a1400000-0000-0000-0000-000000000101',
  p_client_op_id => 'op14-pu1', p_supplier_id => 'a1400000-0000-0000-0000-0000000000a1', p_doc_date => NULL,
  p_lines => '[{"product_id":"a1400000-0000-0000-0000-0000000000f2","qty_milli":"10000","unit_cost":"2000"}]'::jsonb,
  p_client_total => 20000, p_payment_method => NULL, p_paid => NULL, p_note => '  Ertaga qolgani keladi  '));
SELECT pg_temp.assert_eq((SELECT note FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'pu1')), 'Ertaga qolgani keladi'::text, 'B7: izoh saqlandi (trim)');
-- veb chaqiruvi (nomli argumentlar, p_note'siz, p_created_at'siz)
INSERT INTO t VALUES ('pu2', post_purchase(p_shop_id => (SELECT v FROM t WHERE k = 'shopA'), p_purchase_id => 'a1400000-0000-0000-0000-000000000102',
  p_client_op_id => 'op14-pu2', p_supplier_id => 'a1400000-0000-0000-0000-0000000000a1', p_doc_date => NULL,
  p_lines => '[{"product_id":"a1400000-0000-0000-0000-0000000000f2","qty_milli":"1000","unit_cost":"2000"}]'::jsonb,
  p_client_total => 2000, p_payment_method => NULL, p_paid => NULL));
SELECT pg_temp.assert_eq((SELECT note IS NULL AND status = 'posted' FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'pu2')), true, 'B7: eski chaqiruv ishlaydi, izoh NULL');
-- pozitsion 8 argumentli chaqiruv (mobil/eski)
SELECT pg_temp.assert_eq(post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-000000000103', 'op14-pu3', 'a1400000-0000-0000-0000-0000000000a1', NULL,
  '[{"product_id":"a1400000-0000-0000-0000-0000000000f2","qty_milli":"1000","unit_cost":"2000"}]'::jsonb, 2000, now()), 'a1400000-0000-0000-0000-000000000103'::uuid, 'B7: pozitsion chaqiruv ishlaydi');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(p_shop_id => %L, p_purchase_id => gen_random_uuid(), p_client_op_id => 'op14-pu-long',
  p_supplier_id => 'a1400000-0000-0000-0000-0000000000a1', p_doc_date => NULL,
  p_lines => '[{"product_id":"a1400000-0000-0000-0000-0000000000f2","qty_milli":"1000","unit_cost":"2000"}]'::jsonb, p_client_total => 2000, p_note => repeat('x', 501))$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'note_too_long');
-- agent kirim qoralamasi izohi tasdiqda saqlanadi
INSERT INTO t VALUES ('dpu', agent_draft_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd14-purchase-note', 'a1400000-0000-0000-0000-0000000000a1', NULL,
  '[{"product_id":"a1400000-0000-0000-0000-0000000000f2","qty_milli":"5000","unit_cost":"2000"}]'::jsonb, 10000, NULL, NULL, 'Agent izohi: 2 qop ezilgan'));
SELECT accept_agent_draft((SELECT v FROM t WHERE k = 'dpu'));
SELECT pg_temp.assert_eq((SELECT note FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'dpu')), 'Agent izohi: 2 qop ezilgan'::text, 'B7: agent kirim izohi tasdiqda yo''qolmadi');

-- ============================================================
-- S10: admin_shop_stage audit yozadi
-- ============================================================
SELECT pg_temp.expect_error(format($$SELECT admin_shop_stage(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'not_platform_admin');
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM admin_audit WHERE action = 'admin_shop_stage' AND target = (SELECT v::text FROM t WHERE k = 'shopA')), 0::bigint, 'S10: admin bo''lmagan chaqiruv auditga yozilmadi');
SELECT pg_temp.as_user('ad140000-0000-0000-0000-0000000000ad');
SET ROLE authenticated;
SELECT pg_temp.assert_eq(admin_shop_stage((SELECT v FROM t WHERE k = 'shopA')) >= 1, true, 'S10: admin bosqichni oladi');
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM admin_audit WHERE action = 'admin_shop_stage' AND target = (SELECT v::text FROM t WHERE k = 'shopA')
                            AND admin_id = 'ad140000-0000-0000-0000-0000000000ad'), 1::bigint, 'S10: admin_shop_stage admin_audit ga yozildi (target = do''kon id)');
SELECT pg_temp.assert_eq((SELECT provolatile FROM pg_proc WHERE oid = 'admin_shop_stage(uuid)'::regprocedure), 'v'::"char", 'S10: admin_shop_stage VOLATILE');

-- ============================================================
-- B10: parallel bir xil client_op_id -> ikkinchisi mavjud natijani oladi (xom 23505 emas)
-- ============================================================
RESET ROLE;
CREATE EXTENSION IF NOT EXISTS dblink;
CREATE TEMP TABLE par_conf AS
  SELECT format('dbname=%s user=%s port=%s', current_database(), session_user, current_setting('port'))
         || CASE WHEN :'pgpass' <> '' THEN ' password=' || :'pgpass' ELSE '' END AS conn;
SELECT pg_temp.assert_eq(has_function_privilege('authenticated', '_op_lock(text, uuid, text)', 'EXECUTE'), false, 'B10: _op_lock klientga yopiq');

-- post_sale
CREATE TEMP TABLE par_res (k text PRIMARY KEY, r jsonb);
INSERT INTO par_res SELECT 'sale', pg_temp.par((SELECT conn FROM par_conf), 'a1400000-0000-0000-0000-000000000001',
  format($$SELECT post_sale(%L, 'a1400000-0000-0000-0000-0000000000d9', 'op14-par-sale', 'a1400000-0000-0000-0000-0000000000c1', NULL,
    '[{"product_name":"Shakar14","qty_milli":"1000","unit":"kg","unit_price":"12000"}]'::jsonb, 12000)::text$$, (SELECT v FROM t WHERE k = 'shopA')));
SELECT pg_temp.assert_eq((SELECT (r->>'busy')::int FROM par_res WHERE k = 'sale'), 1, 'B10 post_sale: ikkinchi sessiya birinchisini kutdi (haqiqiy parallel)');
SELECT pg_temp.assert_eq((SELECT r->>'b' FROM par_res WHERE k = 'sale'), (SELECT r->>'a' FROM par_res WHERE k = 'sale'), 'B10 post_sale: ikkinchisi o''sha id ni oldi (23505 emas)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents WHERE client_op_id = 'op14-par-sale'), 1::bigint, 'B10 post_sale: bitta hujjat');

-- record_payment
INSERT INTO par_res SELECT 'pay', pg_temp.par((SELECT conn FROM par_conf), 'a1400000-0000-0000-0000-000000000001',
  format($$SELECT record_payment(%L, 'a1400000-0000-0000-0000-0000000000b9', 'op14-par-pay', 'a1400000-0000-0000-0000-0000000000c1', 1000, 'naqd', NULL)::text$$,
         (SELECT v FROM t WHERE k = 'shopA')));
SELECT pg_temp.assert_eq((SELECT (r->>'busy')::int FROM par_res WHERE k = 'pay'), 1, 'B10 record_payment: ikkinchi sessiya kutdi');
SELECT pg_temp.assert_eq((SELECT r->>'b' FROM par_res WHERE k = 'pay'), (SELECT r->>'a' FROM par_res WHERE k = 'pay'), 'B10 record_payment: ikkinchisi o''sha id ni oldi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments WHERE client_op_id = 'op14-par-pay'), 1::bigint, 'B10 record_payment: bitta to''lov');

-- post_purchase
INSERT INTO par_res SELECT 'purchase', pg_temp.par((SELECT conn FROM par_conf), 'a1400000-0000-0000-0000-000000000001',
  format($$SELECT post_purchase(p_shop_id => %L, p_purchase_id => 'a1400000-0000-0000-0000-000000000109', p_client_op_id => 'op14-par-pu',
    p_supplier_id => 'a1400000-0000-0000-0000-0000000000a1', p_doc_date => NULL,
    p_lines => '[{"product_id":"a1400000-0000-0000-0000-0000000000f2","qty_milli":"1000","unit_cost":"2000"}]'::jsonb, p_client_total => 2000)::text$$,
    (SELECT v FROM t WHERE k = 'shopA')));
SELECT pg_temp.assert_eq((SELECT (r->>'busy')::int FROM par_res WHERE k = 'purchase'), 1, 'B10 post_purchase: ikkinchi sessiya kutdi');
SELECT pg_temp.assert_eq((SELECT r->>'b' FROM par_res WHERE k = 'purchase'), (SELECT r->>'a' FROM par_res WHERE k = 'purchase'), 'B10 post_purchase: ikkinchisi o''sha id ni oldi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements WHERE document_id = 'a1400000-0000-0000-0000-000000000109'), 1::bigint, 'B10 post_purchase: ombor harakati bitta');

-- void_payment (to'lov qatori qulfi)
INSERT INTO t VALUES ('rp2', 'a1400000-0000-0000-0000-0000000000b2');
SELECT pg_temp.as_user('a1400000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT record_payment((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000b2', 'op14-rp2', 'a1400000-0000-0000-0000-0000000000c1', 1000, 'naqd', NULL);
RESET ROLE;
INSERT INTO par_res SELECT 'void', pg_temp.par((SELECT conn FROM par_conf), 'a1400000-0000-0000-0000-000000000001',
  format($$SELECT void_payment(%L, 'a1400000-0000-0000-0000-0000000000b2', 'ikki marta bosildi')::text$$, (SELECT v FROM t WHERE k = 'shopA')));
SELECT pg_temp.assert_eq((SELECT (r->>'busy')::int FROM par_res WHERE k = 'void'), 1, 'B10 void_payment: ikkinchi sessiya kutdi');
SELECT pg_temp.assert_eq((SELECT r->>'b' FROM par_res WHERE k = 'void'), (SELECT r->>'a' FROM par_res WHERE k = 'void'), 'B10 void_payment: ikkinchisi o''sha bekor qilishni oldi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE payment_id = 'a1400000-0000-0000-0000-0000000000b2'), 1::bigint, 'B10 void_payment: bitta bekor qilish');

-- Ketma-ket takror (eski xatti-harakat saqlangan)
SELECT pg_temp.as_user('a1400000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT pg_temp.assert_eq(post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000d9', 'op14-par-sale', 'a1400000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"Shakar14","qty_milli":"1000","unit":"kg","unit_price":"12000"}]'::jsonb, 12000), 'a1400000-0000-0000-0000-0000000000d9'::uuid, 'B10: ketma-ket takror o''sha id');
SELECT pg_temp.assert_eq(adjust_stock((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000f2', 'op14-adj', 1000, 'inventarizatsiya'),
  adjust_stock((SELECT v FROM t WHERE k = 'shopA'), 'a1400000-0000-0000-0000-0000000000f2', 'op14-adj', 1000, 'inventarizatsiya'), 'B10: adjust_stock takror o''sha id');
RESET ROLE;

\echo '=== BARCHA 91_xavfsizlik_014 TESTLARI O''TDI ==='
