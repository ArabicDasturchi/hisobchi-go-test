-- Kirim, ta'minotchi to'lovi, oldi-berdi (001..007 qo'llangandan keyin).
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



-- ---------- Tayyorgarlik ----------
SELECT pg_temp.as_user('a6a6a6a6-0000-0000-0000-000000000001');
SET ROLE authenticated;
INSERT INTO t VALUES ('shopA', create_shop('A do''koni'));
SELECT pg_temp.as_user('b6b6b6b6-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('B do''koni'));
INSERT INTO suppliers (id, shop_id, name) VALUES ('b7b7b7b7-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopB'), 'B ta''minotchi');
INSERT INTO products (id, shop_id, name, unit) VALUES ('f7f7f7f7-0000-0000-0000-0000000000b1', (SELECT v FROM t WHERE k = 'shopB'), 'B tovari', 'dona');
SELECT pg_temp.as_user('a6a6a6a6-0000-0000-0000-000000000001');
INSERT INTO suppliers (id, shop_id, name) VALUES ('a7a7a7a7-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Rahim aka');
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f6f6f6f6-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Chirmoq', 'dona', 13000);
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('f6f6f6f6-0000-0000-0000-000000000002', (SELECT v FROM t WHERE k = 'shopA'), 'Yurak', 'dona', 15000);
INSERT INTO customers (id, shop_id, name) VALUES ('c6c6c6c6-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Karim');

-- ---------- 1. Kirim: 100 x 9 000 + 50 x 11 000 = 1 450 000; berildi 1 000 000 -> ostatka 450 000 ----------
INSERT INTO t VALUES ('p1', post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000001', 'pur-1', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2026-10-20',
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"100000","unit_cost":"9000"},
    {"product_id":"f6f6f6f6-0000-0000-0000-000000000002","qty_milli":"50000","unit_cost":"11000"}]'::jsonb, 1450000,
  '2026-10-20 12:00+05', 'naqd', 1000000));
SELECT pg_temp.assert_eq((SELECT subtotal FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'p1')), 1450000::bigint, 'kirim jami 1 450 000');
SELECT pg_temp.assert_eq((SELECT status || ':' || calc_match FROM purchase_documents WHERE id = (SELECT v FROM t WHERE k = 'p1')), 'posted:true'::text, 'kirim posted, hisob mos');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), 450000::bigint, 'ostatka = Eski 0 + Tovar 1 450 000 - Berildi 1 000 000 = 450 000');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f6f6f6f6-0000-0000-0000-000000000001'), 100000::bigint, 'Chirmoq qoldig''i +100');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f6f6f6f6-0000-0000-0000-000000000002'), 50000::bigint, 'Yurak qoldig''i +50');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f6f6f6f6-0000-0000-0000-000000000001'), 9000::bigint, 'tan narx = oxirgi kirim (9 000)');
SELECT pg_temp.assert_eq((SELECT sum(line_total)::bigint FROM purchase_lines WHERE document_id = (SELECT v FROM t WHERE k = 'p1')), 1450000::bigint, 'qator summalari yig''indisi');
SELECT pg_temp.assert_eq((SELECT product_name || ':' || unit FROM purchase_lines WHERE document_id = (SELECT v FROM t WHERE k = 'p1') AND line_index = 0), 'Chirmoq:dona'::text, 'nom va birlik tovardan');
SELECT pg_temp.assert_eq(post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000099', 'pur-1', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1), (SELECT v FROM t WHERE k = 'p1'), 'takror (client_op_id) o''sha kirim');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 1::bigint, 'takror ikkinchi kirim yaratmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM supplier_payments), 1::bigint, 'takror ikkinchi to''lov yaratmadi');
SELECT pg_temp.assert_eq((SELECT sum(qty_milli) FROM stock_movements WHERE product_id = 'f6f6f6f6-0000-0000-0000-000000000001')::bigint, 100000::bigint, 'takror qoldiqni oshirmadi');

-- ---------- 2. Xato holatlar: hech narsa saqlanmaydi ----------
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x1', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"9000"}]'::jsonb, 9001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'calc_mismatch');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x2', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f7f7f7f7-0000-0000-0000-0000000000b1","qty_milli":"1000","unit_cost":"9000"}]'::jsonb, 9000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'product_not_found');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x3', 'b7b7b7b7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"9000"}]'::jsonb, 9000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'supplier_not_in_shop');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x4', 'a7a7a7a7-0000-0000-0000-000000000001', NULL, '[]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'empty_document');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x5', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"-1","unit_cost":"9000"}]'::jsonb, 0)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_qty');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x6', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2031-01-01',
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"9000"}]'::jsonb, 9000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_date');
-- berilgan to'lov ta'minotchi balansidan oshmasin (9 000 kirim + 450 000 eski qarz = 459 000)
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x7', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"9000"}]'::jsonb, 9000, now(), 'naqd', 459001)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_exceeds_debt');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'pur-x8', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"9000"}]'::jsonb, 9000, now(), 'bitkoin', 1000)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_method');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 1::bigint, 'xato kirimlar hujjat qoldirmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM stock_movements WHERE kind = 'purchase'), 2::bigint, 'xato kirimlar ombor harakati qoldirmadi');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f6f6f6f6-0000-0000-0000-000000000001'), 9000::bigint, 'xato kirim tan narxni o''zgartirmadi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), 450000::bigint, 'xatolardan keyin ostatka o''zgarmadi');

-- ---------- 3. Ta'minotchiga to'lov ----------
SELECT record_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000001', 'sp-1', 'a7a7a7a7-0000-0000-0000-000000000001', 200000, 'karta', 'qisman', '2026-11-03 10:00+05');
SELECT pg_temp.assert_eq(record_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000009', 'sp-1', 'a7a7a7a7-0000-0000-0000-000000000001', 200000, 'karta', NULL), 'e6e6e6e6-0000-0000-0000-000000000001'::uuid, 'to''lov idempotent');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), 250000::bigint, 'ostatka 450 000 - 200 000');
SELECT pg_temp.expect_error(format($$SELECT record_supplier_payment(%L, gen_random_uuid(), 'sp-2', 'a7a7a7a7-0000-0000-0000-000000000001', 250001, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'payment_exceeds_debt');
SELECT pg_temp.expect_error(format($$SELECT record_supplier_payment(%L, gen_random_uuid(), 'sp-3', 'a7a7a7a7-0000-0000-0000-000000000001', 0, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_amount');
SELECT void_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000001', 'xato summa');
SELECT void_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000001', 'xato summa');
SELECT pg_temp.assert_eq((SELECT count(*) FROM supplier_payment_voids), 1::bigint, 'to''lov bir marta bekor qilinadi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), 450000::bigint, 'bekor qilingan to''lov qarzga qaytdi');
SELECT record_supplier_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000002', 'sp-4', 'a7a7a7a7-0000-0000-0000-000000000001', 100000, 'naqd', NULL, '2026-11-03 10:00+05');
SELECT pg_temp.expect_error(format($$SELECT void_supplier_payment(%L, 'e6e6e6e6-0000-0000-0000-000000000002', 'ab')$$, (SELECT v FROM t WHERE k = 'shopA')), 'reason_required');

-- ---------- 4. Ikkinchi kirim va oldi-berdi (Eski / Tovar / Jami / Berildi / Ostatka) ----------
SELECT post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000002', 'pur-2', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2026-11-02',
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"30000","unit_cost":"10000"}]'::jsonb, 300000, '2026-11-02 12:00+05');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f6f6f6f6-0000-0000-0000-000000000001'), 10000::bigint, 'tan narx oxirgi kirimga o''zgardi');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), 650000::bigint, 'ostatka 450 000 + 300 000 - 100 000');
SELECT pg_temp.assert_eq((SELECT opening || ',' || goods || ',' || total || ',' || paid || ',' || balance FROM partner_statement((SELECT v FROM t WHERE k = 'shopA'), 'supplier', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2026-11-01', DATE '2026-11-03')),
  '450000,300000,750000,100000,650000'::text, 'ta''minotchi oldi-berdi: Eski 450 000, Tovar 300 000, Jami 750 000, Berildi 100 000, Ostatka 650 000');
SELECT pg_temp.assert_eq((SELECT opening || ',' || goods || ',' || total || ',' || paid || ',' || balance FROM partner_statement((SELECT v FROM t WHERE k = 'shopA'), 'supplier', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2026-10-01', DATE '2026-10-31')),
  '0,1450000,1450000,1000000,450000'::text, 'oktyabr davri: Eski 0, Tovar 1 450 000, Berildi 1 000 000, Ostatka 450 000');
SELECT pg_temp.assert_eq((SELECT balance FROM partner_statement((SELECT v FROM t WHERE k = 'shopA'), 'supplier', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2026-01-01', DATE '2027-01-01')), 650000::bigint, 'to''liq davr ostatkasi = supplier_outstanding');
SELECT pg_temp.expect_error(format($$SELECT * FROM partner_statement(%L, 'supplier', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2026-11-03', DATE '2026-11-01')$$, (SELECT v FROM t WHERE k = 'shopA')), 'invalid_period');

-- Mijoz oldi-berdi (Toshkent sanasi chegarasi bilan)
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000011', 's-old', 'c6c6c6c6-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"chirmoq","qty_milli":"10000","unit":"dona","unit_price":"13000"},{"product_name":"yurak","qty_milli":"5000","unit":"dona","unit_price":"15000"},{"product_name":"boshqa","qty_milli":"20000","unit":"dona","unit_price":"9000"}]'::jsonb, 385000, '2026-10-31 18:59:00+00');
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000012', 's-new', 'c6c6c6c6-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"boshqa","qty_milli":"1000","unit":"dona","unit_price":"30000"}]'::jsonb, 30000, '2026-10-31 20:00:00+00');
SELECT post_sale((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000013', 's-rev', 'c6c6c6c6-0000-0000-0000-000000000001', NULL,
  '[{"product_name":"boshqa","qty_milli":"1000","unit":"dona","unit_price":"7000"}]'::jsonb, 7000, '2026-11-02 10:00+05');
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000013', 'rev-s', 'xato kiritilgan');
SELECT record_payment((SELECT v FROM t WHERE k = 'shopA'), 'e6e6e6e6-0000-0000-0000-000000000011', 'cp-1', 'c6c6c6c6-0000-0000-0000-000000000001', 100000, 'naqd', NULL, '2026-11-02 15:00+05');
SELECT pg_temp.assert_eq((SELECT opening || ',' || goods || ',' || total || ',' || paid || ',' || balance FROM partner_statement((SELECT v FROM t WHERE k = 'shopA'), 'customer', 'c6c6c6c6-0000-0000-0000-000000000001', DATE '2026-11-01', DATE '2026-11-03')),
  '385000,30000,415000,100000,315000'::text, 'mijoz oldi-berdi: 23:59 (Toshkent) Eski, 01:00 Tovar; bekor qilingan savdo hisobga olinmaydi');
SELECT pg_temp.assert_eq((SELECT balance FROM partner_statement((SELECT v FROM t WHERE k = 'shopA'), 'customer', 'c6c6c6c6-0000-0000-0000-000000000001', DATE '2026-01-01', DATE '2027-01-01')), customer_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'c6c6c6c6-0000-0000-0000-000000000001'), 'mijoz to''liq davr ostatkasi = customer_outstanding');

-- ---------- 5. reverse_purchase ----------
SELECT reverse_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000002', 'rp-2', 'noto''g''ri kiritildi');
SELECT reverse_purchase((SELECT v FROM t WHERE k = 'shopA'), 'd6d6d6d6-0000-0000-0000-000000000002', 'rp-2', 'noto''g''ri kiritildi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_reversals), 1::bigint, 'takror bekor qilish idempotent');
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase(%L, 'd6d6d6d6-0000-0000-0000-000000000002', 'rp-3', 'yana bir bor')$$, (SELECT v FROM t WHERE k = 'shopA')), 'already_reversed');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), 350000::bigint, 'bekor qilingan kirim ostatkani qaytardi (650 000 - 300 000)');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f6f6f6f6-0000-0000-0000-000000000001'), 90000::bigint, 'bekor qilingan kirim qoldiqni qaytardi (100 + 30 - 10 savdo - 30)');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f6f6f6f6-0000-0000-0000-000000000001'), 9000::bigint, 'tan narx oldingi kirimdagisiga qaytdi');
SELECT pg_temp.assert_eq((SELECT status FROM purchase_documents WHERE id = 'd6d6d6d6-0000-0000-0000-000000000002'), 'reversed'::text, 'holat reversed');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_lines WHERE document_id = 'd6d6d6d6-0000-0000-0000-000000000002'), 1::bigint, 'asl qatorlar saqlangan');
SELECT reverse_purchase((SELECT v FROM t WHERE k = 'shopA'), (SELECT v FROM t WHERE k = 'p1'), 'rp-1', 'butun kirim xato');
SELECT pg_temp.assert_eq((SELECT cost_price FROM products WHERE id = 'f6f6f6f6-0000-0000-0000-000000000001'), NULL::bigint, 'boshqa kirim qolmasa tan narx NULL');
SELECT pg_temp.assert_eq((SELECT qty_milli FROM product_stock WHERE product_id = 'f6f6f6f6-0000-0000-0000-000000000002'), -5000::bigint, 'Yurak qoldig''i: +50 -5 savdo -50 bekor = -5');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), -1100000::bigint, 'kirimlar bekor: faqat to''lovlar qoldi (ortiqcha to''lov 1 000 000 + 100 000)');

-- ---------- 6. Do'konlar izolyatsiyasi va OAuth ----------
SELECT pg_temp.as_user('b6b6b6b6-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 0::bigint, 'B A ning kirimlarini ko''rmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_lines), 0::bigint, 'B A ning kirim qatorlarini ko''rmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM supplier_payments), 0::bigint, 'B A ning to''lovlarini ko''rmaydi');
SELECT pg_temp.expect_error(format($$SELECT supplier_outstanding(%L, 'a7a7a7a7-0000-0000-0000-000000000001')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT * FROM partner_statement(%L, 'supplier', 'a7a7a7a7-0000-0000-0000-000000000001', DATE '2026-01-01', DATE '2026-12-31')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'b-pur', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase(%L, 'd6d6d6d6-0000-0000-0000-000000000002', 'b-rp', 'hujum qilish')$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
SELECT pg_temp.expect_error(format($$SELECT record_supplier_payment(%L, gen_random_uuid(), 'b-sp', 'a7a7a7a7-0000-0000-0000-000000000001', 1, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'forbidden');
-- B o'z ta'minotchisi bilan ishlaydi, ammo A ning tovari bilan kirim qila olmaydi
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'b-pur2', 'b7b7b7b7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopB')), 'product_not_found');
SELECT post_purchase((SELECT v FROM t WHERE k = 'shopB'), gen_random_uuid(), 'b-pur3', 'b7b7b7b7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f7f7f7f7-0000-0000-0000-0000000000b1","qty_milli":"2000","unit_cost":"500"}]'::jsonb, 1000);
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopB'), 'b7b7b7b7-0000-0000-0000-000000000001'), 1000::bigint, 'B o''z kirimi bilan ishlaydi');

SELECT pg_temp.as_oauth('a6a6a6a6-0000-0000-0000-000000000001', 'claude-test');
SELECT pg_temp.assert_eq((SELECT count(*) FROM purchase_documents), 0::bigint, 'OAuth kirimlarni to''g''ridan-to''g''ri o''qiy olmaydi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM supplier_payments), 0::bigint, 'OAuth to''lovlarni o''qiy olmaydi');
SELECT pg_temp.expect_error(format($$SELECT post_purchase(%L, gen_random_uuid(), 'o-pur', 'a7a7a7a7-0000-0000-0000-000000000001', NULL,
  '[{"product_id":"f6f6f6f6-0000-0000-0000-000000000001","qty_milli":"1000","unit_cost":"1"}]'::jsonb, 1)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT reverse_purchase(%L, 'd6d6d6d6-0000-0000-0000-000000000002', 'o-rp', 'hujum qilish')$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT record_supplier_payment(%L, gen_random_uuid(), 'o-sp', 'a7a7a7a7-0000-0000-0000-000000000001', 1, 'naqd', NULL)$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.expect_error(format($$SELECT void_supplier_payment(%L, 'e6e6e6e6-0000-0000-0000-000000000002', 'hujum qilish')$$, (SELECT v FROM t WHERE k = 'shopA')), 'oauth_client_forbidden');
SELECT pg_temp.assert_eq(supplier_outstanding((SELECT v FROM t WHERE k = 'shopA'), 'a7a7a7a7-0000-0000-0000-000000000001'), -1100000::bigint, 'OAuth faqat o''qiy oladi (balans)');

-- ---------- 7. Append-only va anon ----------
RESET ROLE;
SELECT pg_temp.expect_error($$UPDATE purchase_lines SET qty_milli = 1$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM purchase_reversals$$, 'append-only');
SELECT pg_temp.expect_error($$UPDATE supplier_payments SET amount = 1$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM supplier_payment_voids$$, 'append-only');
SET ROLE authenticated;
SELECT pg_temp.as_user('a6a6a6a6-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error(format($$INSERT INTO purchase_documents (shop_id, supplier_id, status, subtotal, client_op_id, created_by) VALUES (%L, 'a7a7a7a7-0000-0000-0000-000000000001', 'posted', 999, 'direct', auth.uid())$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied');
SELECT pg_temp.expect_error($$UPDATE purchase_documents SET subtotal = 1$$, 'permission denied');
SELECT pg_temp.expect_error(format($$INSERT INTO supplier_payments (id, shop_id, client_op_id, supplier_id, amount, method, created_by) VALUES (gen_random_uuid(), %L, 'direct', 'a7a7a7a7-0000-0000-0000-000000000001', 1, 'naqd', auth.uid())$$, (SELECT v FROM t WHERE k = 'shopA')), 'permission denied');
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_error($$SELECT * FROM purchase_documents$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT supplier_outstanding(gen_random_uuid(), gen_random_uuid())$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT * FROM partner_statement(gen_random_uuid(), 'customer', gen_random_uuid(), DATE '2026-01-01', DATE '2026-01-02')$$, 'permission denied');
RESET ROLE;

\echo '=== KIRIM TESTLARI MUVAFFAQIYATLI ==='
