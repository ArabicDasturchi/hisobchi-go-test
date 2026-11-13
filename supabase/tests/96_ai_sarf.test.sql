-- 018: AI so'rovlari hisobi (a'zolik, OAuth rad, kunlik limit, finish faqat bir marta). 001..013 + 018 qo'llangandan keyin.
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

-- A — do'kon egasi, C — A do'konining ikkinchi a'zosi, B — boshqa do'kon egasi
-- ---------- Tayyorgarlik ----------
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b9500000-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
RESET ROLE;
INSERT INTO shop_members (shop_id, user_id, role) VALUES ((SELECT v FROM t WHERE k = 'shopA'), 'c9500000-0000-0000-0000-000000000003', 'member');
SET ROLE authenticated;

-- ============================================================
-- 1. ai_begin_request: a'zo uchun ishlaydi, matn saqlanmaydi
-- ============================================================
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
INSERT INTO t VALUES ('r1', ai_begin_request((SELECT v FROM t WHERE k = 'shopA'), 'sale_text', 123));
SELECT pg_temp.assert_eq((SELECT status || ':' || mode || ':' || input_chars FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r1')), 'started:sale_text:123'::text, 'begin: started yozuvi');
SELECT pg_temp.assert_eq((SELECT user_id FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r1')), 'a9500000-0000-0000-0000-000000000001'::uuid, 'begin: user_id = auth.uid()');
SELECT pg_temp.assert_eq((SELECT finished_at IS NULL AND input_tokens IS NULL FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r1')), true, 'begin: hali yakunlanmagan');
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'ai_requests' AND column_name ~ '(text|prompt|image|content|customer|raw)'),
  0::bigint, 'jadvalda matn/rasm/mijoz ustuni yo''q');

-- Noto'g'ri qiymatlar
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'audio', 10)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_mode');
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, NULL, 10)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_mode');
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'sale_text', -1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_input_size');
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'sale_text', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_input_size');
SELECT pg_temp.expect_error($$SELECT ai_begin_request(NULL, 'sale_text', 10)$$, 'forbidden');

-- ============================================================
-- 2. Boshqa do'kon, OAuth, tizimga kirmagan, anon
-- ============================================================
SELECT pg_temp.as_user('b9500000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'sale_text', 10)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ai_requests WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 0::bigint, 'RLS: B A do''konining AI so''rovlarini ko''rmaydi');
SELECT pg_temp.as_oauth('a9500000-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'sale_text', 10)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ai_requests), 0::bigint, 'RESTRICTIVE: OAuth tokeni jadvalni o''qimaydi');
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'sale_text', 10)$$, (SELECT v FROM t WHERE k = 'shopA')), 'not_authenticated');
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT ai_begin_request(gen_random_uuid(), 'sale_text', 10)$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT ai_finish_request(gen_random_uuid(), 'ok', NULL, 1, 1, 'm')$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT * FROM ai_usage_summary(gen_random_uuid(), 7)$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT count(*) FROM ai_requests$$, 'permission denied');
RESET ROLE;
SET ROLE authenticated;

-- To'g'ridan-to'g'ri yozish yo'q (a'zo uchun ham)
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ai_requests), 1::bigint, 'RLS: A o''z do''koni so''rovini ko''radi');
SELECT pg_temp.expect_error(format($$INSERT INTO ai_requests (shop_id, user_id, mode, input_chars) VALUES (%L, auth.uid(), 'sale_text', 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied');
SELECT pg_temp.expect_error(format($$UPDATE ai_requests SET status = 'ok', finished_at = now() WHERE id = %L$$, (SELECT v FROM t WHERE k = 'r1')), 'permission denied');
SELECT pg_temp.expect_error(format($$DELETE FROM ai_requests WHERE id = %L$$, (SELECT v FROM t WHERE k = 'r1')), 'permission denied');

-- ============================================================
-- 3. ai_finish_request: faqat o'z so'rovi, faqat bir marta
-- ============================================================
-- Boshqa a'zo (C), boshqa do'kon (B), OAuth — rad
SELECT pg_temp.as_user('c9500000-0000-0000-0000-000000000003');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'ok', NULL, 10, 20, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'ai_request_not_found');
SELECT pg_temp.as_user('b9500000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'ok', NULL, 10, 20, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'ai_request_not_found');
SELECT pg_temp.as_oauth('a9500000-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'ok', NULL, 10, 20, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'oauth_client_forbidden');
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'ok', NULL, 10, 20, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'not_authenticated');

-- Noto'g'ri qiymatlar
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'started', NULL, 1, 1, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'invalid_status');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'error', NULL, 1, 1, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'invalid_error_code');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'error', 'Mijoz Ali aka', 1, 1, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'invalid_error_code');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'ok', 'ai_timeout', 1, 1, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'invalid_error_code');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'ok', NULL, -1, 1, 'm')$$, (SELECT v FROM t WHERE k = 'r1')), 'invalid_tokens');
SELECT pg_temp.expect_error($$SELECT ai_finish_request(gen_random_uuid(), 'ok', NULL, 1, 1, 'm')$$, 'ai_request_not_found');
SELECT pg_temp.assert_eq((SELECT status FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r1')), 'started'::text, 'rad etilgan chaqiruvlar yozuvga tegmadi');

-- To'g'ri yakun
SELECT ai_finish_request((SELECT v FROM t WHERE k = 'r1'), 'ok', NULL, 1500, 320, '  test-model  ');
SELECT pg_temp.assert_eq((SELECT status || ':' || input_tokens || ':' || output_tokens || ':' || model FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r1')), 'ok:1500:320:test-model'::text, 'finish ok: token va model yozildi');
SELECT pg_temp.assert_eq((SELECT finished_at IS NOT NULL AND error_code IS NULL FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r1')), true, 'finish ok: finished_at bor, error_code yo''q');

-- Ikkinchi marta — rad (ok ham, error ham)
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'ok', NULL, 1, 1, 'boshqa')$$, (SELECT v FROM t WHERE k = 'r1')), 'ai_request_already_finished');
SELECT pg_temp.expect_error(format($$SELECT ai_finish_request(%L, 'error', 'ai_timeout', 0, 0, NULL)$$, (SELECT v FROM t WHERE k = 'r1')), 'ai_request_already_finished');
SELECT pg_temp.assert_eq((SELECT status || ':' || input_tokens || ':' || model FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r1')), 'ok:1500:test-model'::text, 'qayta finish yozuvni o''zgartirmadi');

-- Xato bilan yakun
INSERT INTO t VALUES ('r2', ai_begin_request((SELECT v FROM t WHERE k = 'shopA'), 'purchase_image', 2048000));
SELECT ai_finish_request((SELECT v FROM t WHERE k = 'r2'), 'error', 'ai_timeout', NULL, NULL, NULL);
SELECT pg_temp.assert_eq((SELECT status || ':' || error_code || ':' || coalesce(model, '-') FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r2')), 'error:ai_timeout:-'::text, 'finish error: kod yozildi');

-- Trigger: jadval egasi (SECURITY DEFINER yo'li) ham yakunlangan yozuvni o'zgartira olmaydi
RESET ROLE;
SELECT pg_temp.expect_error(format($$UPDATE ai_requests SET status = 'error', error_code = 'x' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'r1')), 'ai_request_already_finished');
INSERT INTO t VALUES ('r3', (SELECT id FROM ai_requests WHERE false));
SET ROLE authenticated;
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
UPDATE t SET v = ai_begin_request((SELECT v FROM t WHERE k = 'shopA'), 'purchase_text', 50) WHERE k = 'r3';
RESET ROLE;
SELECT pg_temp.expect_error(format($$UPDATE ai_requests SET input_chars = 1, status = 'ok', finished_at = now() WHERE id = %L$$, (SELECT v FROM t WHERE k = 'r3')), 'ai_request_immutable');
SELECT pg_temp.expect_error(format($$UPDATE ai_requests SET status = 'ok' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'r3')), 'ai_requests_finished_consistent');
SET ROLE authenticated;

-- ============================================================
-- 4. Kunlik limit: do'kon bo'yicha oxirgi 24 soatda 200 ta
-- ============================================================
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq(ai_daily_limit_per_shop(), 200, 'limit 200');
-- Hozir A do'konida 3 ta (r1, r2, r3). Yana 197 ta → 200
SELECT count(ai_begin_request((SELECT v FROM t WHERE k = 'shopA'), 'sale_text', 1)) FROM generate_series(1, 197);
SELECT pg_temp.assert_eq((SELECT count(*) FROM ai_requests WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 200::bigint, '200 ta so''rov qabul qilindi');
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'sale_text', 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'ai_daily_limit');
-- Boshqa a'zo ham o'sha do'kon limitiga bo'ysunadi
SELECT pg_temp.as_user('c9500000-0000-0000-0000-000000000003');
SELECT pg_temp.expect_error(format($$SELECT ai_begin_request(%L, 'purchase_image', 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'ai_daily_limit');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ai_requests WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 200::bigint, 'limitdan oshgan so''rov yozilmadi');
-- Limitdan keyin ham yakunlash ishlaydi (boshlangan so'rov tugashi kerak)
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
SELECT ai_finish_request((SELECT v FROM t WHERE k = 'r3'), 'ok', NULL, 10, 5, 'm');
SELECT pg_temp.assert_eq((SELECT status FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'r3')), 'ok'::text, 'limitda ham finish ishlaydi');

-- B do'koni: 24 soatdan eski 250 ta yozuv limitga kirmaydi
RESET ROLE;
INSERT INTO ai_requests (shop_id, user_id, mode, status, input_chars, started_at, finished_at)
SELECT (SELECT v FROM t WHERE k = 'shopB'), 'b9500000-0000-0000-0000-000000000002', 'sale_text', 'ok', 1, now() - interval '25 hours', now() - interval '25 hours'
FROM generate_series(1, 250);
SET ROLE authenticated;
SELECT pg_temp.as_user('b9500000-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('rb', ai_begin_request((SELECT v FROM t WHERE k = 'shopB'), 'sale_text', 5));
SELECT pg_temp.assert_eq((SELECT status FROM ai_requests WHERE id = (SELECT v FROM t WHERE k = 'rb')), 'started'::text, 'boshqa do''kon limiti alohida; 24 soatdan eskilari sanalmaydi');

-- ============================================================
-- 5. ai_usage_summary
-- ============================================================
SELECT pg_temp.as_user('a9500000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT sum(requests)::bigint FROM ai_usage_summary((SELECT v FROM t WHERE k = 'shopA'), 7)), 200::bigint, 'summary: so''rovlar soni');
SELECT pg_temp.assert_eq((SELECT sum(ok_count)::bigint FROM ai_usage_summary((SELECT v FROM t WHERE k = 'shopA'), 7)), 2::bigint, 'summary: ok soni');
SELECT pg_temp.assert_eq((SELECT sum(error_count)::bigint FROM ai_usage_summary((SELECT v FROM t WHERE k = 'shopA'), 7)), 1::bigint, 'summary: xato soni');
SELECT pg_temp.assert_eq((SELECT sum(input_tokens)::bigint FROM ai_usage_summary((SELECT v FROM t WHERE k = 'shopA'), 7)), 1510::bigint, 'summary: kirish tokenlari');
SELECT pg_temp.assert_eq((SELECT sum(output_tokens)::bigint FROM ai_usage_summary((SELECT v FROM t WHERE k = 'shopA'), NULL)), 325::bigint, 'summary: chiqish tokenlari (p_days NULL → 30)');
SELECT pg_temp.as_user('b9500000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq((SELECT sum(requests)::bigint FROM ai_usage_summary((SELECT v FROM t WHERE k = 'shopB'), 1)), 1::bigint, 'summary: 1 kun oynasi eski yozuvlarni olmaydi');
SELECT pg_temp.assert_eq((SELECT sum(requests)::bigint FROM ai_usage_summary((SELECT v FROM t WHERE k = 'shopB'), 1000)), 251::bigint, 'summary: p_days 90 bilan cheklanadi, eski yozuvlar ko''rinadi');
SELECT pg_temp.expect_error(format($$SELECT * FROM ai_usage_summary(%L, 7)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.as_oauth('a9500000-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT * FROM ai_usage_summary(%L, 7)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
RESET ROLE;

\echo '=== BARCHA 95_ai_sarf TESTLARI O''TDI ==='
