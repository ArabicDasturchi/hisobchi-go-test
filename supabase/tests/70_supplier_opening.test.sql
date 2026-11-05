-- Ta'minotchining boshlang'ich qarzi (ochilish qoldig'i): 001..009 qo'llangandan keyin.
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
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b9b9b9b9-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
INSERT INTO suppliers (id, shop_id, name) VALUES ('b9b9b9b9-0000-0000-0000-0000000000b1', (SELECT v FROM t WHERE k = 'shopB'), 'B ta''minotchi');
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a9a9a9a9-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopA'), 'Rahim aka');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f9f9f9f9-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Chirmoq', 'dona', 13000);

-- ---------- 1. Boshlang'ich qarz 500 000: ostatka shuncha ----------
INSERT INTO t VALUES ('o1', post_supplier_opening_balance((SELECT v FROM t WHERE k = 'shopA'), 'd9d9d9d9-0000-0000-0000-000000000001', 'open-1', 'a9a9a9a9-0000-0000-0000-0000000000a1', 500000));
SELECT pg_temp.assert_eq((SELECT kind || ':' || status || ':' || subtotal FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'o1')), 'opening:posted:500000'::text, 'ochilish qoldig''i yozuvi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a9a9a9a9-0000-0000-0000-0000000000a1'), 500000::bigint, 'ostatka = ochilish qoldig''i');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements WHERE document_id = (SELECT v FROM t WHERE k = 'o1')), 0::bigint, 'ochilish qoldig''i ombor harakati yaratmaydi');

-- ---------- 2. Idempotent ----------
SELECT pg_temp.assert_eq(post_supplier_opening_balance((SELECT v FROM t WHERE k = 'shopA'), 'd9d9d9d9-0000-0000-0000-000000000009', 'open-1', 'a9a9a9a9-0000-0000-0000-0000000000a1', 999), (SELECT v FROM t WHERE k = 'o1'), 'qayta yuborish o''sha yozuvni qaytaradi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a9a9a9a9-0000-0000-0000-0000000000a1'), 500000::bigint, 'qayta yuborish qarzni ikki marta qo''shmaydi');

-- ---------- 3. Bitta faol ochilish qoldig'i ----------
SELECT pg_temp.expect_error(format($$SELECT post_supplier_opening_balance(%L, gen_random_uuid(), 'open-2', 'a9a9a9a9-0000-0000-0000-0000000000a1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'opening_balance_exists');

-- ---------- 4. Kirim va to'lov ustiga: 500 000 + 1 450 000 - 1 000 000 = 950 000 ----------
SELECT post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd9d9d9d9-0000-0000-0000-000000000002', 'pur-1', 'a9a9a9a9-0000-0000-0000-0000000000a1', NULL,
  '[{"product_id":"f9f9f9f9-0000-0000-0000-000000000001","qty_milli":"100000","unit_cost":"9000"},
    {"product_id":"f9f9f9f9-0000-0000-0000-000000000001","qty_milli":"50000","unit_cost":"11000"}]'::jsonb, 1450000, now(), 'naqd', 1000000);
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a9a9a9a9-0000-0000-0000-0000000000a1'), 950000::bigint, 'Eski 500 000 + Tovar 1 450 000 - Berildi 1 000 000');

-- ---------- 5. Noto'g'ri qiymatlar va begona do'kon ----------
SELECT pg_temp.expect_error(format($$SELECT post_supplier_opening_balance(%L, gen_random_uuid(), 'open-z', 'a9a9a9a9-0000-0000-0000-0000000000a1', 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_amount');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_opening_balance(%L, gen_random_uuid(), 'open-n', 'a9a9a9a9-0000-0000-0000-0000000000a1', -5)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_amount');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_opening_balance(%L, gen_random_uuid(), 'open-x', 'b9b9b9b9-0000-0000-0000-0000000000b1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'supplier_not_in_shop');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_opening_balance(%L, gen_random_uuid(), 'open-y', 'b9b9b9b9-0000-0000-0000-0000000000b1', 1000)$$, (SELECT v FROM t WHERE k = 'shopB')), 'permission|not_member|forbidden|supplier_not_in_shop');

-- ---------- 6. OAuth (MCP) yoza olmaydi ----------
SELECT pg_temp.as_oauth('a9a9a9a9-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT post_supplier_opening_balance(%L, gen_random_uuid(), 'open-o', 'a9a9a9a9-0000-0000-0000-0000000000a1', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.as_user('a9a9a9a9-0000-0000-0000-000000000001');

-- ---------- 7. Bekor qilish (teskari yozuv) va qayta kiritish ----------
SELECT reverse_purchase((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'o1'), 'rev-open-1', 'xato kiritilgan edi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a9a9a9a9-0000-0000-0000-0000000000a1'), 450000::bigint, 'ochilish qoldig''i bekor qilinsa qarz kamayadi (1 450 000 - 1 000 000)');
SELECT post_supplier_opening_balance((SELECT v FROM t WHERE k = 'shopA'), gen_random_uuid(), 'open-3', 'a9a9a9a9-0000-0000-0000-0000000000a1', 700000);
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a9a9a9a9-0000-0000-0000-0000000000a1'), 1150000::bigint, 'bekor qilingandan keyin yangi ochilish qoldig''i');

-- ---------- 8. To'g'ridan-to'g'ri yozish taqiqlangan; anon kira olmaydi ----------
SELECT pg_temp.expect_error(format($$INSERT INTO purchase_documents (shop_id, supplier_id, status, kind, subtotal, client_op_id, created_by) VALUES (%L, 'a9a9a9a9-0000-0000-0000-0000000000a1', 'posted', 'opening', 999, 'direct', auth.uid())$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied');
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT post_supplier_opening_balance(gen_random_uuid(), gen_random_uuid(), 'x', gen_random_uuid(), 1)$$, 'permission denied');
RESET ROLE;

\echo '=== OCHILISH QOLDIG''I TESTLARI MUVAFFAQIYATLI ==='
