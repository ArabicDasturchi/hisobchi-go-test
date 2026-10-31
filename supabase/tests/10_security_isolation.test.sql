-- ============================================================
-- Xavfsizlik va do'konlar izolyatsiyasi testlari (001 + 003 qo'llangandan keyin).
-- Har bir test xato bo'lsa — EXCEPTION, psql ON_ERROR_STOP bilan to'xtaydi.
-- ============================================================
\set ON_ERROR_STOP 1

-- Yordamchilar (superuser sifatida yaratiladi, SECURITY INVOKER — chaqiruvchi roli bilan ishlaydi)
CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
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

-- Ikki foydalanuvchi
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SET ROLE authenticated;

-- 0. Tizimga kirmagan foydalanuvchi do'kon yarata olmaydi
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error($$SELECT create_shop('Begona')$$, 'not_authenticated');

-- 1. Har bir foydalanuvchi o'z do'konini yaratadi (va egasi bo'ladi)
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.assert_eq((SELECT create_shop('Yana A')), (SELECT v FROM t WHERE k = 'shopA'), 'create_shop takroriy — o''sha do''kon');
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));

-- 2. S1 regressiyasi: B o'zini A do'koniga a'zo qila olmaydi
SELECT pg_temp.expect_error(
  format($$INSERT INTO shop_members (shop_id, user_id, role) VALUES (%L, 'bbbbbbbb-0000-0000-0000-000000000002', 'owner')$$,
         (SELECT v FROM t WHERE k = 'shopA')),
  'permission denied|row-level security');
SELECT pg_temp.assert_eq((SELECT count(*) FROM shops), 1::bigint, 'B faqat o''z do''konini ko''radi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM shop_members), 1::bigint, 'B faqat o''z a''zoligini ko''radi');

-- 3. S3: to'g'ridan-to'g'ri do'kon yaratish yopiq
SELECT pg_temp.expect_error($$INSERT INTO shops (name) VALUES ('Soxta')$$, 'permission denied|row-level security');

-- 4. A mijoz qo'shadi; B A do'koniga mijoz qo'sha olmaydi
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO customers (id, shop_id, name) VALUES ('cccccccc-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Akmal');
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(
  format($$INSERT INTO customers (shop_id, name) VALUES (%L, 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')),
  'row-level security');
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers), 0::bigint, 'B A ning mijozlarini ko''rmaydi');
-- B A mijozini o'zgartira/o'chira olmaydi (RLS — 0 qator)
UPDATE customers SET name = 'buzildi' WHERE id = 'cccccccc-0000-0000-0000-000000000001';
DELETE FROM customers WHERE id = 'cccccccc-0000-0000-0000-000000000001';

-- 5. S2: moliyaviy jadvallarga to'g'ridan-to'g'ri yozish yopiq
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT name FROM customers WHERE id = 'cccccccc-0000-0000-0000-000000000001'), 'Akmal'::text, 'A mijozi B tomonidan o''zgarmagan');
SELECT pg_temp.expect_error(
  format($$INSERT INTO documents (shop_id, status, subtotal, created_by) VALUES (%L, 'posted', 999, auth.uid())$$, (SELECT v FROM t WHERE k = 'shopA')),
  'permission denied');
SELECT pg_temp.expect_error(
  format($$INSERT INTO ledger_entries (shop_id, document_id, entry_type, amount, created_by) VALUES (%L, gen_random_uuid(), 'sale', 1, auth.uid())$$, (SELECT v FROM t WHERE k = 'shopA')),
  'permission denied');
SELECT pg_temp.expect_error(
  format($$INSERT INTO payments (id, shop_id, client_op_id, customer_id, amount, method, created_by) VALUES (gen_random_uuid(), %L, 'x', 'cccccccc-0000-0000-0000-000000000001', 1, 'naqd', auth.uid())$$, (SELECT v FROM t WHERE k = 'shopA')),
  'permission denied');

-- 6. post_sale: 385 000 so'm, server qayta hisoblaydi, idempotent
INSERT INTO t VALUES ('sale1', post_sale(
  (SELECT v FROM t WHERE k = 'shopA'), 'dddddddd-0000-0000-0000-000000000001', 'op-1', 'cccccccc-0000-0000-0000-000000000001', 'matn',
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"},
    {"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},
    {"product_name":"momiq","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000));
SELECT pg_temp.assert_eq((SELECT subtotal FROM documents WHERE id = (SELECT v FROM t WHERE k = 'sale1')), 385000::bigint, 'post_sale jami 385000');
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 'sale1')), 'posted'::text, 'holat posted');
SELECT pg_temp.assert_eq(post_sale((SELECT v FROM t WHERE k = 'shopA'), 'dddddddd-0000-0000-0000-000000000099', 'op-1', NULL, NULL,
  '[{"product_name":"x","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1), (SELECT v FROM t WHERE k = 'sale1'), 'takroriy client_op_id — o''sha savdo');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 1::bigint, 'takroriy so''rov ikkinchi savdo yaratmadi');

-- 7. Klient jami noto'g'ri — hech narsa saqlanmaydi
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, 'dddddddd-0000-0000-0000-000000000002', 'op-2', NULL, NULL,
  '[{"product_name":"non","qty_milli":"3000","unit":"dona","unit_price":"4000"}]'::jsonb, 12001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'calc_mismatch');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 1::bigint, 'mos kelmaslikda hujjat qolmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM document_lines WHERE document_id = 'dddddddd-0000-0000-0000-000000000002'), 0::bigint, 'mos kelmaslikda qatorlar qolmadi');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'op-3', NULL, NULL,
  '[{"product_name":"non","qty_milli":"-1","unit":"dona","unit_price":"4000"}]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_qty');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'op-4', NULL, NULL, '[]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'empty_document');

-- 8. B: A do'koniga savdo, A mijozi bilan savdo, A savdosi ID'sini egallash — taqiqlangan
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'b-1', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'b-2', 'cccccccc-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopB')), 'customer_not_in_shop');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, 'dddddddd-0000-0000-0000-000000000001', 'b-3', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopB')), 'id_conflict');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 0::bigint, 'B A savdolarini ko''rmaydi');
SELECT pg_temp.expect_error(format($$SELECT record_payment(%L, gen_random_uuid(), 'bp', 'cccccccc-0000-0000-0000-000000000001', 1, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale(%L, 'dddddddd-0000-0000-0000-000000000001', 'br', 'hujum qilish')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');

-- 9. To'lov: qarzdan oshmaydi, idempotent, bekor qilish bir marta
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO t VALUES ('pay1', record_payment((SELECT v FROM t WHERE k = 'shopA'), 'eeeeeeee-0000-0000-0000-000000000001', 'p-1',
  'cccccccc-0000-0000-0000-000000000001', 100000, 'naqd', 'birinchi'));
SELECT pg_temp.assert_eq(record_payment((SELECT v FROM t WHERE k = 'shopA'), 'eeeeeeee-0000-0000-0000-000000000009', 'p-1',
  'cccccccc-0000-0000-0000-000000000001', 100000, 'naqd', NULL), (SELECT v FROM t WHERE k = 'pay1'), 'to''lov idempotent');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'cccccccc-0000-0000-0000-000000000001'), 285000::bigint, 'qarz 385000 − 100000');
SELECT pg_temp.expect_error(format($$SELECT record_payment(%L, gen_random_uuid(), 'p-2', 'cccccccc-0000-0000-0000-000000000001', 285001, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_exceeds_debt');
SELECT pg_temp.expect_error(format($$SELECT record_payment(%L, gen_random_uuid(), 'p-3', 'cccccccc-0000-0000-0000-000000000001', 0, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_amount');
SELECT void_payment((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pay1'), 'xato summa');
SELECT void_payment((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pay1'), 'xato summa');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payment_voids), 1::bigint, 'to''lov bir marta bekor qilinadi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'cccccccc-0000-0000-0000-000000000001'), 385000::bigint, 'bekor qilingan to''lov qarzga qaytdi');

-- 10. Savdoni bekor qilish: bir marta, audit izi bilan
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1'), 'r-1', 'mol qaytarildi');
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1'), 'r-1', 'mol qaytarildi');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale(%L, %L, 'r-2', 'yana bir bor')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1')), 'already_reversed');
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 'sale1')), 'reversed'::text, 'holat reversed');
SELECT pg_temp.assert_eq((SELECT count(*) FROM document_lines WHERE document_id = (SELECT v FROM t WHERE k = 'sale1')), 3::bigint, 'asl qatorlar saqlangan');
SELECT pg_temp.assert_eq((SELECT sum(amount) FROM ledger_entries)::bigint, 0::bigint, 'ledger: savdo + qarama-qarshi yozuv = 0');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'cccccccc-0000-0000-0000-000000000001'), 0::bigint, 'bekor qilingandan keyin qarz 0');

-- 11. Anonim foydalanuvchi hech narsani o'qiy olmaydi
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT count(*) FROM customers$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT create_shop('anon')$$, 'permission denied');

-- 12. Append-only: superuser ham audit izini o'zgartira olmaydi (trigger)
RESET ROLE;
SELECT pg_temp.expect_error($$UPDATE payments SET amount = 1$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM document_reversals$$, 'append-only');
SELECT pg_temp.expect_error($$UPDATE document_lines SET unit_price = 1$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM ledger_entries$$, 'ledger|append|o''zgartirib|taqiqlangan');

\echo '=== BARCHA XAVFSIZLIK TESTLARI MUVAFFAQIYATLI ==='
