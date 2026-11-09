-- 012: admin_shop_detail.activity — to'lov va qoralama SONLARI. 001..012 qo'llangandan keyin.
\set ON_ERROR_STOP 1

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

CREATE OR REPLACE FUNCTION pg_temp.keys(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(k, ',' ORDER BY k COLLATE "C") FROM jsonb_object_keys(p) k;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE TEMP TABLE t (k text PRIMARY KEY, v uuid);
CREATE TEMP TABLE r (k text PRIMARY KEY, v jsonb);
GRANT ALL ON t, r TO authenticated, anon;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('e4e4e4e4-0000-0000-0000-0000000000ad', 'admin85@example.test', '{}'),
  ('e4e4e4e4-0000-0000-0000-000000000001', 'egasi85@example.test', '{"full_name":"Egasi Sakson"}'),
  ('e4e4e4e4-0000-0000-0000-000000000002', 'egasi85b@example.test', '{}');
INSERT INTO platform_admins (user_id) VALUES ('e4e4e4e4-0000-0000-0000-0000000000ad');

-- ---------- Ma'lumot: A do'koni (2 to'lov, biri bekor; 2 ta'minotchi to'lovi, biri bekor; qoralamalar), B do'koni ----------
SET ROLE authenticated;
SELECT pg_temp.as_user('e4e4e4e4-0000-0000-0000-000000000001');
INSERT INTO t VALUES ('shopA', create_shop('Faoliyat A'));
INSERT INTO customers (id, shop_id, name, phone) VALUES ('e5e5e5e5-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shopA'), 'Maxfiy Mijoz 85', '+998909998877');
INSERT INTO suppliers (id, shop_id, name) VALUES ('e5e5e5e5-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopA'), 'Maxfiy Taminotchi 85');
-- To'lovlar qarzdan oshmasligi uchun: mijozga 1 000 000 qarz (savdo), ta'minotchiga 1 000 000 boshlang'ich qarz
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'e8e8e8e8-0000-0000-0000-000000000001', 'sale-85', 'e5e5e5e5-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"Daftar","qty_milli":"1000","unit":"dona","unit_price":"1000000"}]'::jsonb, 1000000);
SELECT post_supplier_opening_balance((SELECT v FROM t WHERE k = 'shopA'), 'e8e8e8e8-0000-0000-0000-000000000002', 'open-85', 'e5e5e5e5-0000-0000-0000-0000000000a1', 1000000);
SELECT record_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000001', 'bp-1', 'e5e5e5e5-0000-0000-0000-0000000000c1', 111111, 'naqd', 'maxfiy izoh 85');
SELECT record_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000002', 'bp-2', 'e5e5e5e5-0000-0000-0000-0000000000c1', 222222, 'karta', NULL);
SELECT void_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000002', 'xato kiritildi');
SELECT record_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e7e7e7e7-0000-0000-0000-000000000001', 'sp-1', 'e5e5e5e5-0000-0000-0000-0000000000a1', 333333, 'naqd', NULL);
SELECT record_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e7e7e7e7-0000-0000-0000-000000000002', 'sp-2', 'e5e5e5e5-0000-0000-0000-0000000000a1', 444444, 'naqd', NULL);
SELECT void_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e7e7e7e7-0000-0000-0000-000000000002', 'xato kiritildi');
SELECT pg_temp.as_user('e4e4e4e4-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('Faoliyat B'));
RESET ROLE;

-- Qoralamalar (agent yozadi; bu yerda to'g'ridan-to'g'ri, superuser): A da 2 kutayotgan, 1 tasdiqlangan, 1 rad etilgan; B da 1 kutayotgan
INSERT INTO agent_drafts (shop_id, kind, status, total, payload, client_op_id, client_id, created_by) VALUES
  ((SELECT v FROM t WHERE k = 'shopA'), 'sale', 'draft', 7777, '{"raw_input":"maxfiy qoralama matni"}', 'd-1', 'first_party', 'e4e4e4e4-0000-0000-0000-000000000001'),
  ((SELECT v FROM t WHERE k = 'shopA'), 'sale', 'draft', 8888, '{}', 'd-2', 'first_party', 'e4e4e4e4-0000-0000-0000-000000000001'),
  ((SELECT v FROM t WHERE k = 'shopA'), 'sale', 'accepted', 9999, '{}', 'd-3', 'first_party', 'e4e4e4e4-0000-0000-0000-000000000001'),
  ((SELECT v FROM t WHERE k = 'shopA'), 'sale', 'rejected', 1111, '{}', 'd-4', 'first_party', 'e4e4e4e4-0000-0000-0000-000000000001'),
  ((SELECT v FROM t WHERE k = 'shopB'), 'sale', 'draft', 2222, '{}', 'd-5', 'first_party', 'e4e4e4e4-0000-0000-0000-000000000002');

-- ---------- Admin ----------
SET ROLE authenticated;
SELECT pg_temp.as_user('e4e4e4e4-0000-0000-0000-0000000000ad');
INSERT INTO r VALUES ('a', admin_shop_detail((SELECT v FROM t WHERE k = 'shopA')));
INSERT INTO r VALUES ('b', admin_shop_detail((SELECT v FROM t WHERE k = 'shopB')));

SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v -> 'activity' FROM r WHERE k = 'a')), 'drafts_accepted,drafts_pending,payments,supplier_payments', 'activity kalitlari (faqat sonlar)');
SELECT pg_temp.assert_eq((SELECT (v -> 'activity' ->> 'payments')::int FROM r WHERE k = 'a'), 1, 'A: mijoz to''lovlari 1 (bekor qilingani sanalmaydi)');
SELECT pg_temp.assert_eq((SELECT (v -> 'activity' ->> 'supplier_payments')::int FROM r WHERE k = 'a'), 1, 'A: ta''minotchi to''lovlari 1 (bekor qilingani sanalmaydi)');
SELECT pg_temp.assert_eq((SELECT (v -> 'activity' ->> 'drafts_pending')::int FROM r WHERE k = 'a'), 2, 'A: kutayotgan qoralamalar 2');
SELECT pg_temp.assert_eq((SELECT (v -> 'activity' ->> 'drafts_accepted')::int FROM r WHERE k = 'a'), 1, 'A: tasdiqlangan qoralamalar 1 (rad etilgani sanalmaydi)');
SELECT pg_temp.assert_eq((SELECT (v -> 'activity' ->> 'drafts_pending')::int FROM r WHERE k = 'b'), 1, 'B: boshqa do''kon qoralamasi A ga qo''shilmaydi');
SELECT pg_temp.assert_eq((SELECT (v -> 'activity' ->> 'payments')::int FROM r WHERE k = 'b'), 0, 'B: to''lov yo''q = 0');

-- Eski maydonlar o'zgarmagan
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v -> 'counts' FROM r WHERE k = 'a')), 'customers,products,purchases,sales,sales_7d,suppliers', 'eski counts kalitlari o''zgarmagan');
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v FROM r WHERE k = 'a') - 'activity'), 'counts,created_at,daily_sales,id,is_stale,last_activity_at,name,owner_email,owner_name,stage,steps', 'eski yuqori daraja kalitlari o''zgarmagan');
SELECT pg_temp.assert_eq((SELECT (v ->> 'stage')::int FROM r WHERE k = 'a'), 5, 'bosqich o''zgarmagan (savdo bor, 7 kunda 5 dan kam = 5)');

-- Maxfiylik: summa va matn qaytmaydi
SELECT pg_temp.assert_eq((SELECT bool_or(v::text ~* 'Maxfiy|998909998877|izoh 85|111111|222222|333333|444444|1000000|7777|8888|9999|qoralama matni') FROM r), false, 'natijada summa, mijoz, izoh, qoralama mazmuni yo''q');

-- Kirish: admin emas va anon
SELECT pg_temp.as_user('e4e4e4e4-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error(format($$SELECT admin_shop_detail(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'not_platform_admin');
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error(format($$SELECT admin_shop_detail(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'BARCHA 85_admin_shop_activity TESTLARI O''TDI'; END $$;
