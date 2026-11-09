-- Platforma admin paneli (011): kirish, maxfiylik, audit, bosqichlar. 001..011 qo'llangandan keyin.
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

-- jsonb obyektning kalitlari (tartiblangan, vergul bilan)
CREATE OR REPLACE FUNCTION pg_temp.keys(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(k, ',' ORDER BY k COLLATE "C") FROM jsonb_object_keys(p) k;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE TEMP TABLE t (k text PRIMARY KEY, v uuid);
CREATE TEMP TABLE r (k text PRIMARY KEY, v jsonb);
GRANT ALL ON t, r TO authenticated, anon;

-- ---------- Foydalanuvchilar (auth.users — superuser sifatida) ----------
INSERT INTO auth.users (id, email, raw_user_meta_data, last_sign_in_at) VALUES
  ('a0a0a0a0-0000-0000-0000-0000000000ad', 'admin@example.test', '{"full_name":"Asoschi"}', now()),
  ('a0a0a0a0-0000-0000-0000-000000000001', 'egasi1@example.test', '{"full_name":"Karim Egasi"}', now() - interval '1 day'),
  ('a0a0a0a0-0000-0000-0000-000000000002', 'egasi2@example.test', '{"full_name":"Salim Egasi"}', now() - interval '20 days'),
  ('a0a0a0a0-0000-0000-0000-000000000003', 'ochilmagan@example.test', '{}', now()),
  ('a0a0a0a0-0000-0000-0000-0000000000ee', 'oddiy@example.test', '{}', now());
INSERT INTO platform_admins (user_id) VALUES ('a0a0a0a0-0000-0000-0000-0000000000ad');

-- ---------- 1. Bo'sh bazada (do'kon yo'q) RPC'lar xatosiz bo'sh qaytaradi ----------
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-0000000000ad');
SET ROLE authenticated;
SELECT pg_temp.assert_eq(is_platform_admin(), true, 'admin ro''yxatda: is_platform_admin = true');
INSERT INTO r VALUES ('ov0', admin_overview());
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v FROM r WHERE k = 'ov0')), 'active_shops_7d,daily,new_shops_30d,new_shops_7d,new_shops_today,sales_today,shops,users', 'boshlang''ich holat: admin_overview kalitlari');
SELECT pg_temp.assert_eq((SELECT (v ->> 'users')::int FROM r WHERE k = 'ov0'), 5, 'bo''sh baza: foydalanuvchilar 5');
SELECT pg_temp.assert_eq((SELECT jsonb_array_length(v -> 'daily') FROM r WHERE k = 'ov0'), 14, 'kunma-kun qator 14 kun');
INSERT INTO r VALUES ('sh0', admin_shops());
SELECT pg_temp.assert_eq((SELECT jsonb_array_length(v -> 'rows') <= (v ->> 'total')::int FROM r WHERE k = 'sh0'), true, 'boshlang''ich holat: admin_shops qatorlar <= total');
INSERT INTO r VALUES ('fn0', admin_funnel());
SELECT pg_temp.assert_eq((SELECT (v -> 'steps' -> 0 ->> 'count')::int FROM r WHERE k = 'fn0'), 5, 'boshlang''ich holat: voronka "ro''yxatdan o''tdi" = 5');
SELECT pg_temp.assert_eq((SELECT (v ->> 'users_without_shop')::int FROM r WHERE k = 'fn0'), 5, 'bo''sh baza: do''kon ochmaganlar 5');
SELECT pg_temp.expect_error($$SELECT admin_shop_detail('00000000-0000-0000-0000-000000000000')$$, 'shop_not_found');
SELECT pg_temp.assert_eq(jsonb_array_length(admin_my_audit()) > 0, true, 'admin_my_audit: o''z harakatlari bor');

-- ---------- 2. Admin bo'lmagan foydalanuvchi hamma admin_* da xato oladi ----------
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-0000000000ee');
SELECT pg_temp.assert_eq(is_platform_admin(), false, 'oddiy foydalanuvchi: is_platform_admin = false');
SELECT pg_temp.expect_error($$SELECT admin_overview()$$, 'not_platform_admin');
SELECT pg_temp.expect_error($$SELECT admin_shops()$$, 'not_platform_admin');
SELECT pg_temp.expect_error($$SELECT admin_shop_detail('00000000-0000-0000-0000-000000000000')$$, 'not_platform_admin');
SELECT pg_temp.expect_error($$SELECT admin_funnel()$$, 'not_platform_admin');
SELECT pg_temp.expect_error($$SELECT admin_my_audit()$$, 'not_platform_admin');
SELECT pg_temp.expect_error($$SELECT admin_shop_stage('00000000-0000-0000-0000-000000000000')$$, 'not_platform_admin');
-- kirmagan (uid yo'q) ham
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.assert_eq(is_platform_admin(), false, 'uid yo''q: is_platform_admin = false');
SELECT pg_temp.expect_error($$SELECT admin_overview()$$, 'not_platform_admin');
-- OAuth/agent tokeni admin foydalanuvchiniki bo'lsa ham admin emas
SELECT pg_temp.as_oauth('a0a0a0a0-0000-0000-0000-0000000000ad', 'agent-client');
SELECT pg_temp.assert_eq(is_platform_admin(), false, 'OAuth token admin emas');
SELECT pg_temp.expect_error($$SELECT admin_overview()$$, 'not_platform_admin');
-- ichki funksiyalar authenticated uchun yopiq
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-0000000000ad');
SELECT pg_temp.expect_error($$SELECT _admin_shop_facts()$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT _admin_gate('x')$$, 'permission denied');
-- jadvallar to'g'ridan-to'g'ri yopiq (admin uchun ham)
SELECT pg_temp.expect_error($$SELECT * FROM platform_admins$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT * FROM admin_audit$$, 'permission denied');
SELECT pg_temp.expect_error($$INSERT INTO platform_admins (user_id) VALUES ('a0a0a0a0-0000-0000-0000-0000000000ee')$$, 'permission denied');
SELECT pg_temp.expect_error($$INSERT INTO admin_audit (admin_id, action) VALUES (auth.uid(), 'soxta')$$, 'permission denied');

-- ---------- 3. anon chaqira olmaydi ----------
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error($$SELECT admin_overview()$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT admin_shops()$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT admin_shop_detail('00000000-0000-0000-0000-000000000000')$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT admin_funnel()$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT admin_my_audit()$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT admin_shop_stage('00000000-0000-0000-0000-000000000000')$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT is_platform_admin()$$, 'permission denied');
RESET ROLE;

-- ---------- 4. Ma'lumot: A do'koni to'liq (6 savdo), B do'koni tovar+ta'minotchi, 3-foydalanuvchi do'konsiz ----------
SET ROLE authenticated;
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-000000000001');
INSERT INTO t VALUES ('shopA', create_shop('Karim savdo'));
INSERT INTO products (id, shop_id, name, unit, last_price) VALUES ('a1a1a1a1-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopA'), 'Chirmoq', 'dona', 13000);
INSERT INTO suppliers (id, shop_id, name, phone) VALUES ('a1a1a1a1-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopA'), 'Maxfiy Taminotchi', '+998900000001');
INSERT INTO customers (id, shop_id, name, phone, notes) VALUES ('a1a1a1a1-0000-0000-0000-0000000000c1', (SELECT v FROM t WHERE k = 'shopA'), 'Maxfiy Mijoz', '+998901234567', 'maxfiy izoh');
INSERT INTO t VALUES ('pur1', post_purchase((SELECT v FROM t WHERE k = 'shopA'), 'a1a1a1a1-0000-0000-0000-0000000000d1', 'pur-1', 'a1a1a1a1-0000-0000-0000-0000000000a1', NULL,
  '[{"product_id":"a1a1a1a1-0000-0000-0000-000000000001","qty_milli":"100000","unit_cost":"9000"}]'::jsonb, 900000));
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..7 LOOP
    PERFORM post_sale((SELECT v FROM t WHERE k = 'shopA'), ('a1a1a1a1-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'sale-' || i,
      'a1a1a1a1-0000-0000-0000-0000000000c1', NULL,
      '[{"product_name":"Chirmoq","qty_milli":"1000","unit":"dona","unit_price":"13000"}]'::jsonb, 13000);
  END LOOP;
END $$;
-- 7 ta savdodan biri bekor qilinadi: sanalmaydi
SELECT reverse_sale((SELECT v FROM t WHERE k = 'shopA'), 'a1a1a1a1-0000-0000-0000-000000000107', 'rev-7', 'xato kiritilgan');

SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-000000000002');
INSERT INTO t VALUES ('shopB', create_shop('Salim do''kon'));
INSERT INTO products (id, shop_id, name, unit) VALUES ('b1b1b1b1-0000-0000-0000-000000000001', (SELECT v FROM t WHERE k = 'shopB'), 'Tovar B', 'dona');
INSERT INTO suppliers (id, shop_id, name) VALUES ('b1b1b1b1-0000-0000-0000-0000000000a1', (SELECT v FROM t WHERE k = 'shopB'), 'B ta''minotchi');

-- Vaqtlarni aniq qilish (bitta tranzaksiyada now() bir xil bo'lishi mumkin): A do'koni 2 kun oldin ochilgan,
-- B ning tovari 3 kun oldin qo'shilgan (A ning savdolari hozir).
RESET ROLE;
UPDATE shops SET created_at = now() - interval '2 days' WHERE id = (SELECT v FROM t WHERE k = 'shopA');
UPDATE products SET created_at = now() - interval '3 days' WHERE shop_id = (SELECT v FROM t WHERE k = 'shopB');
UPDATE suppliers SET created_at = now() - interval '3 days' WHERE shop_id = (SELECT v FROM t WHERE k = 'shopB');
SET ROLE authenticated;

-- ---------- 5. Admin natijalari ----------
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-0000000000ad');
INSERT INTO r VALUES ('ov', admin_overview());
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v FROM r WHERE k = 'ov')), 'active_shops_7d,daily,new_shops_30d,new_shops_7d,new_shops_today,sales_today,shops,users', 'admin_overview kalitlari');
SELECT pg_temp.assert_eq((SELECT (v ->> 'shops')::int FROM r WHERE k = 'ov') - (SELECT (v ->> 'shops')::int FROM r WHERE k = 'ov0'), 2, 'yangi do''konlar 2');
SELECT pg_temp.assert_eq((SELECT (v ->> 'users')::int FROM r WHERE k = 'ov'), 5, 'foydalanuvchilar 5');
SELECT pg_temp.assert_eq((SELECT (v ->> 'new_shops_today')::int FROM r WHERE k = 'ov') - (SELECT (v ->> 'new_shops_today')::int FROM r WHERE k = 'ov0'), 1, 'bugun yangi do''konlar 1 (A 2 kun oldin)');
SELECT pg_temp.assert_eq((SELECT (v ->> 'new_shops_7d')::int FROM r WHERE k = 'ov') - (SELECT (v ->> 'new_shops_7d')::int FROM r WHERE k = 'ov0'), 2, '7 kunda yangi do''konlar 2');
SELECT pg_temp.assert_eq((SELECT (v ->> 'sales_today')::int FROM r WHERE k = 'ov') - (SELECT (v ->> 'sales_today')::int FROM r WHERE k = 'ov0'), 6, 'bugungi savdolar 6 (bekor qilingani sanalmadi)');
SELECT pg_temp.assert_eq((SELECT (v ->> 'active_shops_7d')::int FROM r WHERE k = 'ov') - (SELECT (v ->> 'active_shops_7d')::int FROM r WHERE k = 'ov0'), 2, '7 kunda faol do''konlar 2 (B do''koni tovar qo''shdi)');
SELECT pg_temp.assert_eq((SELECT (v -> 'daily' -> 13 ->> 'sales')::int FROM r WHERE k = 'ov') - (SELECT (v -> 'daily' -> 13 ->> 'sales')::int FROM r WHERE k = 'ov0'), 6, 'kunma-kun: oxirgi kun savdo 6');
SELECT pg_temp.assert_eq((SELECT (v -> 'daily' -> 13 ->> 'new_shops')::int FROM r WHERE k = 'ov') - (SELECT (v -> 'daily' -> 13 ->> 'new_shops')::int FROM r WHERE k = 'ov0'), 1, 'kunma-kun: oxirgi kun yangi do''kon 1');
SELECT pg_temp.assert_eq((SELECT (v -> 'daily' -> 11 ->> 'new_shops')::int FROM r WHERE k = 'ov') - (SELECT (v -> 'daily' -> 11 ->> 'new_shops')::int FROM r WHERE k = 'ov0'), 1, 'kunma-kun: 2 kun oldin yangi do''kon 1');
SELECT pg_temp.assert_eq((SELECT (v -> 'daily' -> 0 ->> 'sales')::int FROM r WHERE k = 'ov'), 0, 'kunma-kun: 14 kun oldin savdo 0');

INSERT INTO r VALUES ('sh', admin_shops(NULL, 50, 0, 'new'));
SELECT pg_temp.assert_eq((SELECT (v ->> 'total')::int FROM r WHERE k = 'sh') - (SELECT (v ->> 'total')::int FROM r WHERE k = 'sh0'), 2, 'admin_shops total +2');
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v FROM r WHERE k = 'sh')), 'rows,total', 'admin_shops kalitlari');
-- qator kalitlari: mijoz/ta'minotchi nomi, telefon, summa maydonlari YO'Q
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v -> 'rows' -> 0 FROM r WHERE k = 'sh')),
  'created_at,customers,id,is_stale,last_activity_at,name,owner_email,owner_name,products,purchases,sales,stage,suppliers', 'admin_shops qator kalitlari (summa/telefon yo''q)');
SELECT pg_temp.assert_eq((SELECT x ->> 'name' FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'id' = (SELECT v::text FROM t WHERE k = 'shopA')), 'Karim savdo', 'A do''kon nomi');
SELECT pg_temp.assert_eq((SELECT x ->> 'owner_name' || '|' || (x ->> 'owner_email') FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'name' = 'Karim savdo'), 'Karim Egasi|egasi1@example.test', 'egasi ismi va emaili ko''rinadi');
SELECT pg_temp.assert_eq((SELECT (x ->> 'sales')::int FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'name' = 'Karim savdo'), 6, 'A: savdolar 6');
SELECT pg_temp.assert_eq((SELECT (x ->> 'purchases')::int FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'name' = 'Karim savdo'), 1, 'A: kirimlar 1');
SELECT pg_temp.assert_eq((SELECT (x ->> 'customers')::int FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'name' = 'Karim savdo'), 1, 'A: mijozlar 1 (tizim mijozi sanalmaydi)');
SELECT pg_temp.assert_eq((SELECT (x ->> 'stage')::int FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'name' = 'Karim savdo'), 6, 'A: bosqich 6 (7 kunda 5+ savdo)');
SELECT pg_temp.assert_eq((SELECT (x ->> 'stage')::int FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'name' = 'Salim do''kon'), 3, 'B: bosqich 3 (tovar + ta''minotchi)');
SELECT pg_temp.assert_eq((SELECT (x ->> 'is_stale')::boolean FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh' AND x ->> 'name' = 'Salim do''kon'), false, 'B: yangi tovar qo''shgan, faolsiz emas');
-- admin_shop_stage ommaviy ta'rif bilan bir xil
SELECT pg_temp.assert_eq(admin_shop_stage((SELECT v FROM t WHERE k = 'shopA')), 6, 'admin_shop_stage(A) = 6');
SELECT pg_temp.assert_eq(admin_shop_stage((SELECT v FROM t WHERE k = 'shopB')), 3, 'admin_shop_stage(B) = 3');
-- qidiruv va tartib
SELECT pg_temp.assert_eq((admin_shops('karim') ->> 'total')::int, 1, 'qidiruv: egasi ismi bo''yicha');
SELECT pg_temp.assert_eq((admin_shops('EGASI2@') ->> 'total')::int, 1, 'qidiruv: email bo''yicha (katta-kichik harf farqsiz)');
SELECT pg_temp.assert_eq((admin_shops('%') ->> 'total')::int, 0, 'qidiruv: % belgisi literal (hammasini qaytarmaydi)');
SELECT pg_temp.assert_eq((admin_shops('example.test', 1, 0, 'activity') -> 'rows' -> 0 ->> 'name'), 'Karim savdo', 'tartib: oxirgi faollik bo''yicha yangisi birinchi (A savdo hozir)');
SELECT pg_temp.assert_eq((admin_shops('example.test', 1, 1, 'activity') -> 'rows' -> 0 ->> 'name'), 'Salim do''kon', 'sahifalash: offset 1');
SELECT pg_temp.assert_eq((admin_shops('example.test', 1, 0, 'new') -> 'rows' -> 0 ->> 'name'), 'Salim do''kon', 'tartib: yangi ochilgan birinchi (B)');
SELECT pg_temp.expect_error($$SELECT admin_shops(NULL, 10, 0, 'summa')$$, 'invalid_sort');

INSERT INTO r VALUES ('dt', admin_shop_detail((SELECT v FROM t WHERE k = 'shopA')));
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v FROM r WHERE k = 'dt')), 'counts,created_at,daily_sales,id,is_stale,last_activity_at,name,owner_email,owner_name,stage,steps', 'admin_shop_detail kalitlari');
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v -> 'counts' FROM r WHERE k = 'dt')), 'customers,products,purchases,sales,sales_7d,suppliers', 'detail counts kalitlari (summa yo''q)');
SELECT pg_temp.assert_eq((SELECT jsonb_array_length(v -> 'daily_sales') FROM r WHERE k = 'dt'), 14, 'detail: 14 kunlik qator');
SELECT pg_temp.assert_eq((SELECT (v -> 'daily_sales' -> 13 ->> 'sales')::int FROM r WHERE k = 'dt'), 6, 'detail: bugun 6 savdo');
SELECT pg_temp.assert_eq((SELECT jsonb_array_length(v -> 'steps') FROM r WHERE k = 'dt'), 5, 'detail: 5 qadam');
SELECT pg_temp.assert_eq((SELECT bool_and(s ->> 'at' IS NOT NULL) FROM r, jsonb_array_elements(v -> 'steps') s WHERE k = 'dt'), true, 'detail: A hamma qadamni bajargan');
INSERT INTO r VALUES ('dtB', admin_shop_detail((SELECT v FROM t WHERE k = 'shopB')));
SELECT pg_temp.assert_eq((SELECT s ->> 'at' IS NULL FROM r, jsonb_array_elements(v -> 'steps') s WHERE k = 'dtB' AND s ->> 'key' = 'sale'), true, 'detail: B birinchi savdo qadami bajarilmagan');
SELECT pg_temp.assert_eq((SELECT s ->> 'at' IS NULL FROM r, jsonb_array_elements(v -> 'steps') s WHERE k = 'dtB' AND s ->> 'key' = 'purchase'), true, 'detail: B kirim qadami bajarilmagan');

INSERT INTO r VALUES ('fn', admin_funnel());
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v FROM r WHERE k = 'fn')), 'shops,steps,stuck,users,users_without_shop', 'admin_funnel kalitlari');
SELECT pg_temp.assert_eq((SELECT string_agg((s ->> 'key') || '=' || ((s ->> 'count')::int - (b ->> 'count')::int), ',' ORDER BY (s ->> 'stage')::int)
  FROM r, jsonb_array_elements(v -> 'steps') s, jsonb_array_elements((SELECT v -> 'steps' FROM r WHERE k = 'fn0')) b
  WHERE k = 'fn' AND s ->> 'key' = b ->> 'key'),
  'registered=0,shop=2,product=2,supplier=2,purchase=1,sale=1,active=1', 'voronka: boshlang''ich holatdan o''sish');
SELECT pg_temp.assert_eq((SELECT bool_and((s ->> 'pct_of_registered')::int = round(100.0 * (s ->> 'count')::int / (v ->> 'users')::int)) FROM r, jsonb_array_elements(v -> 'steps') s WHERE k = 'fn'), true, 'voronka: foizlar sonlardan kelib chiqadi');
SELECT pg_temp.assert_eq((SELECT bool_and((s ->> 'count')::int <= lag_c OR lag_c IS NULL) FROM (SELECT s, lag((s ->> 'count')::int) OVER (ORDER BY (s ->> 'stage')::int) AS lag_c FROM r, jsonb_array_elements(v -> 'steps') s WHERE k = 'fn' AND (s ->> 'stage')::int >= 1) q(s, lag_c)), true, 'voronka: do''kon qadamlari oldingisidan oshmaydi');
SELECT pg_temp.assert_eq((SELECT v -> 'stuck' -> '3' -> 0 ->> 'name' FROM r WHERE k = 'fn'), 'Salim do''kon', '3-bosqichda to''xtagan: B do''koni');
SELECT pg_temp.assert_eq(pg_temp.keys((SELECT v -> 'stuck' -> '3' -> 0 FROM r WHERE k = 'fn')), 'id,name', 'to''xtaganlar ro''yxati: faqat id va nom');
SELECT pg_temp.assert_eq((SELECT (v ->> 'users_without_shop')::int FROM r WHERE k = 'fn'), 3, 'do''kon ochmaganlar 3');

-- 7+ kun faolsiz: B ning tovari 9 kun oldin (egasi 20 kun oldin kirgan) → sariq belgi, bosqich o'zgarmaydi
RESET ROLE;
UPDATE products SET created_at = now() - interval '9 days' WHERE shop_id = (SELECT v FROM t WHERE k = 'shopB');
UPDATE suppliers SET created_at = now() - interval '9 days' WHERE shop_id = (SELECT v FROM t WHERE k = 'shopB');
SET ROLE authenticated;
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-0000000000ad');
INSERT INTO r VALUES ('sh2', admin_shops('example.test'));
SELECT pg_temp.assert_eq((SELECT (x ->> 'is_stale')::boolean FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh2' AND x ->> 'name' = 'Salim do''kon'), true, 'B 9 kun faolsiz: is_stale = true');
SELECT pg_temp.assert_eq((SELECT (x ->> 'is_stale')::boolean FROM r, jsonb_array_elements(v -> 'rows') x WHERE k = 'sh2' AND x ->> 'name' = 'Karim savdo'), false, 'A faol: is_stale = false');
SELECT pg_temp.assert_eq(admin_shop_stage((SELECT v FROM t WHERE k = 'shopB')), 3, 'B bosqichi faolsizlikda o''zgarmaydi (3)');

-- ---------- 6. Maxfiylik: hech bir natijada mijoz/ta'minotchi nomi, telefon, izoh, summa qiymati yo'q ----------
SELECT pg_temp.assert_eq(
  (SELECT bool_or(v::text ~* 'Maxfiy|998901234567|998900000001|izoh') FROM r),
  false, 'natijalarda maxfiy matn va summa qiymatlari yo''q');
SELECT pg_temp.assert_eq(
  (SELECT bool_or(v::text ~* '"(phone|notes|customer|customer_name|supplier_name|amount|subtotal|line_total|total_amount|unit_price|debt|balance|lines)"') FROM r),
  false, 'natijalarda maxfiy kalitlar yo''q');

-- ---------- 7. Audit ----------
RESET ROLE;
SELECT pg_temp.assert_eq((SELECT count(*) FROM admin_audit WHERE admin_id <> 'a0a0a0a0-0000-0000-0000-0000000000ad'), 0::bigint, 'audit: oddiy foydalanuvchi/anon chaqiruvi yozilmadi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM admin_audit WHERE action = 'admin_overview'), 2::bigint, 'audit: admin_overview 2 marta yozildi');
SELECT pg_temp.assert_eq((SELECT count(*) FROM admin_audit WHERE action = 'admin_shop_detail' AND target = (SELECT v::text FROM t WHERE k = 'shopA')), 1::bigint, 'audit: detail targeti do''kon id');
SELECT pg_temp.assert_eq((SELECT bool_and(target IN ('list', 'search') OR target IS NULL OR target ~ '^[0-9a-f-]{36}$') FROM admin_audit), true, 'audit: target faqat id yoki umumiy belgi (qidiruv matni yozilmaydi)');
SELECT pg_temp.assert_eq((SELECT count(*) FROM admin_audit WHERE action = 'admin_shops' AND target = 'search') > 0, true, 'audit: qidiruv "search" deb yozildi');
-- audit append-only
SELECT pg_temp.expect_error($$UPDATE admin_audit SET action = 'x'$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM admin_audit$$, 'append-only');
-- admin_my_audit faqat o'zinikini qaytaradi
SET ROLE authenticated;
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-0000000000ad');
SELECT pg_temp.assert_eq((SELECT bool_and(x ->> 'action' LIKE 'admin_%') FROM jsonb_array_elements(admin_my_audit()) x), true, 'admin_my_audit: harakatlar');
SELECT pg_temp.assert_eq(jsonb_array_length(admin_my_audit(5)), 5, 'admin_my_audit: limit ishlaydi');
SELECT pg_temp.assert_eq(pg_temp.keys(admin_my_audit(1) -> 0), 'action,at,id,target', 'admin_my_audit kalitlari');
RESET ROLE;

-- ---------- 8. Do'kon egasi (admin emas) o'z ma'lumotini boshqalarnikini adminga ochmaydi ----------
SET ROLE authenticated;
SELECT pg_temp.as_user('a0a0a0a0-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq((SELECT count(*) FROM shops), 1::bigint, 'do''kon egasi faqat o''z do''konini ko''radi (admin imtiyozi unga o''tmaydi)');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'BARCHA 80_platform_admin TESTLARI O''TDI'; END $$;
