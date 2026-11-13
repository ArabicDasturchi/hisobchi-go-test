-- 016: tuzatish va bekor qilish (F3) — audit izi, kirimni to'lovi bilan bekor qilish, qarz va ombor tiklanishi.
-- 001..013 va 016 qo'llangandan keyin (014/015 ixtiyoriy).
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
SELECT pg_temp.as_user('a1600000-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b1600000-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
SELECT pg_temp.as_user('a1600000-0000-0000-0000-000000000001');
INSERT INTO customers (id, shop_id, name, phone) VALUES ('a1600000-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shopA'), 'Ali', '+998901112233');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a1600000-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopA'), 'Rahim aka');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('a1600000-0000-0000-0000-0000000000f1', (SELECT v FROM t WHERE k = 'shopA'), 'Chirmoq', 'dona', 13000);

-- ============================================================
-- 1. Katalog tuzatishi auditda (kim, qachon, nima); telefon qiymati yozilmaydi
-- ============================================================
UPDATE products SET last_price = 14000, name = 'Chirmoq katta' WHERE id = 'a1600000-0000-0000-0000-0000000000f1';
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log WHERE entity_id = 'a1600000-0000-0000-0000-0000000000f1' AND action = 'product_updated'), 1, 'tovar tuzatishi auditda');
SELECT pg_temp.assert_eq((SELECT details #>> '{changes,last_price,from}' FROM audit_log WHERE action = 'product_updated'), '13000', 'eski narx yozildi');
SELECT pg_temp.assert_eq((SELECT details #>> '{changes,last_price,to}' FROM audit_log WHERE action = 'product_updated'), '14000', 'yangi narx yozildi');
SELECT pg_temp.assert_eq((SELECT details #>> '{changes,name,to}' FROM audit_log WHERE action = 'product_updated'), 'Chirmoq katta', 'yangi nom yozildi');
SELECT pg_temp.assert_eq((SELECT user_id FROM audit_log WHERE action = 'product_updated'), 'a1600000-0000-0000-0000-000000000001'::uuid, 'kim tuzatgani yozildi');
-- O'zgarishsiz UPDATE yozuv yaratmaydi
UPDATE products SET last_price = 14000 WHERE id = 'a1600000-0000-0000-0000-0000000000f1';
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log WHERE action = 'product_updated'), 1, 'o''zgarishsiz tahrir yozilmaydi');
UPDATE customers SET phone = '+998907778899', name = 'Ali aka' WHERE id = 'a1600000-0000-0000-0000-0000000000c1';
SELECT pg_temp.assert_eq((SELECT details #>> '{changes,phone,changed}' FROM audit_log WHERE action = 'customer_updated'), 'true', 'telefon o''zgargani belgilandi');
SELECT pg_temp.assert_eq((SELECT position('998' IN details::text) FROM audit_log WHERE action = 'customer_updated'), 0, 'telefon raqami auditga yozilmadi');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log WHERE action = 'customer_created'), 1, 'mijoz yaratilishi yozildi');

-- Audit faqat qo'shiladi: klient yoza/o'zgartira/o'chira olmaydi
SELECT pg_temp.expect_error(format($$INSERT INTO audit_log (shop_id, action) VALUES (%L, 'soxta')$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied|row-level security');
SELECT pg_temp.expect_error($$UPDATE audit_log SET action = 'x'$$, 'permission denied');
SELECT pg_temp.expect_error($$DELETE FROM audit_log$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT audit_write(NULL, 'x', NULL, NULL, '{}')$$, 'permission denied');
-- Boshqa do'kon ko'rmaydi; OAuth token o'qimaydi
SELECT pg_temp.as_user('b1600000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 0, 'B do''koni A auditini ko''rmaydi');
SELECT pg_temp.as_oauth('a1600000-0000-0000-0000-000000000001', 'claude-mcp');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log), 0, 'OAuth token auditni o''qimaydi');
SELECT pg_temp.as_user('a1600000-0000-0000-0000-000000000001');

-- ============================================================
-- 2. Bekor qilingan savdo: qarz va ombor qoldig'i to'g'ri qaytadi; auditda sabab bilan
-- ============================================================
SELECT adjust_stock((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000f1', 'adj-1', 50000, 'boshlang''ich qoldiq');
SELECT pg_temp.assert_eq((SELECT details ->> 'reason' FROM audit_log WHERE action = 'stock_adjusted'), 'boshlang''ich qoldiq', 'ombor tuzatishi sabab bilan auditda');
INSERT INTO t VALUES ('s1', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000d1', 'op-s1', 'a1600000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_id":"a1600000-0000-0000-0000-0000000000f1","product_name":"Chirmoq katta","qty_milli":"10000","unit":"dona","unit_price":"13000"}]'::jsonb, 130000));
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000c1'), 130000::bigint, 'savdodan keyin qarz 130 000');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'a1600000-0000-0000-0000-0000000000f1'), 40000::bigint, 'savdodan keyin qoldiq 40');
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 's1'), 'rev-s1', 'narx xato yozilgan');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000c1'), 0::bigint, 'bekor qilingach qarz 0');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'a1600000-0000-0000-0000-0000000000f1'), 50000::bigint, 'bekor qilingach qoldiq 50 ga qaytdi');
SELECT pg_temp.assert_eq((SELECT details ->> 'reason' FROM audit_log WHERE action = 'sale_reversed' AND entity_id = (SELECT v FROM t WHERE k = 's1')), 'narx xato yozilgan', 'savdo bekor qilinishi sabab bilan auditda');
-- Qayta yozish (to'g'ri narx bilan) — yangi hujjat, eski teskari yozuv saqlanadi
INSERT INTO t VALUES ('s2', post_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000d2', 'op-s2', 'a1600000-0000-0000-0000-0000000000c1', NULL,
  '[{"product_id":"a1600000-0000-0000-0000-0000000000f1","product_name":"Chirmoq katta","qty_milli":"10000","unit":"dona","unit_price":"14000"}]'::jsonb, 140000));
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000c1'), 140000::bigint, 'qayta yozilgan savdo: qarz 140 000');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM documents WHERE shop_id = (SELECT v FROM t WHERE k = 'shopA')), 2, 'eski hujjat o''chirilmadi (append-only)');

-- To'lov bekor qilinishi auditda
INSERT INTO t VALUES ('pay1', record_payment((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000e1', 'op-pay1', 'a1600000-0000-0000-0000-0000000000c1', 40000, 'naqd', NULL));
SELECT void_payment((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pay1'), 'xato yozilgan');
SELECT pg_temp.assert_eq((SELECT details ->> 'amount' FROM audit_log WHERE action = 'payment_voided'), '40000', 'to''lov bekor qilinishi summa bilan auditda');
SELECT pg_temp.assert_eq(customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000c1'), 140000::bigint, 'bekor qilingan to''lov qarzga qaytdi');

-- ============================================================
-- 3. Kirimni to'lovi bilan bekor qilish: ta'minotchiga ortiqcha to'lov qolmaydi
-- ============================================================
INSERT INTO t VALUES ('pur1', post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000b1', 'op-pur1', 'a1600000-0000-0000-0000-0000000000a1', current_date,
  '[{"product_id":"a1600000-0000-0000-0000-0000000000f1","qty_milli":"20000","unit_cost":"10000"}]'::jsonb, 200000, now(), 'naqd', 150000));
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000a1'), 50000::bigint, 'kirim 200 000, to''landi 150 000: qarz 50 000');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'a1600000-0000-0000-0000-0000000000f1'), 60000::bigint, 'kirimdan keyin qoldiq 60');
-- ESKI XATTI-HARAKAT: oddiy reverse_purchase to'lovni qoldiradi
INSERT INTO t VALUES ('pur0', post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000b0', 'op-pur0', 'a1600000-0000-0000-0000-0000000000a1', current_date,
  '[{"product_id":"a1600000-0000-0000-0000-0000000000f1","qty_milli":"1000","unit_cost":"10000"}]'::jsonb, 10000, now(), 'naqd', 10000));
SELECT reverse_purchase((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur0'), 'rev-pur0', 'eski yo''l');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000a1'), 40000::bigint, 'reverse_purchase: to''lov qoladi, qarz 10 000 ga kamaydi (muammo tasdiqlandi)');
-- Yangi yo'l: kirim va uning to'lovi birga bekor
SELECT reverse_purchase_with_payments((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur1'), 'rev-pur1', 'tovar qaytarildi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000a1'), (-10000)::bigint, 'kirim + to''lovi bekor: faqat eski yo''l qoldirgan −10 000 kredit qoldi');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'a1600000-0000-0000-0000-0000000000f1'), 40000::bigint, 'kirim bekor: qoldiq 40 ga qaytdi');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM supplier_payment_voids v JOIN supplier_payments p ON p.id = v.payment_id WHERE p.client_op_id = 'purchase-pay:op-pur1'), 1, 'kirim to''lovi bekor qilindi');
-- Idempotent
SELECT reverse_purchase_with_payments((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur1'), 'rev-pur1', 'tovar qaytarildi');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM supplier_payment_voids), 1, 'takror: to''lov ikki marta bekor qilinmadi');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM purchase_reversals WHERE document_id = (SELECT v FROM t WHERE k = 'pur1')), 1, 'takror: teskari yozuv bitta');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log WHERE action = 'purchase_reversed'), 2, 'ikkala kirim bekor qilinishi auditda');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log WHERE action = 'supplier_payment_voided'), 1, 'kirim to''lovi bekor qilinishi auditda');
SELECT pg_temp.assert_eq((SELECT count(*)::int FROM audit_log WHERE action = 'product_updated'), 1, 'kirim tan narxni avtomatik yangilashi tarixni to''ldirmaydi (faqat qo''lda tuzatish)');
-- p_void_payment = false: to'lov kredit sifatida qoladi
INSERT INTO t VALUES ('pur2', post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000b2', 'op-pur2', 'a1600000-0000-0000-0000-0000000000a1', current_date,
  '[{"product_id":"a1600000-0000-0000-0000-0000000000f1","qty_milli":"3000","unit_cost":"10000"}]'::jsonb, 30000, now(), 'naqd', 10000));
SELECT reverse_purchase_with_payments((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur2'), 'rev-pur2', 'kredit qolsin', false);
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000a1'), (-20000)::bigint, 'to''lovsiz bekor: to''lov kredit bo''lib qoldi');
-- Sabab majburiy, takror bekor qilish rad; boshqa do'kon; OAuth
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase_with_payments(%L, %L, 'rev-x', 'qayta')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur0')), 'already_reversed');
INSERT INTO t VALUES ('pur3', post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'a1600000-0000-0000-0000-0000000000b3', 'op-pur3', 'a1600000-0000-0000-0000-0000000000a1', current_date,
  '[{"product_id":"a1600000-0000-0000-0000-0000000000f1","qty_milli":"1000","unit_cost":"10000"}]'::jsonb, 10000));
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase_with_payments(%L, %L, 'rev-y', 'ab')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur3')), 'reason_required');
SELECT pg_temp.as_user('b1600000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase_with_payments(%L, %L, 'rev-hack', 'buzish')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur3')), 'forbidden');
SELECT pg_temp.as_oauth('a1600000-0000-0000-0000-000000000001', 'claude-mcp');
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase_with_payments(%L, %L, 'rev-o', 'buzish')$$, (SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'pur3')), 'oauth_client_forbidden');

DO $$ BEGIN RAISE NOTICE '=== BARCHA 93_audit_tuzatish TESTLARI O''TDI ==='; END $$;
