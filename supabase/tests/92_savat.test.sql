-- 016: Savat (F2) va AI qoralamasini savatga olish (B3). 001..013 (+015 bo'lsa ham) va 016 qo'llangandan keyin.
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
SELECT pg_temp.as_user('a1500000-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b1500000-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
INSERT INTO customers (id, shop_id, name) VALUES ('b1500000-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shopB'), 'B mijoz');
SELECT pg_temp.as_user('a1500000-0000-0000-0000-000000000001');
INSERT INTO customers (id, shop_id, name) VALUES ('a1500000-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shopA'), 'Ali');
INSERT INTO customers (id, shop_id, name) VALUES ('a1500000-0000-0000-0000-0000000000c2', (SELECT v FROM t WHERE k = 'shopA'), 'Vali');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a1500000-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopA'), 'Rahim aka');

-- ============================================================
-- 1. Yaratish, versiya, idempotentlik
-- ============================================================
SELECT pg_temp.assert_eq(
  (SELECT version FROM basket_save((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b1', 'sale',
    'a1500000-0000-0000-0000-0000000000c1', '[{"key":"k1","productName":"Chirmoq","qty":"10","unit":"dona","price":"13 000"}]'::jsonb, NULL, 'op-1')),
  1, 'yangi savat: versiya 1');
SELECT pg_temp.assert_eq((SELECT jsonb_array_length(lines) FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b1'), 1, 'qatorlar saqlandi');
-- Takror yuborish (o'sha op) — o'sha natija, versiya o'zgarmaydi
SELECT pg_temp.assert_eq(
  (SELECT version FROM basket_save((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b1', 'sale',
    'a1500000-0000-0000-0000-0000000000c1', '[]'::jsonb, NULL, 'op-1')),
  1, 'takror op: o''sha versiya (idempotent)');
SELECT pg_temp.assert_eq((SELECT jsonb_array_length(lines) FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b1'), 1, 'takror op qatorlarni o''zgartirmadi');
-- Yangilash: versiya 1 → 2
SELECT pg_temp.assert_eq(
  (SELECT version FROM basket_save((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b1', 'sale',
    'a1500000-0000-0000-0000-0000000000c1', '[{"key":"k1"},{"key":"k2"}]'::jsonb, 1, 'op-2')),
  2, 'yangilash: versiya 2');

-- ============================================================
-- 2. Versiya to'qnashuvi (ikki qurilma)
-- ============================================================
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b1', 'sale', NULL, '[]'::jsonb, 1, 'op-old')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'version_conflict');
SELECT pg_temp.assert_eq((SELECT jsonb_array_length(lines) FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b1'), 2, 'to''qnashuvda ustiga yozilmadi');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b1', 'sale', NULL, '[]'::jsonb, NULL, 'op-nover')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'version_conflict');
-- Mavjud bo'lmagan savatga versiya bilan yozish
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000ff', 'sale', NULL, '[]'::jsonb, 3, 'op-x')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_not_found');

-- ============================================================
-- 3. Ikki mijozga parallel savat; tekshiruvlar
-- ============================================================
SELECT basket_save((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b2', 'sale', 'a1500000-0000-0000-0000-0000000000c2', '[]'::jsonb, NULL, 'op-b2');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM baskets WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA') AND status = 'open'), 2, 'ikki ochiq savat');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b3', 'sale', 'b1500000-0000-0000-0000-0000000000c1', '[]'::jsonb, NULL, 'op-b3')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_partner_invalid');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b3', 'sale', 'a1500000-0000-0000-0000-0000000000a1', '[]'::jsonb, NULL, 'op-b3')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_partner_invalid');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b3', 'sale', NULL, '{"a":1}'::jsonb, NULL, 'op-b3')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_lines_invalid');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b3', 'sale', NULL, '[1,2]'::jsonb, NULL, 'op-b3')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_lines_invalid');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b3', 'sale', NULL, (SELECT jsonb_agg(jsonb_build_object('k', g)) FROM generate_series(1, 201) g), NULL, 'op-b3')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_too_many_lines');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b3', 'kassa', NULL, '[]'::jsonb, NULL, 'op-b3')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_kind_invalid');
-- Kirim savati ta'minotchi bilan
SELECT basket_save((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b4', 'purchase', 'a1500000-0000-0000-0000-0000000000a1', '[]'::jsonb, NULL, 'op-b4');
SELECT pg_temp.assert_eq((SELECT supplier_id FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b4'), 'a1500000-0000-0000-0000-0000000000a1'::uuid, 'kirim savati ta''minotchi bilan');
-- Turini o'zgartirib bo'lmaydi
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b4', 'sale', NULL, '[]'::jsonb, 1, 'op-b4b')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_kind_invalid');

-- ============================================================
-- 4. Ajratish (RLS, boshqa do'kon, OAuth, to'g'ridan-to'g'ri yozish)
-- ============================================================
SELECT pg_temp.as_user('b1500000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM baskets), 0, 'B do''koni A savatlarini ko''rmaydi');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b1', 'sale', NULL, '[]'::jsonb, 2, 'op-hack')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
-- O'z do'koni nomidan boshqa do'kon savat id si bilan
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b1', 'sale', NULL, '[]'::jsonb, 2, 'op-hack2')$$,
  (SELECT v FROM t WHERE k = 'shopB')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT basket_close(%L, 'a1500000-0000-0000-0000-0000000000b1', 'discarded')$$,
  (SELECT v FROM t WHERE k = 'shopB')), 'basket_not_found');
SELECT pg_temp.as_user('a1500000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error($$INSERT INTO baskets (id, shop_id, kind, created_by, updated_by) VALUES (gen_random_uuid(), (SELECT v FROM t WHERE k = 'shopA'), 'sale', auth.uid(), auth.uid())$$, 'permission denied');
SELECT pg_temp.expect_error($$UPDATE baskets SET lines = '[]' WHERE id = 'a1500000-0000-0000-0000-0000000000b1'$$, 'permission denied');
SELECT pg_temp.expect_error($$DELETE FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b1'$$, 'permission denied');
SELECT pg_temp.as_oauth('a1500000-0000-0000-0000-000000000001', 'claude-mcp');
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b9', 'sale', NULL, '[]'::jsonb, NULL, 'op-oauth')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM baskets), 0, 'OAuth token savatlarni o''qimaydi');
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b9', 'sale', NULL, '[]'::jsonb, NULL, 'op-anon')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'not_authenticated');
SELECT pg_temp.as_user('a1500000-0000-0000-0000-000000000001');

-- ============================================================
-- 5. Tasdiqlash: savat jurnalga tushmaydi; savdo post_sale bilan, keyin done
-- ============================================================
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM documents WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 0, 'ochiq savatlar daftarda (documents) yo''q');
SELECT pg_temp.expect_error(format($$SELECT basket_close(%L, 'a1500000-0000-0000-0000-0000000000b1', 'done')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_document_required');
SELECT pg_temp.expect_error(format($$SELECT basket_close(%L, 'a1500000-0000-0000-0000-0000000000b1', 'done', 'a1500000-0000-0000-0000-0000000000ee')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_document_invalid');
INSERT INTO t VALUES ('sale1', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000d1', 'basket:a1500000-0000-0000-0000-0000000000b1', 'a1500000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"},{"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},{"product_name":"momiq","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000));
SELECT basket_close((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b1', 'done', (SELECT v FROM t WHERE k = 'sale1'));
SELECT pg_temp.assert_eq((SELECT status FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b1'), 'done', 'savat done');
SELECT pg_temp.assert_eq((SELECT subtotal FROM documents WHERE id = (SELECT v FROM t WHERE k = 'sale1')), 385000::bigint, 'savatdan savdo jami 385 000 (server qayta hisobladi)');
-- Idempotent yopish
SELECT basket_close((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b1', 'done', (SELECT v FROM t WHERE k = 'sale1'));
SELECT pg_temp.assert_eq(1, 1, 'takror done: xato yo''q');
-- Yopilgan savat o'zgarmaydi
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, 'a1500000-0000-0000-0000-0000000000b1', 'sale', NULL, '[]'::jsonb, 3, 'op-after')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_closed');
SELECT pg_temp.expect_error(format($$SELECT basket_close(%L, 'a1500000-0000-0000-0000-0000000000b1', 'discarded')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_closed');
-- Boshqa savat (Vali) saqlanib turibdi
SELECT pg_temp.assert_eq((SELECT status FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b2'), 'open', 'ikkinchi mijoz savati ochiq qoldi');
-- Boshqa (savatga aloqasiz) savdo hujjati bilan savatni yopib bo'lmaydi
INSERT INTO t VALUES ('saleX', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000dd', 'boshqa-op', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"4000"}]'::jsonb, 4000));
SELECT pg_temp.expect_error(format($$SELECT basket_close(%L, 'a1500000-0000-0000-0000-0000000000b2', 'done', %L)$$,
  (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'saleX')), 'basket_document_invalid');
-- Hujjat id si savat id siga teng bo'lsa (web: savdo id = savat id) — qabul qilinadi (tekshiruv uchun alohida savat)
SELECT basket_save((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b5', 'sale', NULL, '[{"k":1}]'::jsonb, NULL, 'op-b5');
INSERT INTO t VALUES ('saleB5', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b5', 'har-xil-op', NULL, NULL,
  '[{"product_name":"non","qty_milli":"1000","unit":"dona","unit_price":"4000"}]'::jsonb, 4000));
SELECT basket_close((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b5', 'done', (SELECT v FROM t WHERE k = 'saleB5'));
SELECT pg_temp.assert_eq((SELECT status FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b5'), 'done', 'savat id = hujjat id: done');
-- Bekor qilish versiya bilan
SELECT pg_temp.expect_error(format($$SELECT basket_close(%L, 'a1500000-0000-0000-0000-0000000000b2', 'discarded', NULL, 7)$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'version_conflict');
SELECT basket_close((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b2', 'discarded', NULL, 1);
SELECT pg_temp.assert_eq((SELECT status FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b2'), 'discarded', 'savat tashlandi');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM documents WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA') AND client_op_id LIKE 'basket:%'), 1, 'tashlangan savat daftarga tushmadi');

-- Kirim savati: kirim hujjati bilan done
INSERT INTO products (id, shop_id, name, unit) VALUES ('a1500000-0000-0000-0000-0000000000f1', (SELECT v FROM t WHERE k = 'shopA'), 'Un', 'qop');
INSERT INTO t VALUES ('pur1', post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000e1', 'basket:a1500000-0000-0000-0000-0000000000b4', 'a1500000-0000-0000-0000-0000000000a1', current_date,
  '[{"product_id":"a1500000-0000-0000-0000-0000000000f1","qty_milli":"2000","unit_cost":"400000"}]'::jsonb, 800000));
SELECT pg_temp.expect_error(format($$SELECT basket_close(%L, 'a1500000-0000-0000-0000-0000000000b4', 'done', %L)$$,
  (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'sale1')), 'basket_document_invalid');
SELECT basket_close((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000b4', 'done', (SELECT v FROM t WHERE k = 'pur1'));
SELECT pg_temp.assert_eq((SELECT status FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000b4'), 'done', 'kirim savati done');

-- ============================================================
-- 6. Ochiq savatlar chegarasi
-- ============================================================
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..100 LOOP
    PERFORM basket_save((SELECT v FROM t WHERE k = 'shopA'), gen_random_uuid(), 'sale', NULL, '[]'::jsonb, NULL, 'bulk-' || i);
  END LOOP;
END $$;
SELECT pg_temp.expect_error(format($$SELECT basket_save(%L, gen_random_uuid(), 'sale', NULL, '[]'::jsonb, NULL, 'bulk-101')$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'basket_limit');

-- ============================================================
-- 7. B3: AI qoralamasini savatga olish
-- ============================================================
RESET ROLE;
-- Chegaradan qutulish uchun ommaviy savatlarni tashlab yuboramiz (to'g'ridan-to'g'ri, test egasi sifatida)
UPDATE baskets SET status = 'discarded', closed_at = now() WHERE last_op_id LIKE 'bulk-%';
SET ROLE authenticated;
SELECT pg_temp.as_oauth('a1500000-0000-0000-0000-000000000001', 'claude-mcp');
INSERT INTO t VALUES ('dr1', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-1', 'a1500000-0000-0000-0000-0000000000c1',
  'chirmoq 10 ta 13 ming', '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"}]'::jsonb, 130000));
INSERT INTO t VALUES ('dr2', agent_draft_sale((SELECT v FROM t WHERE k = 'shopA'), 'agent-op-2', 'a1500000-0000-0000-0000-0000000000c1',
  'yurak 1 ta', '[{"product_name":"yurak","qty_milli":"1000","unit":"dona","unit_price":"15000"}]'::jsonb, 15000));
-- OAuth token savatga ola olmaydi
SELECT pg_temp.expect_error(format($$SELECT agent_draft_to_basket(%L, %L, 'a1500000-0000-0000-0000-0000000000c9', '[]'::jsonb)$$,
  (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'dr1')), 'oauth_client_forbidden');
SELECT pg_temp.as_user('a1500000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq(
  agent_draft_to_basket((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'dr1'), 'a1500000-0000-0000-0000-0000000000c9',
    '[{"key":"x","productName":"chirmoq","qty":"12","unit":"dona","price":"13 000"}]'::jsonb),
  'a1500000-0000-0000-0000-0000000000c9'::uuid, 'qoralama savatga olindi');
SELECT pg_temp.assert_eq((SELECT status FROM agent_drafts WHERE id = (SELECT v FROM t WHERE k = 'dr1')), 'converted', 'qoralama converted');
SELECT pg_temp.assert_eq((SELECT customer_id FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000c9'), 'a1500000-0000-0000-0000-0000000000c1'::uuid, 'savat qoralama mijozi bilan');
SELECT pg_temp.assert_eq((SELECT source_draft_id FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000c9'), (SELECT v FROM t WHERE k = 'dr1'), 'savat manbasi qoralama');
-- Takror (o'sha savat) — o'sha id; boshqa savat id si bilan — rad
SELECT pg_temp.assert_eq(
  agent_draft_to_basket((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'dr1'), 'a1500000-0000-0000-0000-0000000000c9', '[]'::jsonb),
  'a1500000-0000-0000-0000-0000000000c9'::uuid, 'takror savatga olish idempotent');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_to_basket(%L, %L, gen_random_uuid(), '[]'::jsonb)$$,
  (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'dr1')), 'draft_already_decided');
-- converted qoralamani endi tasdiqlab/rad etib bo'lmaydi
SELECT pg_temp.expect_error(format($$SELECT accept_agent_draft(%L)$$, (SELECT v FROM t WHERE k = 'dr1')), 'draft');
-- Savatda tahrirlangan qatorlar (12 ta) bilan savdo: server qayta hisoblaydi
INSERT INTO t VALUES ('sale2', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000d2', 'basket:a1500000-0000-0000-0000-0000000000c9', 'a1500000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_name":"chirmoq","qty_milli":"12000","unit":"dona","unit_price":"13000"}]'::jsonb, 156000));
SELECT pg_temp.expect_error(format($$SELECT post_sale(%L, gen_random_uuid(), 'op-mismatch', NULL, NULL, '[{"product_name":"chirmoq","qty_milli":"12000","unit":"dona","unit_price":"13000"}]'::jsonb, 155999)$$,
  (SELECT v FROM t WHERE k = 'shopA')), 'calc_mismatch');
SELECT basket_close((SELECT v FROM t WHERE k = 'shopA'), 'a1500000-0000-0000-0000-0000000000c9', 'done', (SELECT v FROM t WHERE k = 'sale2'));
SELECT pg_temp.assert_eq((SELECT subtotal FROM documents WHERE id = (SELECT v FROM t WHERE k = 'sale2')), 156000::bigint, 'tahrirlangan qoralama: 12 × 13 000 = 156 000');
-- Boshqa do'kon qoralamasini ola olmaydi
SELECT pg_temp.as_user('b1500000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT agent_draft_to_basket(%L, %L, gen_random_uuid(), '[]'::jsonb)$$,
  (SELECT v FROM t WHERE k = 'shopB'), (SELECT v FROM t WHERE k = 'dr1')), 'draft_not_found');
-- Qoralama guard: converted savat id siz bo'lmaydi; to'g'ridan-to'g'ri o'zgartirish yo'q
RESET ROLE;
SELECT pg_temp.expect_error(format($$UPDATE agent_drafts SET status = 'converted' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'dr2')), 'draft_invalid_transition');
SELECT pg_temp.expect_error(format($$UPDATE agent_drafts SET status = 'rejected', converted_basket_id = 'a1500000-0000-0000-0000-0000000000c9' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'dr2')), 'draft_invalid_transition');
SELECT pg_temp.expect_error(format($$UPDATE agent_drafts SET payload = '{}' , status = 'converted', converted_basket_id = 'a1500000-0000-0000-0000-0000000000c9' WHERE id = %L$$, (SELECT v FROM t WHERE k = 'dr2')), 'draft_immutable');
SELECT pg_temp.expect_error($$DELETE FROM baskets WHERE id = 'a1500000-0000-0000-0000-0000000000c9'$$, 'basket_delete_forbidden');

DO $$ BEGIN RAISE NOTICE '=== BARCHA 92_savat TESTLARI O''TDI ==='; END $$;
