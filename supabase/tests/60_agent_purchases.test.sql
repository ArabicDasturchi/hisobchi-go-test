-- ============================================================
-- Agent kirim qoralamasi, ta'minotchilar, tovar qoldig'i, bir martalik savdo qoralamasi (001..008).
-- Qoida: agent faqat QORALAMA yaratadi va o'qiydi; ledger, ombor va qarzga tegmaydi.
-- Tasdiqlash faqat birinchi tomon sessiyasida (accept_agent_draft -> post_purchase / post_sale).
-- ============================================================
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claims', CASE WHEN p_uid IS NULL THEN '{}' ELSE json_build_object('sub', p_uid)::text END, false);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_oauth(p_uid uuid, p_client text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, false);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'client_id', p_client)::text, false);
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE TEMP TABLE t (k text PRIMARY KEY, v uuid);
GRANT ALL ON t TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.n_docs(p_table text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN EXECUTE format('SELECT count(*) FROM %I', p_table) INTO n; RETURN n; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- ---------- Tayyorgarlik (birinchi tomon sessiyasi) ----------
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b9b9b9b9-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a8a8a8a8-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Baraka Optom');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a8a8a8a8-0000-0000-0000-000000000002', (SELECT v FROM t WHERE k = 'shopA'), 'Eski taminotchi');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f8f8f8f8-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Un', 'kg', 13000);
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f8f8f8f8-0000-0000-0000-000000000002', (SELECT v FROM t WHERE k = 'shopA'), 'Sariyog', 'litr', 15000);
INSERT INTO customers (id, shop_id, name) VALUES ('c8c8c8c8-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Karim');
UPDATE suppliers SET is_active = false WHERE id = 'a8a8a8a8-0000-0000-0000-000000000002';
SELECT pg_temp.as_user('b9b9b9b9-0000-0000-0000-000000000002');
INSERT INTO suppliers (id, shop_id, name) VALUES ('b8b8b8b8-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopB'), 'B taminotchi');
INSERT INTO products (id, shop_id, name, unit) VALUES ('f8f8f8f8-0000-0000-0000-0000000000b1', (SELECT v FROM t WHERE k = 'shopB'), 'B tovar', 'dona');

-- Ilova birinchi kirimni yozadi: 100x9 000 + 50x11 000 = 1 450 000, berildi 1 000 000
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd8d8d8d8-0000-0000-0000-000000000001', 'op-k1', 'a8a8a8a8-0000-0000-0000-000000000001', DATE '2026-10-29',
  '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"100000","unit_cost":"9000"},{"product_id":"f8f8f8f8-0000-0000-0000-000000000002","qty_milli":"50000","unit_cost":"11000"}]'::jsonb,
  1450000, now(), 'naqd', 1000000);
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a8a8a8a8-0000-0000-0000-000000000001'), 450000::bigint, 'ilova kirimi: ostatka 450 000');

-- ---------- 1. Agent o'qish: qoldiq, tan narx, ta'minotchilar ----------
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.assert_eq((SELECT stock_milli FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA')) WHERE name = 'Un'), 100000::bigint, 'agent tovar qoldigini koradi');
SELECT pg_temp.assert_eq((SELECT cost_price FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA')) WHERE name = 'Sariyog'), 11000::bigint, 'agent tan narxni koradi (oxirgi kirim)');
SELECT pg_temp.assert_eq((SELECT price FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA')) WHERE name = 'Un'), 13000::bigint, 'agent sotuv narxini koradi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_suppliers((SELECT v FROM t WHERE k = 'shopA'))), 1::bigint, 'arxivlangan taminotchi agentga korinmaydi');
SELECT pg_temp.assert_eq((SELECT outstanding FROM agent_list_suppliers((SELECT v FROM t WHERE k = 'shopA')) WHERE name = 'Baraka Optom'), 450000::bigint, 'agent taminotchi qarzini koradi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_suppliers((SELECT v FROM t WHERE k = 'shopA'), 'barak')), 1::bigint, 'taminotchi qidiruvi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_suppliers((SELECT v FROM t WHERE k = 'shopA'), '%')), 0::bigint, 'qidiruvdagi % belgisi literal');
SELECT pg_temp.expect_error(format($$SELECT * FROM agent_list_suppliers(%L)$$, (SELECT v FROM t WHERE k = 'shopB')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT * FROM agent_list_products(%L)$$, (SELECT v FROM t WHERE k = 'shopB')), 'forbidden');
-- OAuth token ta'minotchilar jadvaliga to'g'ridan-to'g'ri tegmaydi
SELECT pg_temp.assert_eq((SELECT count(*) FROM suppliers), 0::bigint, 'OAuth suppliers jadvalini oqiy olmaydi');

-- ---------- 2. Agent kirim qoralamasi: hech narsaga ta'sir qilmaydi ----------
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('pdraft', agent_draft_purchase((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-p1', 'a8a8a8a8-0000-0000-0000-000000000001', DATE '2026-10-30',
  '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"10000","unit_cost":"9500","warnings":["narx oshgan"]}]'::jsonb,
  95000, 'karta', 50000, 'yangi partiya'));
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT total FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), 95000::bigint, 'qoralama jami PostgreSQL hisobi');
SELECT pg_temp.assert_eq((SELECT kind FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), 'purchase'::text, 'qoralama turi purchase');
SELECT pg_temp.assert_eq((SELECT target_id FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), 'a8a8a8a8-0000-0000-0000-000000000001'::uuid, 'taminotchi target_id da');
SELECT pg_temp.assert_eq((SELECT payload->'lines'->0->>'product_name' FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), 'Un'::text, 'nom tovardan olinadi (agent yubormagan)');
SELECT pg_temp.assert_eq((SELECT payload->'lines'->0->>'line_total' FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), '95000'::text, 'qator jami serverda');
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.assert_eq(agent_draft_purchase((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-p1', 'a8a8a8a8-0000-0000-0000-000000000001', DATE '2026-10-30',
  '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"10000","unit_cost":"9500"}]'::jsonb, 95000, 'karta', 50000), (SELECT v FROM t WHERE k = 'pdraft'), 'bir xil client_op_id: yangi qoralama yaratilmaydi');
SELECT pg_temp.assert_eq(pg_temp.n_docs('purchase_documents'), 0::bigint, 'OAuth kirim hujjatlarini oqiy olmaydi');
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 1::bigint, 'qoralama kirim hujjati yaratmadi');
SELECT pg_temp.assert_eq((SELECT sum(qty_milli) FROM stock_movements WHERE product_id = 'f8f8f8f8-0000-0000-0000-000000000001'), 100000::numeric, 'qoralama ombor qoldigiga tegmadi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a8a8a8a8-0000-0000-0000-000000000001'), 450000::bigint, 'qoralama taminotchi qarziga tegmadi');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f8f8f8f8-0000-0000-0000-000000000001'), 9000::bigint, 'qoralama tan narxga tegmadi');

SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e1', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"10000","unit_cost":"9500"}]'::jsonb, 94999)$$, (SELECT v FROM t WHERE k = 'shopA')), 'calc_mismatch');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e2', 'b8b8b8b8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'supplier_not_in_shop');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e3', 'a8a8a8a8-0000-0000-0000-000000000002', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'supplier_not_in_shop');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e4', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-0000000000b1","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'product_not_found');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e5', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"0","unit_cost":"1"}]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_qty');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e6', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"-5"}]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_price');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e7', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_lines');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e8', 'a8a8a8a8-0000-0000-0000-000000000001', DATE '2099-01-01', '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_date');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e9', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1000"}]'::jsonb, 1000, 'naqd', 451001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_exceeds_debt');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e10', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1000"}]'::jsonb, 1000, 'bitcoin', 10)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_method');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'e11', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1000"}]'::jsonb, 1000, NULL, 10)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_method');
-- boshqa do'konning agenti bu do'konga qoralama yarata olmaydi
SELECT pg_temp.as_oauth('b9b9b9b9-0000-0000-0000-000000000002', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'x1', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error(format($$SELECT agent_draft_purchase(%L, 'x2', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'not_authenticated');

-- ---------- 3. Agent tasdiqlay olmaydi va kirim yoza olmaydi ----------
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'pdraft')), 'oauth|forbidden|first');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'hack', 'a8a8a8a8-0000-0000-0000-000000000001', NULL, '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth|forbidden|first');
SELECT pg_temp.expect_error(format($$INSERT INTO agent_drafts (shop_id, kind, target_id, total, payload, client_op_id, client_id, created_by) VALUES (%L, 'purchase', 'a8a8a8a8-0000-0000-0000-000000000001', 1, '{}', 'direct', 'x', 'a9a9a9a9-0000-0000-0000-000000000001')$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied|row-level|violates');

-- ---------- 4. Ilova tasdiqlaydi: mavjud post_purchase yo'li ----------
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT accept_agent_draft((SELECT v FROM t WHERE k = 'pdraft'));
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), 'accepted'::text, 'qoralama tasdiqlandi');
SELECT pg_temp.assert_eq((SELECT subtotal FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), 95000::bigint, 'kirim hujjati id = qoralama id, jami 95 000');
SELECT pg_temp.assert_eq((SELECT doc_date FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), DATE '2026-10-30', 'kirim sanasi qoralamadagi');
SELECT pg_temp.assert_eq((SELECT calc_match FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'pdraft')), true, 'ikki hisob mos');
SELECT pg_temp.assert_eq((SELECT sum(qty_milli) FROM stock_movements WHERE product_id = 'f8f8f8f8-0000-0000-0000-000000000001'), 110000::numeric, 'tasdiqlashdan keyin ombor +10');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f8f8f8f8-0000-0000-0000-000000000001'), 9500::bigint, 'tan narx oxirgi kirimga yangilandi');
SELECT pg_temp.assert_eq((SELECT amount FROM supplier_payments WHERE client_op_id = 'purchase-pay:agent-draft:' || (SELECT v FROM t WHERE k = 'pdraft')::text), 50000::bigint, 'kirim bilan toʻlov yozildi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a8a8a8a8-0000-0000-0000-000000000001'), 495000::bigint, 'ostatka 450 000 + 95 000 − 50 000');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'pdraft')), 'draft_already_decided');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 2::bigint, 'ikkinchi tasdiqlash ikkinchi kirim yaratmadi');

-- Eskirgan qoralama: ta'minotchi tasdiqlashdan oldin arxivlandi
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('pdraft2', agent_draft_purchase((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-p2', 'a8a8a8a8-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000002","qty_milli":"5000","unit_cost":"12000"}]'::jsonb, 60000));
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
UPDATE suppliers SET is_active = false WHERE id = 'a8a8a8a8-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'pdraft2')), 'draft_stale');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft2')), 'draft'::text, 'eskirgan qoralama draft holatida qoldi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 2::bigint, 'eskirgan qoralama kirim yozmadi');
UPDATE suppliers SET is_active = true WHERE id = 'a8a8a8a8-0000-0000-0000-000000000001';
UPDATE products SET is_active = false WHERE id = 'f8f8f8f8-0000-0000-0000-000000000002';
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'pdraft2')), 'draft_stale');
UPDATE products SET is_active = true WHERE id = 'f8f8f8f8-0000-0000-0000-000000000002';
-- Rad etish kirimga ta'sir qilmaydi
SELECT reject_agent_draft((SELECT v FROM t WHERE k = 'pdraft2'), 'kerak emas');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'pdraft2')), 'rejected'::text, 'rad etildi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 2::bigint, 'rad etish kirim yozmadi');
-- Boshqa do'kon a'zosi A do'konining qoralamasini tasdiqlay olmaydi
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('pdraft3', agent_draft_purchase((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-p3', 'a8a8a8a8-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f8f8f8f8-0000-0000-0000-000000000002","qty_milli":"1000","unit_cost":"12000"}]'::jsonb, 12000));
SELECT pg_temp.as_user('b9b9b9b9-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'pdraft3')), 'draft_not_found');

-- ---------- 5. Savdo qoralamasi: bir martalik mijoz va to'lov ----------
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers WHERE kind = 'one_time'), 0::bigint, 'bir martalik mijoz hali yaratilmagan');
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('wdraft', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-w1', NULL, 'bir martalik',
  '[{"product_name":"Un","qty_milli":"10000","unit":"kg","unit_price":"13000"}]'::jsonb, 130000, true, 'naqd'));
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT payload->>'paid' FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'wdraft')), '130000'::text, 'bir martalik: toʻlov jamiga teng');
SELECT pg_temp.assert_eq((SELECT customer_id FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'wdraft')), NULL::uuid, 'qoralamada mijoz id yoq');
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers WHERE kind = 'one_time'), 0::bigint, 'agent tizim mijozini yaratmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents WHERE id = (SELECT v FROM t WHERE k = 'wdraft')), 0::bigint, 'qoralama savdo yozmadi');

SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'w2', NULL, NULL, '[{"product_name":"Un","qty_milli":"1000","unit":"kg","unit_price":"13000"}]'::jsonb, 13000, true)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_method');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'w3', NULL, NULL, '[{"product_name":"Un","qty_milli":"1000","unit":"kg","unit_price":"13000"}]'::jsonb, 13000, true, 'naqd', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'walkin_requires_full_payment');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'w4', 'c8c8c8c8-0000-0000-0000-000000000001', NULL, '[{"product_name":"Un","qty_milli":"1000","unit":"kg","unit_price":"13000"}]'::jsonb, 13000, true, 'naqd')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_customer');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'w5', 'c8c8c8c8-0000-0000-0000-000000000001', NULL, '[{"product_name":"Un","qty_milli":"1000","unit":"kg","unit_price":"13000"}]'::jsonb, 13000, false, 'naqd', 13001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_exceeds_debt');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'w6', NULL, NULL, '[{"product_name":"Un","qty_milli":"1000","unit":"kg","unit_price":"13000"}]'::jsonb, 13000, false, 'naqd', 5000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_requires_customer');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'w7', NULL, NULL, '[{"product_name":"Un","qty_milli":"1000","unit":"kg","unit_price":"13000"}]'::jsonb, 12999, true, 'naqd')$$, (SELECT v FROM t WHERE k = 'shopA')), 'calc_mismatch');
-- Doimiy mijoz: qisman to'lov bilan
INSERT INTO t VALUES ('rdraft', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-w8', 'c8c8c8c8-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"Un","qty_milli":"10000","unit":"kg","unit_price":"13000"}]'::jsonb, 130000, false, 'karta', 30000));
-- Eski 6 argumentli chaqiruv ishlayveradi (to'lovsiz, qarzga)
INSERT INTO t VALUES ('ldraft', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-w9', 'c8c8c8c8-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"Un","qty_milli":"1000","unit":"kg","unit_price":"13000"}]'::jsonb, 13000));

SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SELECT accept_agent_draft((SELECT v FROM t WHERE k = 'wdraft'));
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers WHERE kind = 'one_time'), 1::bigint, 'tasdiqlashda bir martalik mijoz yaratildi');
SELECT pg_temp.assert_eq((SELECT c.kind FROM documents d JOIN customers c ON c.id = d.customer_id WHERE d.id = (SELECT v FROM t WHERE k = 'wdraft')), 'one_time'::text, 'savdo bir martalik mijozga');
SELECT pg_temp.assert_eq((SELECT amount FROM payments WHERE client_op_id = 'sale-pay:agent-draft:' || (SELECT v FROM t WHERE k = 'wdraft')::text), 130000::bigint, 'bir martalik savdo toʻliq toʻlandi');
SELECT pg_temp.assert_eq((SELECT method FROM payments WHERE client_op_id = 'sale-pay:agent-draft:' || (SELECT v FROM t WHERE k = 'wdraft')::text), 'naqd'::text, 'toʻlov usuli qoralamadagi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), (SELECT id FROM customers WHERE kind = 'one_time')), 0::bigint, 'bir martalik mijoz qarz yaratmadi');
SELECT pg_temp.assert_eq((SELECT sum(qty_milli) FROM stock_movements WHERE product_id = 'f8f8f8f8-0000-0000-0000-000000000001'), 100000::numeric, 'savdo ombordan 10 ayirdi (110 − 10)');

SELECT accept_agent_draft((SELECT v FROM t WHERE k = 'rdraft'));
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c8c8c8c8-0000-0000-0000-000000000001'), 100000::bigint, 'doimiy mijoz: 130 000 − 30 000 = 100 000 qarz');
SELECT accept_agent_draft((SELECT v FROM t WHERE k = 'ldraft'));
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c8c8c8c8-0000-0000-0000-000000000001'), 113000::bigint, 'eski yol: toʻlovsiz savdo qarzga');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'wdraft')), 'draft_already_decided');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments WHERE client_op_id = 'sale-pay:agent-draft:' || (SELECT v FROM t WHERE k = 'wdraft')::text), 1::bigint, 'ikkinchi tasdiqlash ikkinchi toʻlov yaratmadi');

-- Agent bir martalik mijozni roʻyxatda koʻrmaydi
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_customers((SELECT v FROM t WHERE k = 'shopA'))), 1::bigint, 'agent faqat doimiy mijozni koradi');

RESET ROLE;
\echo BARCHA 60-TEST OTDI
