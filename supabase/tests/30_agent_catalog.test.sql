-- ============================================================
-- Agent katalogi testlari (001 + 003 + 004 + 005 qo'llangandan keyin).
-- Qoida: agent mijoz/tovar QO'SHADI; o'zgartirish/arxiv faqat tasdiqlash so'rovi; savdo va to'lov faqat qoralama.
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

-- ---------- Tayyorgarlik (birinchi tomon sessiyasi) ----------
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b3b3b3b3-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
INSERT INTO customers (id, shop_id, name, phone) VALUES ('c3c3c3c3-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Karim', 'TEL-MAXFIY-123');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f3f3f3f3-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Non', 'dona', 4000);
SELECT pg_temp.assert_eq((SELECT source FROM customers WHERE id = 'c3c3c3c3-0000-0000-0000-000000000001'), 'app'::text, 'ilova qo''shgan mijoz source=app');
SELECT pg_temp.assert_eq((SELECT is_active FROM customers WHERE id = 'c3c3c3c3-0000-0000-0000-000000000001'), true, 'mavjud mijoz faol (mavjud ma''lumot buzilmaydi)');

-- ---------- 1. OAuth token jadvallarga to'g'ridan-to'g'ri yoza olmaydi ----------
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$INSERT INTO customers (shop_id, name) VALUES (%L, 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'row-level security');
SELECT pg_temp.expect_error(format($$INSERT INTO customers (shop_id, name, source) VALUES (%L, 'Hujum', 'agent')$$, (SELECT v FROM t WHERE k = 'shopA')), 'row-level security');
SELECT pg_temp.expect_error(format($$INSERT INTO products (shop_id, name) VALUES (%L, 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'row-level security');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE customers SET name = 'buzildi'$$), 0::bigint, 'OAuth mijozni o''zgartira olmaydi');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE customers SET is_active = false$$), 0::bigint, 'OAuth mijozni arxivlay olmaydi');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE products SET last_price = 1, is_active = false$$), 0::bigint, 'OAuth tovarni o''zgartira/arxivlay olmaydi');
SELECT pg_temp.assert_eq(pg_temp.affected($$DELETE FROM customers$$), 0::bigint, 'OAuth mijozni o''chira olmaydi');
SELECT pg_temp.assert_eq(pg_temp.affected($$DELETE FROM products$$), 0::bigint, 'OAuth tovarni o''chira olmaydi');
SELECT pg_temp.expect_error($$SELECT count(*) FROM agent_requests$$, 'permission denied');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'oauth-x', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');

-- ---------- 2. agent_add_customer ----------
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0001', '  Rahim   aka ')->>'created')::boolean, true, 'agent mijoz qo''shdi (tasdiqsiz)');
INSERT INTO t VALUES ('rahim', (agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0001', 'Rahim aka')->>'id')::uuid);
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT name FROM customers WHERE id = (SELECT v FROM t WHERE k = 'rahim')), 'Rahim aka'::text, 'nom tozalandi (ortiqcha bo''shliqsiz)');
SELECT pg_temp.assert_eq((SELECT source FROM customers WHERE id = (SELECT v FROM t WHERE k = 'rahim')), 'agent'::text, 'source = agent');
SELECT pg_temp.assert_eq((SELECT source_client_id FROM customers WHERE id = (SELECT v FROM t WHERE k = 'rahim')), 'claude-test'::text, 'source_client_id = OAuth klient');
SELECT pg_temp.assert_eq((SELECT phone IS NULL AND notes IS NULL FROM customers WHERE id = (SELECT v FROM t WHERE k = 'rahim')), true, 'agent telefon va izoh qo''ymaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 2::bigint, 'takroriy request_id ikkinchi mijoz yaratmadi');
SELECT pg_temp.assert_eq(pg_get_function_arguments('agent_add_customer(uuid,text,text)'::regprocedure) ~* 'phone|note', false, 'agent_add_customer imzosida telefon/izoh yo''q');

SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
-- Dublikat: nom normallashtiriladi (kichik/katta harf, bo'shliq, apostrof variantlari)
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0002', ' RAHIM AKA ')) ->> 'created', 'false'::text, 'dublikat (harf/bo''shliq) yangi mijoz yaratmaydi');
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0002', ' RAHIM AKA ')) ->> 'replayed', 'true'::text, 'request_id takrori avvalgi natijani qaytaradi');
INSERT INTO t VALUES ('roziId', (agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0003', 'Ro‘zi aka')->>'id')::uuid);
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0004', 'Ro''zi aka')->>'id')::uuid, (SELECT v FROM t WHERE k = 'roziId'), 'apostrof variantlari bitta mijoz');
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0005', 'karim')->>'created')::boolean, false, 'ilova qo''shgan mijoz bilan dublikat ham topiladi');
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'req-cust-0005', 'karim')->>'source'), 'app'::text, 'mavjud mijoz manbasi o''zgarmaydi');
SELECT pg_temp.expect_error(format($$SELECT agent_add_customer(%L, 'req-cust-0001', 'Boshqa ism')$$, (SELECT v FROM t WHERE k = 'shopA')), 'request_id_conflict');
SELECT pg_temp.expect_error(format($$SELECT agent_add_customer(%L, 'qisqa', 'Ali')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_request_id');
SELECT pg_temp.expect_error(format($$SELECT agent_add_customer(%L, 'req-cust-0006', '   ')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_name');
SELECT pg_temp.expect_error(format($$SELECT agent_add_customer(%L, 'req-cust-0007', %L)$$, (SELECT v FROM t WHERE k = 'shopA'), 'Ali' || chr(7)), 'invalid_name');
SELECT pg_temp.expect_error(format($$SELECT agent_add_customer(%L, 'req-cust-0008', %L)$$, (SELECT v FROM t WHERE k = 'shopA'), repeat('a', 121)), 'invalid_name');

-- ---------- 3. Boshqa do'konga yozib bo'lmaydi (RLS / a'zolik) ----------
SELECT pg_temp.as_oauth('b3b3b3b3-0000-0000-0000-000000000002', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT agent_add_customer(%L, 'req-b-00001', 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-b-00002', '[{"name":"Hujum"}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT * FROM agent_list_products(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_archive(%L, 'req-b-00003', 'customer', 'c3c3c3c3-0000-0000-0000-000000000001')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
-- B o'z do'konida A ning mijozini o'zgartirish/arxivlashni so'ray olmaydi
SELECT pg_temp.expect_error(format($$SELECT agent_propose_customer_update(%L, 'req-b-00004', 'c3c3c3c3-0000-0000-0000-000000000001', 'Yangi nom')$$, (SELECT v FROM t WHERE k = 'shopB')), 'customer_not_found');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_archive(%L, 'req-b-00005', 'product', 'f3f3f3f3-0000-0000-0000-000000000001')$$, (SELECT v FROM t WHERE k = 'shopB')), 'product_not_found');
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopB'), 'req-b-00006', 'Rahim aka')->>'created')::boolean, true, 'B o''z do''konida shu nomli mijozni qo''sha oladi (dublikat faqat do''kon ichida)');

-- ---------- 4. agent_add_products ----------
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('batch1', NULL);
SELECT pg_temp.assert_eq((agent_add_products((SELECT v FROM t WHERE k = 'shopA'), 'req-prod-001',
  '[{"name":"Chirmoq","unit":"dona","price":13000},{"name":"Yurak","unit":"dona","price":15000},{"name":"momiq","price":9000},
    {"name":" chirmoq ","price":99999},{"name":"NON","price":4500}]'::jsonb)) ->> 'created_count', '3'::text, '3 ta yangi tovar qo''shildi');
SELECT pg_temp.assert_eq((agent_add_products((SELECT v FROM t WHERE k = 'shopA'), 'req-prod-001',
  '[{"name":"Chirmoq","unit":"dona","price":13000},{"name":"Yurak","unit":"dona","price":15000},{"name":"momiq","price":9000},
    {"name":" chirmoq ","price":99999},{"name":"NON","price":4500}]'::jsonb)) ->> 'existing_count', '2'::text, 'paket ichidagi dublikat va mavjud tovar "existing" da');
SELECT pg_temp.assert_eq((agent_add_products((SELECT v FROM t WHERE k = 'shopA'), 'req-prod-001',
  '[{"name":"Chirmoq","unit":"dona","price":13000},{"name":"Yurak","unit":"dona","price":15000},{"name":"momiq","price":9000},
    {"name":" chirmoq ","price":99999},{"name":"NON","price":4500}]'::jsonb)) ->> 'replayed', 'true'::text, 'paket takrori (request_id) avvalgi natija');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-001', '[{"name":"Boshqa"}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'request_id_conflict');
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM products WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 4::bigint, 'takror ikkinchi yozuv yaratmadi (Non + 3)');
SELECT pg_temp.assert_eq((SELECT last_price FROM products WHERE name = 'Non'), 4000::bigint, 'mavjud tovar narxi agent tomonidan o''zgarmadi');
SELECT pg_temp.assert_eq((SELECT last_price FROM products WHERE name = 'Chirmoq'), 13000::bigint, 'agent tovarining narxi (butun so''m)');
SELECT pg_temp.assert_eq((SELECT unit FROM products WHERE name = 'momiq'), 'dona'::text, 'birlik berilmasa dona');
SELECT pg_temp.assert_eq((SELECT source || ':' || source_client_id FROM products WHERE name = 'Chirmoq'), 'agent:claude-test'::text, 'tovarda source va client_id');
SELECT pg_temp.assert_eq((SELECT source FROM products WHERE name = 'Non'), 'app'::text, 'ilova tovari source=app');

SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
-- Noto'g'ri qator: hech narsa qo'shilmaydi (atomik), xato qator raqami bilan
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad1',
  '[{"name":"Yaxshi tovar","price":1000},{"name":"Yomon","price":"12.5"}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_item: index=2, field=price');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad2', '[{"name":"X","price":100000001}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'field=price');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad3', '[{"name":"X","price":-5}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'field=price');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad4', '[{"name":"X","unit":"xyz"}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'field=unit');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad5', '[{"name":"  "}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'field=name');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad6', '[]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_items');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad7', '{"name":"X"}'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_items');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'req-prod-bad8', %L::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA'),
  (SELECT jsonb_agg(jsonb_build_object('name', 'T' || g))::text FROM generate_series(1, 101) g)), 'invalid_items');
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM products WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA') AND name IN ('Yaxshi tovar', 'X', 'Yomon')), 0::bigint, 'xato paketdan hech narsa qo''shilmadi');

-- ---------- 5. Kunlik limit ----------
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
-- mijozlar: bugun agent 2 ta qo'shgan (Rahim aka, Ro'zi aka); 100 gacha
DO $$
BEGIN
  FOR i IN 1..98 LOOP
    PERFORM agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'lim-c-' || lpad(i::text, 4, '0') || '-x', 'Mijoz ' || i);
  END LOOP;
END $$;
SELECT pg_temp.expect_error(format($$SELECT agent_add_customer(%L, 'lim-c-over-01', 'Yangi mijoz')$$, (SELECT v FROM t WHERE k = 'shopA')), 'daily_limit_exceeded');
SELECT pg_temp.assert_eq((agent_add_customer((SELECT v FROM t WHERE k = 'shopA'), 'lim-c-over-02', 'mijoz 5')->>'created')::boolean, false, 'limitda ham dublikat so''rovi xato bermaydi (yangi yaratilmaydi)');
-- tovarlar: 3 ta agent qo'shgan; 500 gacha (4 paket x 100 + 97)
DO $$
BEGIN
  FOR b IN 0..3 LOOP
    PERFORM agent_add_products((SELECT v FROM t WHERE k = 'shopA'), 'lim-p-' || b || '-xxxx',
      (SELECT jsonb_agg(jsonb_build_object('name', 'Tovar ' || (b * 100 + g), 'unit', 'dona', 'price', 1000)) FROM generate_series(1, 100) g));
  END LOOP;
  PERFORM agent_add_products((SELECT v FROM t WHERE k = 'shopA'), 'lim-p-last-x',
    (SELECT jsonb_agg(jsonb_build_object('name', 'Tovar ' || (400 + g), 'unit', 'dona', 'price', 1000)) FROM generate_series(1, 97) g));
END $$;
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM products WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA') AND source = 'agent'), 500::bigint, 'agent bugun 500 ta tovar qo''shdi');
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'lim-p-over-01', '[{"name":"Yana bitta"}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'daily_limit_exceeded');
SELECT pg_temp.expect_error(format($$SELECT agent_add_products(%L, 'lim-p-over-02', '[{"name":"Tovar 1"},{"name":"Yana bitta"}]'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA')), 'daily_limit_exceeded');
SELECT pg_temp.assert_eq((agent_add_products((SELECT v FROM t WHERE k = 'shopA'), 'lim-p-over-03', '[{"name":"tovar 1"}]'::jsonb)) ->> 'created_count', '0'::text, 'limitda mavjud tovarni so''rash xato bermaydi');
-- B do'konining limiti alohida
SELECT pg_temp.as_oauth('b3b3b3b3-0000-0000-0000-000000000002', 'claude-test');
SELECT pg_temp.assert_eq((agent_add_products((SELECT v FROM t WHERE k = 'shopB'), 'req-b-prod-1', '[{"name":"Non","price":3000}]'::jsonb)) ->> 'created_count', '1'::text, 'limit do''kon bo''yicha alohida');

-- ---------- 6. O'zgartirish va arxiv: faqat tasdiqlash so'rovi ----------
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('pChirmoq', (SELECT id FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA'), 'Chirmoq') LIMIT 1));
INSERT INTO t VALUES ('dCustUpd', agent_propose_customer_update((SELECT v FROM t WHERE k = 'shopA'), 'prop-cust-01', (SELECT v FROM t WHERE k = 'rahim'), 'Rahim Karimov'));
INSERT INTO t VALUES ('dProdUpd', agent_propose_product_update((SELECT v FROM t WHERE k = 'shopA'), 'prop-prod-01', (SELECT v FROM t WHERE k = 'pChirmoq'), '{"price": 14000, "name": "Chirmoq 1-nav"}'::jsonb));
SELECT pg_temp.assert_eq(agent_propose_customer_update((SELECT v FROM t WHERE k = 'shopA'), 'prop-cust-01', (SELECT v FROM t WHERE k = 'rahim'), 'Rahim Karimov'), (SELECT v FROM t WHERE k = 'dCustUpd'), 'so''rov takrori (request_id) o''sha so''rov');
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT name FROM customers WHERE id = (SELECT v FROM t WHERE k = 'rahim')), 'Rahim aka'::text, 'tasdiqlanmaguncha mijoz nomi o''zgarmadi');
SELECT pg_temp.assert_eq((SELECT last_price FROM products WHERE id = (SELECT v FROM t WHERE k = 'pChirmoq')), 13000::bigint, 'tasdiqlanmaguncha tovar narxi o''zgarmadi');
SELECT pg_temp.assert_eq((SELECT payload #>> '{changes,name,from}' || '>' || (payload #>> '{changes,name,to}') FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dCustUpd')), 'Rahim aka>Rahim Karimov'::text, 'so''rovda eski va yangi qiymat');
SELECT pg_temp.assert_eq((SELECT payload #>> '{changes,price,from}' || '>' || (payload #>> '{changes,price,to}') FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dProdUpd')), '13000>14000'::text, 'tovar so''rovi: narx eski va yangi');
SELECT pg_temp.assert_eq((SELECT status || ':' || kind FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dProdUpd')), 'draft:product_update'::text, 'so''rov turi va holati');

SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_customer_update(%L, 'prop-cust-02', %L, 'Boshqa')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'rahim')), 'proposal_pending');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_archive(%L, 'prop-arch-00', 'customer', %L)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'rahim')), 'proposal_pending');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_product_update(%L, 'prop-prod-02', %L, '{"phone":"123"}'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pChirmoq')), 'invalid_changes');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_product_update(%L, 'prop-prod-03', (SELECT id FROM agent_list_products(%L, 'Yurak') LIMIT 1), '{"price": 15000}'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'shopA')), 'no_change');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_product_update(%L, 'prop-prod-04', (SELECT id FROM agent_list_products(%L, 'Yurak') LIMIT 1), '{"name":"CHIRMOQ"}'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'shopA')), 'name_taken');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_product_update(%L, 'prop-prod-05', (SELECT id FROM agent_list_products(%L, 'Yurak') LIMIT 1), '{"price": "abc"}'::jsonb)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'shopA')), 'invalid_price');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_archive(%L, 'prop-arch-xx', 'supplier', gen_random_uuid())$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_kind');
INSERT INTO t VALUES ('pMomiq', (SELECT id FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA'), 'momiq') LIMIT 1));
INSERT INTO t VALUES ('dProdArch', agent_propose_archive((SELECT v FROM t WHERE k = 'shopA'), 'prop-arch-01', 'product', (SELECT v FROM t WHERE k = 'pMomiq')));
INSERT INTO t VALUES ('dCustArch', agent_propose_archive((SELECT v FROM t WHERE k = 'shopA'), 'prop-arch-02', 'customer', 'c3c3c3c3-0000-0000-0000-000000000001'));
-- OAuth tasdiqlay ham, rad eta ham olmaydi
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dProdUpd')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT reject_agent_draft(%L, 'yo''q')$$, (SELECT v FROM t WHERE k = 'dProdUpd')), 'oauth_client_forbidden');
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT is_active FROM products WHERE id = (SELECT v FROM t WHERE k = 'pMomiq')), true, 'arxiv so''rovi tasdiqlanmaguncha tovar faol');
SELECT pg_temp.assert_eq((SELECT is_active FROM customers WHERE id = 'c3c3c3c3-0000-0000-0000-000000000001'), true, 'arxiv so''rovi tasdiqlanmaguncha mijoz faol');

-- Rad etilsa qo'llanmaydi
SELECT reject_agent_draft((SELECT v FROM t WHERE k = 'dCustUpd'), 'kerak emas');
SELECT pg_temp.assert_eq((SELECT name FROM customers WHERE id = (SELECT v FROM t WHERE k = 'rahim')), 'Rahim aka'::text, 'rad etilgan so''rov qo''llanmadi');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dCustUpd')), 'draft_already_decided');
-- Boshqa do'kon foydalanuvchisi tasdiqlay olmaydi
SELECT pg_temp.as_user('b3b3b3b3-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dProdUpd')), 'draft_not_found');
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
-- Tasdiqlansa qo'llanadi
SELECT pg_temp.assert_eq(accept_agent_draft((SELECT v FROM t WHERE k = 'dProdUpd')), (SELECT v FROM t WHERE k = 'dProdUpd'), 'tovar o''zgartirish tasdiqlandi');
SELECT pg_temp.assert_eq((SELECT name || ':' || last_price FROM products WHERE id = (SELECT v FROM t WHERE k = 'pChirmoq')), 'Chirmoq 1-nav:14000'::text, 'tasdiqdan keyin nom va narx yangilandi');
SELECT pg_temp.assert_eq(accept_agent_draft((SELECT v FROM t WHERE k = 'dProdArch')), (SELECT v FROM t WHERE k = 'dProdArch'), 'tovar arxivi tasdiqlandi');
SELECT pg_temp.assert_eq((SELECT is_active FROM products WHERE id = (SELECT v FROM t WHERE k = 'pMomiq')), false, 'tovar arxivlandi (DELETE emas)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM products WHERE id = (SELECT v FROM t WHERE k = 'pMomiq')), 1::bigint, 'arxivlangan tovar qatori saqlanadi');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dProdArch')), 'draft_already_decided');
SELECT pg_temp.expect_error(format($$SELECT agent_propose_archive(%L, 'prop-arch-03', 'product', %L)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pMomiq')), 'target_archived');

-- Qarzli mijozni arxivlash: savdo, qarz va tarix saqlanadi
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd3d3d3d3-0000-0000-0000-000000000001', 'op-karim-1', 'c3c3c3c3-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"},
    {"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},
    {"product_name":"momiq","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000);
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq(accept_agent_draft((SELECT v FROM t WHERE k = 'dCustArch')), (SELECT v FROM t WHERE k = 'dCustArch'), 'mijoz arxivi tasdiqlandi');
SELECT pg_temp.assert_eq((SELECT is_active FROM customers WHERE id = 'c3c3c3c3-0000-0000-0000-000000000001'), false, 'mijoz arxivlandi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c3c3c3c3-0000-0000-0000-000000000001'), 385000::bigint, 'arxivlangan mijozning qarzi saqlandi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents WHERE customer_id = 'c3c3c3c3-0000-0000-0000-000000000001'), 1::bigint, 'arxivlangan mijozning savdo tarixi saqlandi');
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_customers((SELECT v FROM t WHERE k = 'shopA'), 'Karim')), 0::bigint, 'arxivlangan mijoz agent ro''yxatida ko''rinmaydi');
SELECT pg_temp.assert_eq((SELECT outstanding FROM agent_customer_balance((SELECT v FROM t WHERE k = 'shopA'), 'c3c3c3c3-0000-0000-0000-000000000001')), 385000::bigint, 'arxivlangan mijoz balansi so''ralsa ishlaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA'), 'momiq')), 0::bigint, 'arxivlangan tovar agent ro''yxatida ko''rinmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA'), 'momiq', true)), 1::bigint, 'include_archived bilan ko''rinadi');
SELECT pg_temp.assert_eq((SELECT price FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA'), 'Non')), 4000::bigint, 'agent_list_products narx');
SELECT pg_temp.assert_eq(position('MAXFIY' IN (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)::text FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA')) x)), 0, 'agent_list_products maxfiy maydon qaytarmaydi');

-- Eskirgan so'rov: yozuv so'rovdan keyin boshqacha bo'lib qolsa jim ustidan yozilmaydi
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('pYurak', (SELECT id FROM agent_list_products((SELECT v FROM t WHERE k = 'shopA'), 'Yurak') LIMIT 1));
INSERT INTO t VALUES ('dStale', agent_propose_product_update((SELECT v FROM t WHERE k = 'shopA'), 'prop-stale-1', (SELECT v FROM t WHERE k = 'pYurak'), '{"price": 16000}'::jsonb));
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
UPDATE products SET last_price = 15500 WHERE id = (SELECT v FROM t WHERE k = 'pYurak');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dStale')), 'draft_stale');
SELECT pg_temp.assert_eq((SELECT last_price FROM products WHERE id = (SELECT v FROM t WHERE k = 'pYurak')), 15500::bigint, 'eskirgan so''rov savdogarning qiymatini bosmadi');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dStale')), 'draft'::text, 'eskirgan so''rov ochiq qoladi (savdogar rad etadi)');

-- ---------- 7. Savdo va to'lov hali ham faqat qoralama ----------
SELECT pg_temp.as_oauth('a3a3a3a3-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('dSale', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'sale-draft-01', NULL, NULL,
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"},
    {"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},
    {"product_name":"momiq","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000));
SELECT pg_temp.as_user('a3a3a3a3-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT total FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dSale')), 385000::bigint, 'savdo qoralamasi jami 385000');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dSale')), 'draft'::text, 'savdo qoralamasi tasdiqlanmagan');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 1::bigint, 'savdo qoralamasi hujjat yozmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ledger_entries), 1::bigint, 'savdo qoralamasi jurnalga yozmadi');

-- ---------- 8. Qo'riqchilar ----------
RESET ROLE;
-- yangi jadvalda ham OAuth to'sig'i bor (20_agent_mcp ham tekshiradi; bu yerda aniq jadval)
SELECT pg_temp.assert_eq((SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = 'agent_requests' AND p.polname = 'agent_requests_no_oauth' AND NOT p.polpermissive), 1::bigint, 'agent_requests uchun RESTRICTIVE *_no_oauth');
-- agent_* funksiyalar anonimga yopiq
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT agent_add_customer(gen_random_uuid(), 'req-anon-001', 'X')$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT agent_add_products(gen_random_uuid(), 'req-anon-002', '[{"name":"X"}]'::jsonb)$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT * FROM agent_list_products(gen_random_uuid())$$, 'permission denied');
RESET ROLE;

\echo '=== AGENT KATALOGI TESTLARI MUVAFFAQIYATLI ==='
