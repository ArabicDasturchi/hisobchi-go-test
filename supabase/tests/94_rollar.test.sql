-- 019: rollar — sotuvchi (member) bekor qila olmaydi va ombor tuzata olmaydi; owner/admin mumkin. 001..013 + 019 (015–018 ixtiyoriy).
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

-- ---------- Tayyorgarlik: egasi, administrator va sotuvchi ----------
SELECT pg_temp.as_user('a1800000-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shop', create_shop('Rollar do''koni'));
RESET ROLE;
INSERT INTO shop_members (shop_id, user_id, role) VALUES
  ((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000ad', 'admin'),
  ((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000ee', 'member');
SET ROLE authenticated;
INSERT INTO customers (id, shop_id, name) VALUES ('a1800000-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shop'), 'Ali');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a1800000-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shop'), 'Rahim aka');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('a1800000-0000-0000-0000-0000000000f1', (SELECT v FROM t WHERE k = 'shop'), 'Chirmoq', 'dona', 13000);

-- ============================================================
-- 1. Sotuvchi (member): savdo, to'lov, kirim — mumkin
-- ============================================================
SELECT pg_temp.as_user('a1800000-0000-0000-0000-0000000000ee');
SELECT pg_temp.assert_eq(shop_role((SELECT v FROM t WHERE k = 'shop')), 'member', 'sotuvchi roli');
INSERT INTO t VALUES ('s1', post_sale((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000d1', 'op-s1', 'a1800000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"Chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"}]'::jsonb, 130000));
INSERT INTO t VALUES ('pay1', record_payment((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000e1', 'op-pay1', 'a1800000-0000-0000-0000-0000000000c1', 30000, 'naqd', NULL));
INSERT INTO t VALUES ('pur1', post_purchase((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000b1', 'op-pur1', 'a1800000-0000-0000-0000-0000000000a1', current_date,
  '[{"product_id":"a1800000-0000-0000-0000-0000000000f1","qty_milli":"5000","unit_cost":"10000"}]'::jsonb, 50000));
INSERT INTO t VALUES ('sp1', record_supplier_payment((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000e2', 'op-sp1', 'a1800000-0000-0000-0000-0000000000a1', 20000, 'naqd', NULL));
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM documents WHERE id = (SELECT v FROM t WHERE k = 's1')), 1, 'sotuvchi savdo yozdi');

-- ============================================================
-- 2. Sotuvchi: bekor qilish va ombor tuzatish — rad, hech narsa yozilmaydi
-- ============================================================
SELECT pg_temp.expect_error(format($$SELECT reverse_sale(%L, %L, 'rev-m', 'sotuvchi bekor')$$, (SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 's1')), 'role_forbidden');
SELECT pg_temp.expect_error(format($$SELECT void_payment(%L, %L, 'sotuvchi bekor')$$, (SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 'pay1')), 'role_forbidden');
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase(%L, %L, 'revp-m', 'sotuvchi bekor')$$, (SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 'pur1')), 'role_forbidden');
SELECT pg_temp.expect_error(format($$SELECT void_supplier_payment(%L, %L, 'sotuvchi bekor')$$, (SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 'sp1')), 'role_forbidden');
SELECT pg_temp.expect_error(format($$SELECT adjust_stock(%L, 'a1800000-0000-0000-0000-0000000000f1', 'adj-m', -1000, 'sotuvchi tuzatish')$$, (SELECT v FROM t WHERE k = 'shop')), 'role_forbidden');
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 's1')), 'posted', 'savdo bekor qilinmadi');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM payment_voids), 0, 'to''lov bekor qilinmadi');
SELECT pg_temp.assert_eq((SELECT status FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'pur1')), 'posted', 'kirim bekor qilinmadi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000c1'), 100000::bigint, 'qarz o''zgarmadi (130 000 − 30 000)');
-- Sotuvchi o'z rolini ko'tara olmaydi
SELECT pg_temp.expect_error($$UPDATE shop_members SET role = 'owner' WHERE user_id = 'a1800000-0000-0000-0000-0000000000ee'$$, 'permission denied|row-level security|0 rows');
SELECT pg_temp.expect_error(format($$INSERT INTO shop_members (shop_id, user_id, role) VALUES (%L, 'a1800000-0000-0000-0000-0000000000ee', 'owner')$$, (SELECT v FROM t WHERE k = 'shop')), 'permission denied|row-level security|duplicate');
SELECT pg_temp.assert_eq(shop_role((SELECT v FROM t WHERE k = 'shop')), 'member', 'rol o''zgarmadi');

-- ============================================================
-- 3. Administrator va egasi: bekor qilish va tuzatish — mumkin
-- ============================================================
SELECT pg_temp.as_user('a1800000-0000-0000-0000-0000000000ad');
SELECT void_payment((SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 'pay1'), 'administrator bekor');
SELECT adjust_stock((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000f1', 'adj-a', 2000, 'inventarizatsiya');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM payment_voids), 1, 'administrator to''lovni bekor qildi');
SELECT pg_temp.as_user('a1800000-0000-0000-0000-000000000001');
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 's1'), 'rev-o', 'egasi bekor qildi');
SELECT reverse_purchase((SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 'pur1'), 'revp-o', 'egasi bekor qildi');
SELECT void_supplier_payment((SELECT v FROM t WHERE k = 'shop'), (SELECT v FROM t WHERE k = 'sp1'), 'egasi bekor qildi');
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 's1')), 'reversed', 'egasi savdoni bekor qildi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shop'), 'a1800000-0000-0000-0000-0000000000c1'), 0::bigint, 'qarz 0');
-- Do'konga a'zo bo'lmagan foydalanuvchi: avvalgidek forbidden (a'zolik tekshiruvi birinchi)
SELECT pg_temp.as_user('b1800000-0000-0000-0000-000000000009');
SELECT pg_temp.expect_error(format($$SELECT adjust_stock(%L, 'a1800000-0000-0000-0000-0000000000f1', 'adj-x', 1000, 'begona')$$, (SELECT v FROM t WHERE k = 'shop')), 'forbidden');

DO $$ BEGIN RAISE NOTICE '=== BARCHA 94_rollar TESTLARI O''TDI ==='; END $$;
