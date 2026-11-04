-- Hamkorlar, tan/sotuv narxi, ombor harakatlari, bir martalik mijoz (001..006 qo'llangandan keyin).
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


-- ---------- Tayyorgarlik ----------
SELECT pg_temp.as_user('a4a4a4a4-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b4b4b4b4-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
SELECT pg_temp.as_user('a4a4a4a4-0000-0000-0000-000000000001');
INSERT INTO customers (id, shop_id, name) VALUES ('c4c4c4c4-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Karim');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f4f4f4f4-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Chirmoq', 'dona', 13000);
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f4f4f4f4-0000-0000-0000-000000000002', (SELECT v FROM t WHERE k = 'shopA'), 'Yurak', 'dona', 15000);
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f4f4f4f4-0000-0000-0000-000000000003', (SELECT v FROM t WHERE k = 'shopA'), 'Momiq', 'dona', 9000);

-- ---------- 1. Eski ma'lumot buzilmaydi; narx ustunlari sinxron ----------
SELECT pg_temp.assert_eq((SELECT kind FROM customers WHERE id = 'c4c4c4c4-0000-0000-0000-000000000001'), 'regular'::text, 'mavjud mijoz turi regular');
SELECT pg_temp.assert_eq((SELECT sale_price FROM products WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001'), 13000::bigint, 'last_price yozilsa sale_price ham (INSERT)');
UPDATE products SET last_price = 13500 WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT sale_price FROM products WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001'), 13500::bigint, 'last_price o''zgarsa sale_price ergashadi');
UPDATE products SET sale_price = 13000 WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT last_price FROM products WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001'), 13000::bigint, 'sale_price o''zgarsa last_price ergashadi');
UPDATE products SET cost_price = 11000 WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT sale_price FROM products WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001'), 13000::bigint, 'tan narx sotuv narxiga tegmaydi');
SELECT pg_temp.expect_error($$UPDATE products SET cost_price = -1 WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001'$$, 'check constraint|cost_price');

-- ---------- 2. Ta'minotchilar: do'kon izolyatsiyasi, OAuth yopiq ----------
INSERT INTO suppliers (id, shop_id, name) VALUES ('a5a5a5a5-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Rahim aka');
SELECT pg_temp.assert_eq((SELECT count(*) FROM suppliers), 1::bigint, 'A o''z ta''minotchisini ko''radi');
SELECT pg_temp.as_user('b4b4b4b4-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq((SELECT count(*) FROM suppliers), 0::bigint, 'B A ning ta''minotchisini ko''rmaydi');
SELECT pg_temp.expect_error(format($$INSERT INTO suppliers (shop_id, name) VALUES (%L, 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'row-level security');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE suppliers SET name = 'buzildi'$$), 0::bigint, 'B ta''minotchini o''zgartira olmaydi');
SELECT pg_temp.as_oauth('a4a4a4a4-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.assert_eq((SELECT count(*) FROM suppliers), 0::bigint, 'OAuth ta''minotchilar jadvalini o''qiy olmaydi');
SELECT pg_temp.expect_error(format($$INSERT INTO suppliers (shop_id, name) VALUES (%L, 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'row-level security');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements), 0::bigint, 'OAuth ombor harakatlarini o''qiy olmaydi');
SELECT pg_temp.expect_error(format($$SELECT adjust_stock(%L, 'f4f4f4f4-0000-0000-0000-000000000001', 'adj-oauth', 5000, 'hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT ensure_walkin_customer(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');

-- ---------- 3. Bir martalik mijoz ----------
SELECT pg_temp.as_user('a4a4a4a4-0000-0000-0000-000000000001');
INSERT INTO t VALUES ('walkA', ensure_walkin_customer((SELECT v FROM t WHERE k = 'shopA')));
SELECT pg_temp.assert_eq(ensure_walkin_customer((SELECT v FROM t WHERE k = 'shopA')), (SELECT v FROM t WHERE k = 'walkA'), 'ensure_walkin_customer idempotent');
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers WHERE kind = 'one_time'), 1::bigint, 'do''konda bitta bir martalik mijoz');
SELECT pg_temp.expect_error(format($$INSERT INTO customers (shop_id, name, kind) VALUES (%L, 'Yana', 'one_time')$$, (SELECT v FROM t WHERE k = 'shopA')), 'duplicate key|ux_customers_one_time');
SELECT pg_temp.as_user('b4b4b4b4-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT ensure_walkin_customer(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
INSERT INTO t VALUES ('walkB', ensure_walkin_customer((SELECT v FROM t WHERE k = 'shopB')));
SELECT pg_temp.assert_eq((SELECT v FROM t WHERE k = 'walkB') <> (SELECT v FROM t WHERE k = 'walkA'), true, 'har do''konning o''z bir martalik mijozi');
SELECT pg_temp.as_oauth('a4a4a4a4-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_customers((SELECT v FROM t WHERE k = 'shopA'))), 1::bigint, 'agent ro''yxatida bir martalik mijoz yo''q (faqat Karim)');

-- ---------- 4. post_sale v2: eski chaqiruv (8 argument) ishlaydi, 385 000 ----------
SELECT pg_temp.as_user('a4a4a4a4-0000-0000-0000-000000000001');
INSERT INTO t VALUES ('sale1', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd4d4d4d4-0000-0000-0000-000000000001', 'op-1', 'c4c4c4c4-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"},
    {"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},
    {"product_name":"momiq","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000));
SELECT pg_temp.assert_eq((SELECT subtotal FROM documents WHERE id = (SELECT v FROM t WHERE k = 'sale1')), 385000::bigint, 'savdo jami 385000');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c4c4c4c4-0000-0000-0000-000000000001'), 385000::bigint, 'doimiy mijoz qarzga oldi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM document_lines WHERE document_id = (SELECT v FROM t WHERE k = 'sale1') AND product_id IS NOT NULL), 3::bigint, 'qatorlar tovarga nom bo''yicha bog''landi');
SELECT pg_temp.assert_eq((SELECT unit_cost FROM document_lines WHERE document_id = (SELECT v FROM t WHERE k = 'sale1') AND product_name = 'chirmoq'), 11000::bigint, 'savdo paytidagi tan narx snapshot');
SELECT pg_temp.assert_eq((SELECT unit_cost FROM document_lines WHERE document_id = (SELECT v FROM t WHERE k = 'sale1') AND product_name = 'yurak'), NULL::bigint, 'tan narx noma''lum tovarda NULL');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f4f4f4f4-0000-0000-0000-000000000001'), -10000::bigint, 'kirimsiz savdo: qoldiq manfiy (ruxsat)');
-- Foyda: 10 x 13 000 sotuv, 10 x 11 000 tan = 20 000 (hisob: qator summasi - tan narx summasi, bir xil yaxlitlash)
SELECT pg_temp.assert_eq((SELECT sum(line_total - calculate_line_total(qty_milli, unit_cost))::bigint FROM document_lines WHERE document_id = (SELECT v FROM t WHERE k = 'sale1') AND unit_cost IS NOT NULL), 20000::bigint, 'foyda 20 000');
-- Tan narx o'zgarsa eski savdo snapshot'i o'zgarmaydi
UPDATE products SET cost_price = 12000 WHERE id = 'f4f4f4f4-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT unit_cost FROM document_lines WHERE document_id = (SELECT v FROM t WHERE k = 'sale1') AND product_name = 'chirmoq'), 11000::bigint, 'eski savdo tan narxi o''zgarmaydi');

-- Birlik mos kelmasa: tovarga bog'lanmaydi, ombor harakati yo'q
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd4d4d4d4-0000-0000-0000-000000000002', 'op-2', 'c4c4c4c4-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"chirmoq","qty_milli":"1500","unit":"kg","unit_price":"1000"}]'::jsonb, 1500);
SELECT pg_temp.assert_eq((SELECT product_id IS NULL FROM document_lines WHERE document_id = 'd4d4d4d4-0000-0000-0000-000000000002'), true, 'birlik mos kelmasa tovarga bog''lanmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements WHERE document_id = 'd4d4d4d4-0000-0000-0000-000000000002'), 0::bigint, 'bog''lanmagan qatorda ombor harakati yo''q');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'op-3', 'c4c4c4c4-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"non","qty_milli":"3000","unit":"dona","unit_price":"4000"}]'::jsonb, 12001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'calc_mismatch');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements), 3::bigint, 'xato savdo ombor harakati qoldirmadi');

-- ---------- 5. Bir martalik savdo qarz yaratmaydi ----------
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'w-1', %L, NULL,
  '[{"product_name":"momiq","qty_milli":"1000","unit":"dona","unit_price":"9000"}]'::jsonb, 9000)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkA')), 'walkin_requires_full_payment');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'w-2', %L, NULL,
  '[{"product_name":"momiq","qty_milli":"1000","unit":"dona","unit_price":"9000"}]'::jsonb, 9000, now(), 'naqd', 5000)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkA')), 'walkin_requires_full_payment');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents WHERE client_op_id IN ('w-1', 'w-2')), 0::bigint, 'rad etilgan bir martalik savdo yozilmadi');
INSERT INTO t VALUES ('walkSale', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd4d4d4d4-0000-0000-0000-000000000009', 'w-3', (SELECT v FROM t WHERE k = 'walkA'), NULL,
  '[{"product_name":"momiq","qty_milli":"1000","unit":"dona","unit_price":"9000"}]'::jsonb, 9000, now(), 'karta', 9000));
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkA')), 0::bigint, 'bir martalik savdo qarz yaratmadi');
SELECT pg_temp.assert_eq((SELECT amount || ':' || method FROM payments WHERE client_op_id = 'sale-pay:w-3'), '9000:karta'::text, 'savdo bilan to''lov yozildi');
SELECT pg_temp.assert_eq(post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd4d4d4d4-0000-0000-0000-000000000099', 'w-3', (SELECT v FROM t WHERE k = 'walkA'), NULL,
  '[{"product_name":"momiq","qty_milli":"1000","unit":"dona","unit_price":"9000"}]'::jsonb, 9000, now(), 'karta', 9000), (SELECT v FROM t WHERE k = 'walkSale'), 'takror (client_op_id) ikkinchi savdo/to''lov yaratmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments WHERE client_op_id = 'sale-pay:w-3'), 1::bigint, 'takror ikkinchi to''lov yaratmadi');

-- Doimiy mijoz: savdo bilan qisman to'lov
INSERT INTO t VALUES ('partSale', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd4d4d4d4-0000-0000-0000-000000000010', 'p-1', 'c4c4c4c4-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"yurak","qty_milli":"2000","unit":"dona","unit_price":"15000"}]'::jsonb, 30000, now(), 'naqd', 10000));
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c4c4c4c4-0000-0000-0000-000000000001'), 385000::bigint + 1500 + 20000, 'qisman to''lov: qarz = oldingi + 30000 - 10000');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'p-2', 'c4c4c4c4-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"yurak","qty_milli":"1000","unit":"dona","unit_price":"15000"}]'::jsonb, 15000, now(), 'naqd', 15001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_exceeds_debt');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'p-3', NULL, NULL,
  '[{"product_name":"yurak","qty_milli":"1000","unit":"dona","unit_price":"15000"}]'::jsonb, 15000, now(), 'naqd', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_requires_customer');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'p-4', 'c4c4c4c4-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"yurak","qty_milli":"1000","unit":"dona","unit_price":"15000"}]'::jsonb, 15000, now(), 'bitkoin', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_method');

-- ---------- 6. reverse_sale v2: ombor va bir martalik to'lov qaytadi ----------
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f4f4f4f4-0000-0000-0000-000000000003'), -21000::bigint, 'Momiq qoldig''i: -20 -1');
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkSale'), 'r-w-1', 'mol qaytarildi');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f4f4f4f4-0000-0000-0000-000000000003'), -20000::bigint, 'bekor qilingan savdo qoldiqni qaytardi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids WHERE reason LIKE 'savdo bekor qilindi%'), 1::bigint, 'bir martalik avto-to''lov bekor qilindi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkA')), 0::bigint, 'bir martalik mijoz hisobi 0 qoldi');
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'walkSale'), 'r-w-1', 'mol qaytarildi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements WHERE document_id = (SELECT v FROM t WHERE k = 'walkSale')), 2::bigint, 'takror bekor qilish ikkinchi teskari harakat yaratmadi');
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1'), 'r-1', 'xato kiritilgan');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f4f4f4f4-0000-0000-0000-000000000001'), 0::bigint, 'Chirmoq qoldig''i: savdo + teskari = 0');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments WHERE customer_id = 'c4c4c4c4-0000-0000-0000-000000000001' AND client_op_id = 'sale-pay:p-1'), 1::bigint, 'doimiy mijozning qisman to''lovi bekor qilinmaydi');

-- ---------- 7. adjust_stock ----------
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f4f4f4f4-0000-0000-0000-000000000002'), -2000::bigint, 'Yurak qoldig''i: -5 +5 (bekor) -2');
SELECT adjust_stock((SELECT v FROM t WHERE k = 'shopA'), 'f4f4f4f4-0000-0000-0000-000000000002', 'adj-1', 50000, 'inventarizatsiya');
SELECT adjust_stock((SELECT v FROM t WHERE k = 'shopA'), 'f4f4f4f4-0000-0000-0000-000000000002', 'adj-1', 50000, 'inventarizatsiya');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f4f4f4f4-0000-0000-0000-000000000002'), 48000::bigint, 'tuzatish +50 bir marta (idempotent)');
SELECT adjust_stock((SELECT v FROM t WHERE k = 'shopA'), 'f4f4f4f4-0000-0000-0000-000000000002', 'adj-2', -3000, 'sinib qoldi');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f4f4f4f4-0000-0000-0000-000000000002'), 45000::bigint, 'tuzatish -3');
SELECT pg_temp.expect_error(format($$SELECT adjust_stock(%L, 'f4f4f4f4-0000-0000-0000-000000000002', 'adj-3', 0, 'nol')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_qty');
SELECT pg_temp.expect_error(format($$SELECT adjust_stock(%L, 'f4f4f4f4-0000-0000-0000-000000000002', 'adj-4', 1000, 'ab')$$, (SELECT v FROM t WHERE k = 'shopA')), 'reason_required');
SELECT pg_temp.as_user('b4b4b4b4-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT adjust_stock(%L, 'f4f4f4f4-0000-0000-0000-000000000002', 'adj-b', 1000, 'hujum qilish')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.assert_eq((SELECT count(*) FROM product_stock), 0::bigint, 'B A ning qoldig''ini ko''rmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements), 0::bigint, 'B A ning harakatlarini ko''rmaydi');
SELECT pg_temp.as_user('a4a4a4a4-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error($$INSERT INTO stock_movements (shop_id, product_id, kind, qty_milli, created_by) VALUES (gen_random_uuid(), gen_random_uuid(), 'adjustment', 1, auth.uid())$$, 'permission denied');
RESET ROLE;
SELECT pg_temp.expect_error($$UPDATE stock_movements SET qty_milli = 1$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM stock_movements$$, 'append-only');
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT * FROM suppliers$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT * FROM product_stock$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT ensure_walkin_customer(gen_random_uuid())$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT adjust_stock(gen_random_uuid(), gen_random_uuid(), 'x', 1, 'abc')$$, 'permission denied');
RESET ROLE;

\echo '=== HAMKOR VA OMBOR TESTLARI MUVAFFAQIYATLI ==='
