-- ============================================================
-- 014 ombor narxlari: optom narx ustunlari, CHECK'lar, sozlamalar shakli, resolve_unit_price / suggest_sale_price.
-- Core bilan BIR XIL kirishlar: tests/fixtures/pricing-cases.json (packages/core/__tests__/pricing.test.ts).
-- Ishga tushirish: run_local.sh (cwd = supabase/).
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE TEMP TABLE t (k text PRIMARY KEY, v uuid);
GRANT ALL ON t TO authenticated, anon;


-- Core bilan umumiy kirishlar (JSON)
\set cases `cat tests/fixtures/pricing-cases.json`

-- ---------- Tayyorgarlik ----------
SELECT pg_temp.as_user('a95a95a9-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b95b95b9-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
SELECT pg_temp.as_user('a95a95a9-0000-0000-0000-000000000001');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f95f95f9-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Chirmoq', 'dona', 13000);

-- ---------- 1. Mavjud tovar buzilmagan: optom yo'q, sotuv narxi o'sha ----------
SELECT pg_temp.assert_eq((SELECT wholesale_price IS NULL AND wholesale_min_qty_milli IS NULL FROM products WHERE id = 'f95f95f9-0000-0000-0000-000000000001'), true, 'eski tovarda optom NULL');
SELECT pg_temp.assert_eq((SELECT sale_price FROM products WHERE id = 'f95f95f9-0000-0000-0000-000000000001'), 13000::bigint, 'sale_price last_price dan');

-- ---------- 2. Narxlarni bitta UPDATE bilan yozish (tan, sotuv, optom) ----------
UPDATE products SET cost_price = 9000, sale_price = 13000, wholesale_price = 12000, wholesale_min_qty_milli = 10000 WHERE id = 'f95f95f9-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT cost_price || '/' || sale_price || '/' || last_price || '/' || wholesale_price || '/' || wholesale_min_qty_milli FROM products WHERE id = 'f95f95f9-0000-0000-0000-000000000001'), '9000/13000/13000/12000/10000'::text, 'narxlar yozildi, last_price sinxron');
UPDATE products SET sale_price = 14000 WHERE id = 'f95f95f9-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT last_price FROM products WHERE id = 'f95f95f9-0000-0000-0000-000000000001'), 14000::bigint, 'sotuv narxi o''zgarsa last_price ham (trigger 006 buzilmagan)');

-- ---------- 3. CHECK'lar ----------
SELECT pg_temp.expect_error($$UPDATE products SET wholesale_price = 100, wholesale_min_qty_milli = NULL WHERE id = 'f95f95f9-0000-0000-0000-000000000001'$$, 'products_wholesale_pair');
SELECT pg_temp.expect_error($$UPDATE products SET wholesale_price = NULL, wholesale_min_qty_milli = 1000 WHERE id = 'f95f95f9-0000-0000-0000-000000000001'$$, 'products_wholesale_pair');
SELECT pg_temp.expect_error($$UPDATE products SET wholesale_price = -1 WHERE id = 'f95f95f9-0000-0000-0000-000000000001'$$, 'products_wholesale_price_nonneg');
SELECT pg_temp.expect_error($$UPDATE products SET wholesale_min_qty_milli = 0 WHERE id = 'f95f95f9-0000-0000-0000-000000000001'$$, 'products_wholesale_min_qty_positive');
SELECT pg_temp.expect_error($$UPDATE products SET cost_price = -5 WHERE id = 'f95f95f9-0000-0000-0000-000000000001'$$, 'cost_price');
UPDATE products SET wholesale_price = NULL, wholesale_min_qty_milli = NULL WHERE id = 'f95f95f9-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT wholesale_price IS NULL FROM products WHERE id = 'f95f95f9-0000-0000-0000-000000000001'), true, 'optomni o''chirish (ikkalasi NULL)');

-- ---------- 4. Begona do'kon tovariga yozib bo'lmaydi (RLS) ----------
SELECT pg_temp.as_user('b95b95b9-0000-0000-0000-000000000002');
UPDATE products SET cost_price = 1, wholesale_price = 1, wholesale_min_qty_milli = 1 WHERE id = 'f95f95f9-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT cost_price FROM (SELECT cost_price FROM products WHERE id = 'f95f95f9-0000-0000-0000-000000000001' UNION ALL SELECT 9000 LIMIT 1) x), 9000::bigint, 'B do''koni A tovarini ko''rmaydi/o''zgartirmaydi');
SELECT pg_temp.as_user('a95a95a9-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f95f95f9-0000-0000-0000-000000000001'), 9000::bigint, 'A tovari o''zgarmagan');

-- ---------- 5. Sozlamalar shakli (shops.settings) ----------
UPDATE shops SET settings = '{"units":["dona"],"wholesale_enabled":true,"stock_enabled":false,"markup_percent":20}'::jsonb WHERE id = (SELECT v FROM t WHERE k = 'shopA');
SELECT pg_temp.assert_eq((SELECT settings ->> 'markup_percent' FROM shops WHERE id = (SELECT v FROM t WHERE k = 'shopA')), '20'::text, 'sozlamalar yozildi (units saqlanadi)');
UPDATE shops SET settings = '{"markup_percent":null}'::jsonb WHERE id = (SELECT v FROM t WHERE k = 'shopA');
SELECT pg_temp.expect_error(format($$UPDATE shops SET settings = '{"wholesale_enabled":"ha"}'::jsonb WHERE id = %L$$, (SELECT v FROM t WHERE k = 'shopA')), 'shops_settings_pricing_shape');
SELECT pg_temp.expect_error(format($$UPDATE shops SET settings = '{"stock_enabled":1}'::jsonb WHERE id = %L$$, (SELECT v FROM t WHERE k = 'shopA')), 'shops_settings_pricing_shape');
SELECT pg_temp.expect_error(format($$UPDATE shops SET settings = '{"markup_percent":1001}'::jsonb WHERE id = %L$$, (SELECT v FROM t WHERE k = 'shopA')), 'shops_settings_pricing_shape');
SELECT pg_temp.expect_error(format($$UPDATE shops SET settings = '{"markup_percent":-5}'::jsonb WHERE id = %L$$, (SELECT v FROM t WHERE k = 'shopA')), 'shops_settings_pricing_shape');
SELECT pg_temp.expect_error(format($$UPDATE shops SET settings = '{"markup_percent":12.5}'::jsonb WHERE id = %L$$, (SELECT v FROM t WHERE k = 'shopA')), 'shops_settings_pricing_shape');

-- ---------- 6. resolve_unit_price: core bilan bir xil kirishlar ----------
CREATE TEMP TABLE r_cases AS
  SELECT * FROM jsonb_to_recordset((:'cases'::jsonb) -> 'resolve')
    AS x(name text, sale bigint, ws bigint, min bigint, qty bigint, expected bigint);
GRANT ALL ON r_cases TO authenticated;
DO $$
DECLARE c record; n int := 0;
BEGIN
  FOR c IN SELECT * FROM r_cases LOOP
    PERFORM pg_temp.assert_eq(resolve_unit_price(c.sale, c.ws, c.min, c.qty), c.expected, 'resolve: ' || c.name);
    n := n + 1;
  END LOOP;
  IF n <> 10 THEN RAISE EXCEPTION 'TEST FAIL: resolve holatlari soni % (10 kutilgan): fixture o''qilmadi', n; END IF;
END $$;

-- ---------- 7. suggest_sale_price: core bilan bir xil kirishlar ----------
CREATE TEMP TABLE s_cases AS
  SELECT * FROM jsonb_to_recordset((:'cases'::jsonb) -> 'suggest')
    AS x(name text, cost bigint, pct int, expected bigint);
GRANT ALL ON s_cases TO authenticated;
DO $$
DECLARE c record; n int := 0;
BEGIN
  FOR c IN SELECT * FROM s_cases LOOP
    PERFORM pg_temp.assert_eq(suggest_sale_price(c.cost, c.pct), c.expected, 'suggest: ' || c.name);
    n := n + 1;
  END LOOP;
  IF n <> 11 THEN RAISE EXCEPTION 'TEST FAIL: suggest holatlari soni % (11 kutilgan): fixture o''qilmadi', n; END IF;
END $$;
SELECT pg_temp.assert_eq(suggest_sale_price(1000, NULL), NULL::bigint, 'ustama NULL -> NULL');
SELECT pg_temp.assert_eq(suggest_sale_price(NULL, 10), NULL::bigint, 'tan narx NULL -> NULL');
RESET ROLE;

-- ---------- 8. Anonimga yopiq ----------
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT resolve_unit_price(1, 1, 1, 1)$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT suggest_sale_price(1, 1)$$, 'permission denied');
RESET ROLE;

\echo '=== 014 OMBOR NARXLARI TESTLARI MUVAFFAQIYATLI ==='
