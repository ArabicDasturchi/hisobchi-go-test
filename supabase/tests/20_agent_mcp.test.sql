-- ============================================================
-- MCP agent xavfsizligi testlari (001 + 003 + 004 qo'llangandan keyin).
-- OAuth token = `client_id` claim'i bor JWT. Birinchi tomon (ilova/veb) tokeni = claim yo'q.
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
SELECT pg_temp.as_user('a2a2a2a2-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
INSERT INTO customers (id, shop_id, name, phone, notes)
  VALUES ('c2c2c2c2-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Karim', 'TEL-MAXFIY-123', 'IZOH-MAXFIY');
INSERT INTO t VALUES ('sale1', post_sale(
  (SELECT v FROM t WHERE k = 'shopA'), 'd2d2d2d2-0000-0000-0000-000000000001', 'op-1', 'c2c2c2c2-0000-0000-0000-000000000001', 'XOM-MAXFIY-MATN',
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000","raw_text":"QATOR-MAXFIY"},
    {"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},
    {"product_name":"momiq","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000));
SELECT record_payment((SELECT v FROM t WHERE k = 'shopA'), 'e2e2e2e2-0000-0000-0000-000000000001', 'p-1',
  'c2c2c2c2-0000-0000-0000-000000000001', 100000, 'naqd', 'TOLOV-MAXFIY');
SELECT pg_temp.as_user('b2b2b2b2-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
SELECT pg_temp.as_user('a2a2a2a2-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001'), 285000::bigint, 'birinchi tomon: qarz 285000');
SELECT pg_temp.assert_eq((SELECT phone FROM customers WHERE id = 'c2c2c2c2-0000-0000-0000-000000000001'), 'TEL-MAXFIY-123'::text, 'nazorat: ilova telefonni ko''radi');

-- ---------- 1. customer_outstanding: boshqa do'kon qarzi ko'rinmaydi (xavfsizlik xatosi) ----------
SELECT pg_temp.as_user('b2b2b2b2-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT customer_outstanding(%L, 'c2c2c2c2-0000-0000-0000-000000000001')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error(format($$SELECT customer_outstanding(%L, 'c2c2c2c2-0000-0000-0000-000000000001')$$, (SELECT v FROM t WHERE k = 'shopA')), 'not_authenticated');

-- ---------- 2. OAuth token yozuvni bajara olmaydi ----------
SELECT pg_temp.as_oauth('a2a2a2a2-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'oauth-1', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT reverse_sale(%L, %L, 'oauth-r', 'hujum qilish')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT record_payment(%L, gen_random_uuid(), 'oauth-p', 'c2c2c2c2-0000-0000-0000-000000000001', 1, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT void_payment(%L, 'e2e2e2e2-0000-0000-0000-000000000001', 'hujum qilish')$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error($$SELECT create_shop('Soxta')$$, 'oauth_client_forbidden');
SELECT pg_temp.expect_error($$SELECT accept_agent_draft(gen_random_uuid())$$, 'oauth_client_forbidden');
SELECT pg_temp.expect_error($$SELECT reject_agent_draft(gen_random_uuid(), 'yo''q')$$, 'oauth_client_forbidden');
-- jadvallarga to'g'ridan-to'g'ri yozish
SELECT pg_temp.expect_error(format($$INSERT INTO customers (shop_id, name) VALUES (%L, 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'row-level security');
SELECT pg_temp.expect_error(format($$INSERT INTO products (shop_id, name) VALUES (%L, 'Hujum')$$, (SELECT v FROM t WHERE k = 'shopA')), 'row-level security');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE customers SET name = 'buzildi'$$), 0::bigint, 'OAuth mijozni o''zgartira olmaydi');
SELECT pg_temp.assert_eq(pg_temp.affected($$DELETE FROM customers$$), 0::bigint, 'OAuth mijozni o''chira olmaydi');
SELECT pg_temp.assert_eq(pg_temp.affected($$UPDATE shops SET name = 'buzildi'$$), 0::bigint, 'OAuth do''kon nomini o''zgartira olmaydi');
-- jadvallarni o'qiy olmaydi (telefon, izoh)
SELECT pg_temp.assert_eq((SELECT count(*) FROM customers), 0::bigint, 'OAuth customers jadvalini o''qiy olmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 0::bigint, 'OAuth documents jadvalini o''qiy olmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments), 0::bigint, 'OAuth payments jadvalini o''qiy olmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM shops), 0::bigint, 'OAuth shops jadvalini o''qiy olmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_drafts), 0::bigint, 'OAuth agent_drafts jadvalini o''qiy olmaydi');

-- ---------- 3. Agent o'qish RPC'lari: ishlaydi, maxfiy maydon qaytarmaydi ----------
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_whoami()), 1::bigint, 'agent_whoami: 1 do''kon');
SELECT pg_temp.assert_eq((SELECT outstanding FROM agent_list_customers((SELECT v FROM t WHERE k = 'shopA'))), 285000::bigint, 'agent_list_customers: qarz 285000');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_customers((SELECT v FROM t WHERE k = 'shopA'), 'kar')), 1::bigint, 'agent_list_customers: qidiruv');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_customers((SELECT v FROM t WHERE k = 'shopA'), '%')), 0::bigint, 'agent_list_customers: % belgisi qidiruvda literal');
SELECT pg_temp.assert_eq((SELECT outstanding FROM agent_customer_balance((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001')), 285000::bigint, 'agent_customer_balance');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_sales((SELECT v FROM t WHERE k = 'shopA'))), 1::bigint, 'agent_list_sales: 1 savdo');
SELECT pg_temp.assert_eq((agent_get_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1'))->>'subtotal')::bigint, 385000::bigint, 'agent_get_sale: 385000');
SELECT pg_temp.assert_eq(jsonb_array_length(agent_get_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1'))->'lines'), 3, 'agent_get_sale: 3 qator');
SELECT pg_temp.assert_eq((agent_day_rows((SELECT v FROM t WHERE k = 'shopA'), (now() AT TIME ZONE 'Asia/Tashkent')::date)->'pg_totals'->>'sales_posted')::bigint, 385000::bigint, 'agent_day_rows: pg yig''indi');
SELECT pg_temp.assert_eq(
  position('MAXFIY' IN (
    (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM agent_whoami() x)::text ||
    (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM agent_list_customers((SELECT v FROM t WHERE k = 'shopA')) x)::text ||
    (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM agent_customer_balance((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001') x)::text ||
    (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM agent_list_sales((SELECT v FROM t WHERE k = 'shopA')) x)::text ||
    agent_get_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1'))::text ||
    agent_day_rows((SELECT v FROM t WHERE k = 'shopA'), (now() AT TIME ZONE 'Asia/Tashkent')::date)::text)),
  0, 'agent o''qish RPC''lari telefon, izoh va xom matnni qaytarmaydi');
SELECT pg_temp.expect_error(format($$SELECT * FROM agent_customer_balance(%L, gen_random_uuid())$$, (SELECT v FROM t WHERE k = 'shopA')), 'customer_not_found');

-- ---------- 4. Boshqa do'kon: OAuth token bilan ham ko'rinmaydi ----------
SELECT pg_temp.as_oauth('b2b2b2b2-0000-0000-0000-000000000002', 'claude-test');
SELECT pg_temp.assert_eq((SELECT shop_id FROM agent_whoami()), (SELECT v FROM t WHERE k = 'shopB'), 'B faqat o''z do''konini ko''radi');
SELECT pg_temp.expect_error(format($$SELECT * FROM agent_list_customers(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT * FROM agent_customer_balance(%L, 'c2c2c2c2-0000-0000-0000-000000000001')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT * FROM agent_list_sales(%L)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT agent_get_sale(%L, %L)$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT agent_day_rows(%L, current_date)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'b-1', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_payment(%L, 'b-2', 'c2c2c2c2-0000-0000-0000-000000000001', 1, 'naqd')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
-- B o'z do'konida A mijozi bilan qoralama yarata olmaydi
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'b-3', 'c2c2c2c2-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopB')), 'customer_not_in_shop');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_list_sales((SELECT v FROM t WHERE k = 'shopB'))), 0::bigint, 'B savdolari bo''sh');

-- ---------- 5. draft_sale savdo YOZMAYDI; 385 000 ----------
SELECT pg_temp.as_oauth('a2a2a2a2-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('dsale', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'mcp-1', 'c2c2c2c2-0000-0000-0000-000000000001', 'chirmoq 10 ta 13 ming...',
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000","raw_text":"chirmoq 10 ta 13 ming","warnings":["narx odatdagidan farq qiladi"]},
    {"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},
    {"product_name":"momiq","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000));
SELECT pg_temp.assert_eq(agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'mcp-1', NULL, NULL,
  '[{"product_name":"x","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1), (SELECT v FROM t WHERE k = 'dsale'), 'takroriy client_op_id — o''sha qoralama');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'mcp-2', NULL, NULL,
  '[{"product_name":"non","qty_milli":"3000","unit":"dona","unit_price":"4000"}]'::jsonb, 12001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'calc_mismatch');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'mcp-3', NULL, NULL,
  '[{"product_name":"non","qty_milli":"3000","unit":"xyz","unit_price":"4000"}]'::jsonb, 12000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_unit');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'mcp-4', NULL, NULL, '[]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_lines');
SELECT pg_temp.as_user('a2a2a2a2-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT total FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dsale')), 385000::bigint, 'qoralama jami 385000 (PostgreSQL hisobladi)');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dsale')), 'draft'::text, 'qoralama holati draft');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_drafts), 1::bigint, 'xato so''rovlar qoralama qoldirmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 1::bigint, 'draft_sale hujjat yozmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM document_lines), 3::bigint, 'draft_sale qator yozmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ledger_entries), 1::bigint, 'draft_sale jurnalga yozmadi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001'), 285000::bigint, 'draft_sale qarzni o''zgartirmadi');

-- ---------- 6. draft_payment ----------
SELECT pg_temp.as_oauth('a2a2a2a2-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_payment(%L, 'mcp-p1', 'c2c2c2c2-0000-0000-0000-000000000001', 285001, 'naqd')$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_exceeds_debt');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_payment(%L, 'mcp-p2', 'c2c2c2c2-0000-0000-0000-000000000001', 0, 'naqd')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_amount');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_payment(%L, 'mcp-p3', 'c2c2c2c2-0000-0000-0000-000000000001', 100, 'bitkoin')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_method');
INSERT INTO t VALUES ('dpay', agent_draft_payment((SELECT v FROM t WHERE k = 'shopA'), 'mcp-p4', 'c2c2c2c2-0000-0000-0000-000000000001', 50000, 'naqd', 'nasiya qaytdi'));
SELECT pg_temp.as_user('a2a2a2a2-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments), 1::bigint, 'draft_payment to''lov yozmadi');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001'), 285000::bigint, 'draft_payment qarzni o''zgartirmadi');

-- ---------- 7. Tasdiqlash faqat birinchi tomon sessiyasida ----------
SELECT pg_temp.as_oauth('a2a2a2a2-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dsale')), 'oauth_client_forbidden');
SELECT pg_temp.as_user('b2b2b2b2-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dsale')), 'draft_not_found');
SELECT pg_temp.as_user('a2a2a2a2-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq(accept_agent_draft((SELECT v FROM t WHERE k = 'dsale')), (SELECT v FROM t WHERE k = 'dsale'), 'accept_agent_draft sotuv');
SELECT pg_temp.assert_eq((SELECT status FROM documents WHERE id = (SELECT v FROM t WHERE k = 'dsale')), 'posted'::text, 'tasdiqlangan qoralama savdo posted');
SELECT pg_temp.assert_eq((SELECT subtotal FROM documents WHERE id = (SELECT v FROM t WHERE k = 'dsale')), 385000::bigint, 'tasdiqlangan savdo jami 385000');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ledger_entries), 2::bigint, 'tasdiqdan keyin jurnalda 2 yozuv');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dsale')), 'accepted'::text, 'qoralama holati accepted');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001'), 670000::bigint, 'qarz 285000 + 385000');
SELECT pg_temp.assert_eq(accept_agent_draft((SELECT v FROM t WHERE k = 'dpay')), (SELECT v FROM t WHERE k = 'dpay'), 'accept_agent_draft to''lov');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001'), 620000::bigint, 'qarz 670000 − 50000');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dsale')), 'draft_already_decided');
-- IKKI MARTA BOSISH: ikkinchi tasdiq na savdo, na jurnal, na to'lov yozdi
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 2::bigint, 'ikki marta tasdiq: bitta savdo');
SELECT pg_temp.assert_eq((SELECT count(*) FROM ledger_entries), 2::bigint, 'ikki marta tasdiq: bitta jurnal yozuvi');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dpay')), 'draft_already_decided');
SELECT pg_temp.assert_eq((SELECT count(*) FROM payments), 2::bigint, 'ikki marta tasdiq: bitta to''lov');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c2c2c2c2-0000-0000-0000-000000000001'), 620000::bigint, 'ikki marta tasdiqdan keyin qarz o''zgarmadi');
-- Veb boshqa do'kon qoralamasini ko'rmaydi va hal qila olmaydi (birinchi tomon sessiyasi, RLS)
SELECT pg_temp.as_user('b2b2b2b2-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_drafts), 0::bigint, 'B (veb) A do''konining qoralamalarini ko''rmaydi');
SELECT pg_temp.expect_error(format($$SELECT reject_agent_draft(%L, 'hujum')$$, (SELECT v FROM t WHERE k = 'dsale')), 'draft_not_found');
SELECT pg_temp.as_user('a2a2a2a2-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM agent_drafts WHERE status = 'accepted'), 2::bigint, 'A (veb) o''z tasdiqlangan qoralamalarini ko''radi');
-- rad etish
SELECT pg_temp.as_oauth('a2a2a2a2-0000-0000-0000-000000000001', 'claude-test');
INSERT INTO t VALUES ('dreject', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'mcp-r1', NULL, NULL,
  '[{"product_name":"non","qty_milli":"2000","unit":"dona","unit_price":"1000"}]'::jsonb, 2000));
SELECT pg_temp.as_user('a2a2a2a2-0000-0000-0000-000000000001');
SELECT reject_agent_draft((SELECT v FROM t WHERE k = 'dreject'), 'kerak emas');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dreject')), 'rejected'::text, 'rad etilgan');
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dreject')), 'draft_already_decided');
SELECT pg_temp.assert_eq((SELECT count(*) FROM documents), 2::bigint, 'rad etilgan qoralama savdo yaratmadi');
-- qoralama o'zgarmaydi
SELECT pg_temp.expect_error($$UPDATE agent_drafts SET total = 1$$, 'permission denied');
SELECT pg_temp.expect_error($$DELETE FROM agent_drafts$$, 'permission denied');
RESET ROLE;
SELECT pg_temp.expect_error($$UPDATE agent_drafts SET total = 1$$, 'draft_already_decided');
SELECT pg_temp.expect_error($$DELETE FROM agent_drafts$$, 'append-only');
SET ROLE authenticated;

-- ---------- 8. Cheklov: ochiq qoralamalar soni ----------
SELECT pg_temp.as_oauth('a2a2a2a2-0000-0000-0000-000000000001', 'claude-test');
DO $$
BEGIN
  FOR i IN 1..50 LOOP
    PERFORM agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'cap-' || i, NULL, NULL,
      '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1);
  END LOOP;
END $$;
SELECT pg_temp.expect_error(format($$SELECT agent_draft_sale(%L, 'cap-51', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'too_many_drafts');

-- ---------- 9. Anonim: yangi funksiyalar yopiq ----------
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT * FROM agent_whoami()$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT accept_agent_draft(gen_random_uuid())$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT * FROM agent_drafts$$, 'permission denied');
RESET ROLE;

-- ---------- 10. Qo'riqchi: har bir RLS yoqilgan jadvalda OAuth to'sig'i bor ----------
-- Yangi ijarachi jadval qo'shilsa va unga `<jadval>_no_oauth` siyosati qo'shilmasa, shu test yiqiladi.
SELECT pg_temp.assert_eq(
  (SELECT coalesce(string_agg(c.relname, ', ' ORDER BY c.relname), '')
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = c.relname || '_no_oauth' AND NOT p.polpermissive)),
  ''::text, 'har bir RLS jadvalida RESTRICTIVE *_no_oauth siyosati bor');
-- Agent o'qish funksiyalari natijasida telefon/izoh ustuni yo'q (funksiya imzosi bo'yicha)
SELECT pg_temp.assert_eq(
  (SELECT count(*) FROM pg_proc WHERE proname LIKE 'agent\_%' AND pronamespace = 'public'::regnamespace
     AND pg_get_function_result(oid) ~* 'phone|notes|raw_'),
  0::bigint, 'agent_* funksiyalar natijasida phone/notes/raw_* ustuni yo''q');

\echo '=== MCP AGENT XAVFSIZLIK TESTLARI MUVAFFAQIYATLI ==='
