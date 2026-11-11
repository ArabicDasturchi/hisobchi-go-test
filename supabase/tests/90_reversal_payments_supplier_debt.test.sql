-- 013: savdoni to'lovlari bilan bekor qilish (W1) va ta'minotchiga tovarsiz qarz yozuvi (W2). 001..013 qo'llangandan keyin.
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE TEMP TABLE t (k text PRIMARY KEY, v uuid);
GRANT ALL ON t TO authenticated, anon;

-- ---------- Tayyorgarlik ----------
SELECT pg_temp.as_user('a1310000-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b1310000-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
INSERT INTO suppliers (id, shop_id, name) VALUES ('b1310000-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopB'), 'B ta''minotchi');
SELECT pg_temp.as_user('a1310000-0000-0000-0000-000000000001');
INSERT INTO customers (id, shop_id, name) VALUES ('a1310000-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shopA'), 'Ali');
INSERT INTO customers (id, shop_id, name) VALUES ('a1310000-0000-0000-0000-0000000000c2', (SELECT v FROM t WHERE k = 'shopA'), 'Vali');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a1310000-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopA'), 'Rahim aka');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('a1310000-0000-0000-0000-0000000000f1', (SELECT v FROM t WHERE k = 'shopA'), 'Shakar', 'kg', 12000);

-- ============================================================
-- W1. Savdoni to'lovi bilan bekor qilish
-- ============================================================

-- 1. Ali: 100 000 savdo, savdo bilan to'liq to'langan (post_sale p_paid) -> qarz 0
INSERT INTO t VALUES ('s1', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000d1', 'op-s1', 'a1310000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"Shakar","qty_milli":"10000","unit":"kg","unit_price":"10000"}]'::jsonb, 100000, now(), 'naqd', 100000));
INSERT INTO t VALUES ('p1', (SELECT id FROM payments WHERE client_op_id = 'sale-pay:op-s1'));
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000c1'), 0::bigint, 'to''langan savdo: qarz 0');

-- 2. ESKI XATTI-HARAKAT (W1 sababi): oddiy reverse_sale to'lovni qoldiradi -> qarz manfiy
INSERT INTO t VALUES ('s0', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000d0', 'op-s0', 'a1310000-0000-0000-0000-0000000000c2', NULL,
  '[{"product_name":"Shakar","qty_milli":"5000","unit":"kg","unit_price":"10000"}]'::jsonb, 50000, now(), 'naqd', 50000));
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's0'), 'rev-s0', 'narx xato');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000c2'), (-50000)::bigint, 'reverse_sale: to''lov qoladi, qarz -50 000 (W1 sababi tasdiqlandi)');

-- 3. Xato holatlar: hech narsa o'zgarmaydi (savdo posted, to'lov faol)
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-x1', 'narx xato', ARRAY[%L]::uuid[])$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1'), (SELECT id FROM payments WHERE client_op_id = 'sale-pay:op-s0')), 'payment_not_linked');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-x2', 'narx xato', ARRAY[%L, %L]::uuid[])$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1'), (SELECT v FROM t WHERE k = 'p1'), (SELECT v FROM t WHERE k = 'p1')), 'invalid_payment_list');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-x3', 'narx xato', ARRAY[gen_random_uuid()])$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1')), 'payment_not_linked');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-x4', 'x', ARRAY[%L]::uuid[])$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1'), (SELECT v FROM t WHERE k = 'p1')), 'reason_required');
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 's1')), 'posted'::text, 'xatoda savdo bekor qilinmadi (atomik)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE payment_id = (SELECT v FROM t WHERE k = 'p1')), 0::bigint, 'xatoda to''lov bekor qilinmadi (atomik)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM document_reversals WHERE client_op_id LIKE 'rev-x%'), 0::bigint, 'xatoda teskari yozuv qolmadi');

-- 4. To'lovlar savdo summasidan oshsa rad etiladi: Ali'ga 30 000 qarz savdo + 30 000 karta to'lov
INSERT INTO t VALUES ('s2', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000d2', 'op-s2', 'a1310000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"Shakar","qty_milli":"3000","unit":"kg","unit_price":"10000"}]'::jsonb, 30000));
INSERT INTO t VALUES ('p2', record_payment((SELECT v FROM t WHERE k = 'shopA'), gen_random_uuid(), 'op-p2', 'a1310000-0000-0000-0000-0000000000c1', 30000, 'karta', NULL));
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-x5', 'narx xato', ARRAY[%L, %L]::uuid[])$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's2'), (SELECT v FROM t WHERE k = 'p1'), (SELECT v FROM t WHERE k = 'p2')), 'payment_exceeds_sale');

-- 5. TO'G'RI YO'L: savdo va to'lov bitta tranzaksiyada bekor qilinadi -> qarz manfiy bo'lmaydi, ombor qaytadi
INSERT INTO t VALUES ('r1', reverse_sale_with_payments((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1'), 'rev-s1', 'narx xato', ARRAY[(SELECT v FROM t WHERE k = 'p1')]));
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 's1')), 'reversed'::text, 'savdo bekor qilindi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE payment_id = (SELECT v FROM t WHERE k = 'p1')), 1::bigint, 'savdo to''lovi ham bekor qilindi');
SELECT pg_temp.assert_eq((SELECT reason FROM payment_voids WHERE payment_id = (SELECT v FROM t WHERE k = 'p1')), 'savdo bekor qilindi: narx xato'::text, 'to''lov bekor qilish sababi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000c1'), 0::bigint, 'Ali qarzi: 30 000 savdo - 30 000 to''lov = 0 (manfiy emas)');
SELECT pg_temp.assert_eq((SELECT coalesce(sum(qty_milli), 0)::bigint FROM stock_movements WHERE document_id = (SELECT v FROM t WHERE k = 's1')), 0::bigint, 'ombor: savdo va teskari harakat yig''indisi 0');

-- 6. Idempotent: o'sha client_op_id bilan qayta chaqiruv hech narsani takrorlamaydi
SELECT pg_temp.assert_eq(reverse_sale_with_payments((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1'), 'rev-s1', 'narx xato', ARRAY[(SELECT v FROM t WHERE k = 'p1')]), (SELECT v FROM t WHERE k = 'r1'), 'qayta chaqiruv o''sha teskari yozuvni qaytaradi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM document_reversals WHERE document_id = (SELECT v FROM t WHERE k = 's1')), 1::bigint, 'teskari yozuv bitta');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE payment_id = (SELECT v FROM t WHERE k = 'p1')), 1::bigint, 'to''lov bekor qilish bitta');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-s1-b', 'narx xato', NULL)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1')), 'already_reversed');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-x6', 'narx xato', ARRAY[%L]::uuid[])$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's2'), (SELECT v FROM t WHERE k = 'p1')), 'payment_not_linked');

-- 7. To'lovsiz chaqiruv (NULL / bo'sh) = oddiy reverse_sale
SELECT reverse_sale_with_payments((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's2'), 'rev-s2', 'mijoz qaytardi', ARRAY[]::uuid[]);
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 's2')), 'reversed'::text, 'bo''sh ro''yxat: faqat savdo bekor qilindi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE payment_id = (SELECT v FROM t WHERE k = 'p2')), 0::bigint, 'tanlanmagan to''lov faol qoladi');

-- 8. Mijozsiz savdoga to'lov biriktirib bo'lmaydi
INSERT INTO t VALUES ('s3', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000d3', 'op-s3', NULL, NULL,
  '[{"product_name":"Shakar","qty_milli":"1000","unit":"kg","unit_price":"10000"}]'::jsonb, 10000));
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-x7', 'narx xato', ARRAY[%L]::uuid[])$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's3'), (SELECT v FROM t WHERE k = 'p2')), 'payment_not_linked');

-- 9. Bir martalik mijoz: to'lov reverse_sale ichida avtomatik bekor qilinadi; aniq id berilsa ham bir marta
INSERT INTO t VALUES ('walkin', ensure_walkin_customer((SELECT v FROM t WHERE k = 'shopA')));
INSERT INTO t VALUES ('s4', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000d4', 'op-s4', (SELECT v FROM t WHERE k = 'walkin'), NULL,
  '[{"product_name":"Shakar","qty_milli":"2000","unit":"kg","unit_price":"10000"}]'::jsonb, 20000, now(), 'naqd', 20000));
SELECT reverse_sale_with_payments((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's4'), 'rev-s4', 'mijoz qaytardi', ARRAY[(SELECT id FROM payments WHERE client_op_id = 'sale-pay:op-s4')]);
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids v JOIN payments p ON p.id = v.payment_id WHERE p.client_op_id = 'sale-pay:op-s4'), 1::bigint, 'bir martalik mijoz to''lovi bir marta bekor qilindi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkin')), 0::bigint, 'bir martalik mijoz qarzi 0');

-- 10. Begona do'kon, OAuth
SELECT pg_temp.as_user('b1310000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-b', 'narx xato', NULL)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's3')), 'permission|not_member|forbidden');
SELECT pg_temp.as_oauth('a1310000-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale_with_payments(%L, %L, 'rev-o', 'narx xato', NULL)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's3')), 'oauth_client_forbidden');
SELECT pg_temp.as_user('a1310000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 's3')), 'posted'::text, 'begona/OAuth chaqiruvi savdoga tegmadi');

-- ============================================================
-- W2. Ta'minotchiga tovarsiz qarz yozuvi (bir nechta bo'lishi mumkin)
-- ============================================================

-- 11. Ochilish qoldig'i bor ta'minotchiga ikki marta qarz yozuvi
SELECT post_supplier_opening_balance((SELECT v FROM t WHERE k = 'shopA'), gen_random_uuid(), 'open-1', 'a1310000-0000-0000-0000-0000000000a1', 500000);
-- ESKI XATTI-HARAKAT (W2 sababi): ikkinchi ochilish qoldig'i rad etiladi
SELECT pg_temp.expect_error(format($$SELECT post_supplier_opening_balance(%L, gen_random_uuid(), 'open-2', 'a1310000-0000-0000-0000-0000000000a1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'opening_balance_exists');
INSERT INTO t VALUES ('q1', post_supplier_debt((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000e1', 'debt-1', 'a1310000-0000-0000-0000-0000000000a1', 200000));
INSERT INTO t VALUES ('q2', post_supplier_debt((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000e2', 'debt-2', 'a1310000-0000-0000-0000-0000000000a1', 300000));
SELECT pg_temp.assert_eq((SELECT kind || ':' || status || ':' || subtotal FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'q2')), 'debt:posted:300000'::text, 'qarz yozuvi hujjati');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000a1'), 1000000::bigint, '500 000 + 200 000 + 300 000');
SELECT pg_temp.assert_eq((SELECT balance FROM partner_statement((SELECT v FROM t WHERE k = 'shopA'), 'supplier', 'a1310000-0000-0000-0000-0000000000a1', DATE '2000-01-01', DATE '2100-01-01')), 1000000::bigint, 'ikkinchi yo''l (partner_statement) = supplier_outstanding');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements WHERE document_id IN ((SELECT v FROM t WHERE k = 'q1'), (SELECT v FROM t WHERE k = 'q2'))), 0::bigint, 'qarz yozuvi ombor harakati yaratmaydi');

-- 12. Idempotent
SELECT pg_temp.assert_eq(post_supplier_debt((SELECT v FROM t WHERE k = 'shopA'), gen_random_uuid(), 'debt-1', 'a1310000-0000-0000-0000-0000000000a1', 999), (SELECT v FROM t WHERE k = 'q1'), 'qayta yuborish o''sha yozuvni qaytaradi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000a1'), 1000000::bigint, 'qayta yuborish qarzni ikki marta qo''shmaydi');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_debt(%L, %L, 'debt-3', 'a1310000-0000-0000-0000-0000000000a1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'q1')), 'id_conflict');

-- 13. To'lov va bekor qilish (mavjud RPC'lar)
SELECT record_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), gen_random_uuid(), 'sp-1', 'a1310000-0000-0000-0000-0000000000a1', 400000, 'naqd', NULL);
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000a1'), 600000::bigint, 'to''lovdan keyin 600 000');
SELECT reverse_purchase((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'q2'), 'rev-q2', 'xato yozilgan');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1310000-0000-0000-0000-0000000000a1'), 300000::bigint, 'qarz yozuvi bekor qilinsa qarz kamayadi');

-- 14. Noto'g'ri qiymatlar, begona do'kon, OAuth, to'g'ridan-to'g'ri yozish, anon
SELECT pg_temp.expect_error(format($$SELECT post_supplier_debt(%L, gen_random_uuid(), 'debt-z', 'a1310000-0000-0000-0000-0000000000a1', 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_amount');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_debt(%L, gen_random_uuid(), 'debt-n', 'a1310000-0000-0000-0000-0000000000a1', -5)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_amount');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_debt(%L, gen_random_uuid(), 'debt-x', 'b1310000-0000-0000-0000-0000000000a1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'supplier_not_in_shop');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_debt(%L, gen_random_uuid(), 'debt-d', 'a1310000-0000-0000-0000-0000000000a1', 1000, DATE '1999-12-31')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_date');
SELECT pg_temp.as_user('b1310000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_debt(%L, gen_random_uuid(), 'debt-b', 'a1310000-0000-0000-0000-0000000000a1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission|not_member|forbidden');
SELECT pg_temp.as_oauth('a1310000-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_debt(%L, gen_random_uuid(), 'debt-o', 'a1310000-0000-0000-0000-0000000000a1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.as_user('a1310000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error(format($$INSERT INTO purchase_documents (shop_id, supplier_id, status, kind, subtotal, client_op_id, created_by) VALUES (%L, 'a1310000-0000-0000-0000-0000000000a1', 'posted', 'debt', 999, 'direct', auth.uid())$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied');
RESET ROLE;
SELECT pg_temp.expect_error($$INSERT INTO purchase_documents (shop_id, supplier_id, status, kind, subtotal, client_op_id, created_by) SELECT d.shop_id, d.supplier_id, 'posted', 'boshqa', 1, 'bad-kind', d.created_by FROM purchase_documents d LIMIT 1$$, 'purchase_documents_kind_check');
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT post_supplier_debt(gen_random_uuid(), gen_random_uuid(), 'x', gen_random_uuid(), 1)$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT reverse_sale_with_payments(gen_random_uuid(), gen_random_uuid(), 'x', 'abc', NULL)$$, 'permission denied');
RESET ROLE;

\echo '=== BARCHA 90_reversal_payments_supplier_debt TESTLARI O''TDI ==='
