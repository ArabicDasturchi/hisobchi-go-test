-- ============================================================
-- HISOBCHI GO — 011: platforma admin paneli (faqat o'qish, asoschilar uchun)
-- ============================================================
-- Qo'shimcha migratsiya: mavjud jadval va funksiyalarga tegmaydi. Qayta ishga tushirish xavfsiz. Talab: 001..010.
--
-- Nima qo'shiladi:
--   * platform_admins   : admin foydalanuvchilar ro'yxati. BO'SH yaratiladi, adminlarni asoschi qo'lda qo'shadi (docs/ADMIN.md).
--   * admin_audit       : adminning har RPC chaqiruvi jurnali (append-only).
--   * is_platform_admin(): auth.uid() ro'yxatdami (OAuth/agent tokenlari hech qachon admin emas).
--   * admin_shop_stage  : voronka bosqichi va "faol" ta'rifi — YAGONA joyda.
--   * admin_overview / admin_shops / admin_shop_detail / admin_funnel / admin_my_audit : faqat sonlar va holatlar.
--
-- Maxfiylik: RPC'lar mijoz/ta'minotchi nomi, telefon, savdo qatorlari, summalar, izohlarni QAYTARMAYDI.
-- Do'kon egasining ismi va emaili qaytadi (qo'llab-quvvatlash uchun), telefoni yo'q.
-- Jadvallarga RLS yoqilgan, ruxsat beruvchi siyosat yo'q (faqat RESTRICTIVE *_no_oauth), huquqlar olib tashlangan: o'qish faqat SECURITY DEFINER funksiyalar orqali.
-- ============================================================

-- ---------- 1. Jadvallar ----------
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id  uuid NOT NULL,
  action    text NOT NULL,
  target    text,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_at ON admin_audit (admin_id, at DESC);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;
-- Ruxsat beruvchi siyosat ATAYIN yo'q: to'g'ridan-to'g'ri o'qish/yozish yopiq. Faqat OAuth/agent tokenini
-- rad etuvchi RESTRICTIVE `<jadval>_no_oauth` siyosati bor (007 dagi naqsh; 20_agent_mcp testi shuni talab qiladi).
DROP POLICY IF EXISTS platform_admins_no_oauth ON platform_admins;
CREATE POLICY platform_admins_no_oauth ON platform_admins AS RESTRICTIVE FOR ALL
  USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token());
DROP POLICY IF EXISTS admin_audit_no_oauth ON admin_audit;
CREATE POLICY admin_audit_no_oauth ON admin_audit AS RESTRICTIVE FOR ALL
  USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token());
REVOKE ALL ON platform_admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON admin_audit FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_admin_audit_append_only ON admin_audit;
CREATE TRIGGER trg_admin_audit_append_only BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();

-- ---------- 2. Kirish tekshiruvi ----------
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT is_oauth_client_token()
     AND EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id = auth.uid());
$$;

-- Ichki: admin bo'lmasa xato; bo'lsa auditga yozadi. Target — do'kon id yoki umumiy belgi, shaxsiy ma'lumot EMAS.
CREATE OR REPLACE FUNCTION _admin_gate(p_action text, p_target text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;
  INSERT INTO admin_audit (admin_id, action, target) VALUES (auth.uid(), p_action, p_target);
  RETURN auth.uid();
END;
$$;

-- ---------- 3. Voronka bosqichi (YAGONA ta'rif) ----------
-- 1 do'kon yaratdi · 2 tovar qo'shdi · 3 ta'minotchi qo'shdi · 4 kirim yozdi · 5 birinchi savdo · 6 faol (oxirgi 7 kunda 5+ savdo)
-- Bosqich = erishilgan ENG YUQORI qadam. "Faol" bosqich joriy holat: savdo to'xtasa 5 ga qaytadi.
CREATE OR REPLACE FUNCTION _admin_stage_of(p_has_product boolean, p_has_supplier boolean, p_has_purchase boolean, p_has_sale boolean, p_sales_7d bigint)
RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_has_sale AND p_sales_7d >= 5 THEN 6
    WHEN p_has_sale THEN 5
    WHEN p_has_purchase THEN 4
    WHEN p_has_supplier THEN 3
    WHEN p_has_product THEN 2
    ELSE 1
  END;
$$;

-- Ichki: har do'kon uchun sonlar va sanalar (hech qanday mijoz/ta'minotchi nomi, summa yo'q).
-- Savdo = documents.status = 'posted' (bekor qilingan 'reversed' sanalmaydi). Kirim = purchase_documents (kind='purchase', 'posted').
CREATE OR REPLACE FUNCTION _admin_shop_facts()
RETURNS TABLE (
  shop_id uuid, shop_name text, shop_created_at timestamptz,
  owner_name text, owner_email text, owner_last_sign_in timestamptz,
  products_count bigint, customers_count bigint, suppliers_count bigint, sales_count bigint, purchases_count bigint,
  first_product_at timestamptz, first_supplier_at timestamptz, first_purchase_at timestamptz, first_sale_at timestamptz,
  sales_7d bigint, last_activity_at timestamptz, stage int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      s.id AS shop_id, s.name AS shop_name, s.created_at AS shop_created_at,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') AS owner_name,
      u.email::text AS owner_email, u.last_sign_in_at AS owner_last_sign_in,
      pr.n AS products_count, cu.n AS customers_count, su.n AS suppliers_count,
      d.n AS sales_count, pu.n AS purchases_count,
      pr.first_at AS first_product_at, su.first_at AS first_supplier_at,
      pu.first_at AS first_purchase_at, d.first_at AS first_sale_at,
      d.n7 AS sales_7d,
      greatest(d.last_at, pu.last_at, pr.last_at, pay.last_at, spay.last_at, u.last_sign_in_at) AS last_activity_at
    FROM shops s
    LEFT JOIN LATERAL (SELECT m.user_id FROM shop_members m WHERE m.shop_id = s.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) o ON true
    LEFT JOIN auth.users u ON u.id = o.user_id
    LEFT JOIN LATERAL (SELECT count(*) AS n, min(p.created_at) AS first_at, max(p.created_at) AS last_at FROM products p WHERE p.shop_id = s.id) pr ON true
    LEFT JOIN LATERAL (SELECT count(*) AS n FROM customers c WHERE c.shop_id = s.id AND c.kind = 'regular') cu ON true
    LEFT JOIN LATERAL (SELECT count(*) AS n, min(x.created_at) AS first_at FROM suppliers x WHERE x.shop_id = s.id) su ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS n,
             min(coalesce(dd.posted_at, dd.created_at)) AS first_at,
             max(coalesce(dd.posted_at, dd.created_at)) AS last_at,
             count(*) FILTER (WHERE coalesce(dd.posted_at, dd.created_at) >= now() - interval '7 days') AS n7
      FROM documents dd WHERE dd.shop_id = s.id AND dd.status = 'posted'
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS n, min(coalesce(pd.posted_at, pd.created_at)) AS first_at, max(coalesce(pd.posted_at, pd.created_at)) AS last_at
      FROM purchase_documents pd WHERE pd.shop_id = s.id AND pd.status = 'posted' AND pd.kind = 'purchase'
    ) pu ON true
    LEFT JOIN LATERAL (SELECT max(pm.created_at) AS last_at FROM payments pm WHERE pm.shop_id = s.id) pay ON true
    LEFT JOIN LATERAL (SELECT max(sp.created_at) AS last_at FROM supplier_payments sp WHERE sp.shop_id = s.id) spay ON true
  )
  SELECT b.shop_id, b.shop_name, b.shop_created_at, b.owner_name, b.owner_email, b.owner_last_sign_in,
         b.products_count, b.customers_count, b.suppliers_count, b.sales_count, b.purchases_count,
         b.first_product_at, b.first_supplier_at, b.first_purchase_at, b.first_sale_at,
         b.sales_7d, b.last_activity_at,
         _admin_stage_of(b.products_count > 0, b.suppliers_count > 0, b.purchases_count > 0, b.sales_count > 0, b.sales_7d)
  FROM base b;
$$;

-- Ochiq (admin tekshiruvi bilan) bosqich funksiyasi: bitta do'kon uchun. Ommaviy so'rovlar shu ta'rifni _admin_stage_of orqali oladi.
CREATE OR REPLACE FUNCTION admin_shop_stage(p_shop_id uuid)
RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage int;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;
  SELECT f.stage INTO v_stage FROM _admin_shop_facts() f WHERE f.shop_id = p_shop_id;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'shop_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_stage;
END;
$$;

-- ---------- 4. admin_overview ----------
-- Kunlar Asia/Tashkent bo'yicha. p_days — kunma-kun qator uzunligi (standart 14, 1..90).
CREATE OR REPLACE FUNCTION admin_overview(p_days int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days int := least(greatest(coalesce(p_days, 14), 1), 90);
  v_today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  v_result jsonb;
BEGIN
  PERFORM _admin_gate('admin_overview');

  SELECT jsonb_build_object(
    'shops',             (SELECT count(*) FROM shops),
    'users',             (SELECT count(*) FROM auth.users),
    'new_shops_today',   (SELECT count(*) FROM shops WHERE (created_at AT TIME ZONE 'Asia/Tashkent')::date = v_today),
    'new_shops_7d',      (SELECT count(*) FROM shops WHERE created_at >= now() - interval '7 days'),
    'new_shops_30d',     (SELECT count(*) FROM shops WHERE created_at >= now() - interval '30 days'),
    'sales_today',       (SELECT count(*) FROM documents WHERE status = 'posted'
                            AND (coalesce(posted_at, created_at) AT TIME ZONE 'Asia/Tashkent')::date = v_today),
    'active_shops_7d',   (SELECT count(*) FROM _admin_shop_facts() f WHERE f.last_activity_at >= now() - interval '7 days'),
    'daily', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'day', g.day,
               'new_shops', (SELECT count(*) FROM shops s WHERE (s.created_at AT TIME ZONE 'Asia/Tashkent')::date = g.day),
               'sales', (SELECT count(*) FROM documents dd WHERE dd.status = 'posted'
                           AND (coalesce(dd.posted_at, dd.created_at) AT TIME ZONE 'Asia/Tashkent')::date = g.day)
             ) ORDER BY g.day), '[]'::jsonb)
      FROM (SELECT (v_today - n)::date AS day FROM generate_series(v_days - 1, 0, -1) AS n) g
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------- 5. admin_shops ----------
-- p_sort: 'activity' (oxirgi faollik, yangidan eskiga; faolsizlar oxirda) yoki 'new' (yangi ochilgan).
-- Qaytadi: { total, rows:[{ ... }] }. Qidiruv do'kon nomi, egasining ismi yoki emaili bo'yicha (audit'ga qidiruv matni YOZILMAYDI).
CREATE OR REPLACE FUNCTION admin_shops(p_search text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_sort text DEFAULT 'activity')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_pattern text;
  v_result jsonb;
BEGIN
  PERFORM _admin_gate('admin_shops', CASE WHEN nullif(btrim(p_search), '') IS NULL THEN 'list' ELSE 'search' END);
  IF p_sort IS NOT NULL AND p_sort NOT IN ('activity', 'new') THEN
    RAISE EXCEPTION 'invalid_sort' USING ERRCODE = '22023';
  END IF;
  v_pattern := CASE WHEN nullif(btrim(p_search), '') IS NULL THEN NULL
                    ELSE '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  WITH f AS (
    SELECT * FROM _admin_shop_facts() x
    WHERE v_pattern IS NULL
       OR x.shop_name ILIKE v_pattern OR x.owner_email ILIKE v_pattern OR x.owner_name ILIKE v_pattern
  ), page AS (
    SELECT * FROM f
    ORDER BY CASE WHEN coalesce(p_sort, 'activity') = 'new' THEN f.shop_created_at END DESC NULLS LAST,
             CASE WHEN coalesce(p_sort, 'activity') = 'activity' THEN f.last_activity_at END DESC NULLS LAST,
             f.shop_created_at DESC, f.shop_id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', p.shop_id,
        'name', p.shop_name,
        'owner_name', p.owner_name,
        'owner_email', p.owner_email,
        'created_at', p.shop_created_at,
        'last_activity_at', p.last_activity_at,
        'is_stale', coalesce(p.last_activity_at, p.shop_created_at) < now() - interval '7 days',
        'products', p.products_count,
        'customers', p.customers_count,
        'suppliers', p.suppliers_count,
        'sales', p.sales_count,
        'purchases', p.purchases_count,
        'stage', p.stage
      )) FROM (SELECT * FROM page ORDER BY
                 CASE WHEN coalesce(p_sort, 'activity') = 'new' THEN page.shop_created_at END DESC NULLS LAST,
                 CASE WHEN coalesce(p_sort, 'activity') = 'activity' THEN page.last_activity_at END DESC NULLS LAST,
                 page.shop_created_at DESC, page.shop_id) p), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------- 6. admin_shop_detail ----------
-- Savdo summasi ko'rsatilmaydi (QAROR: summa maxfiy): faqat soni. Oxirgi 14 kun kunma-kun.
CREATE OR REPLACE FUNCTION admin_shop_detail(p_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  f record;
  v_daily jsonb;
BEGIN
  PERFORM _admin_gate('admin_shop_detail', p_shop_id::text);

  SELECT * INTO f FROM _admin_shop_facts() x WHERE x.shop_id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'day', g.day,
           'sales', (SELECT count(*) FROM documents dd WHERE dd.shop_id = p_shop_id AND dd.status = 'posted'
                       AND (coalesce(dd.posted_at, dd.created_at) AT TIME ZONE 'Asia/Tashkent')::date = g.day)
         ) ORDER BY g.day), '[]'::jsonb)
  INTO v_daily
  FROM (SELECT (v_today - n)::date AS day FROM generate_series(13, 0, -1) AS n) g;

  RETURN jsonb_build_object(
    'id', f.shop_id,
    'name', f.shop_name,
    'owner_name', f.owner_name,
    'owner_email', f.owner_email,
    'created_at', f.shop_created_at,
    'last_activity_at', f.last_activity_at,
    'is_stale', coalesce(f.last_activity_at, f.shop_created_at) < now() - interval '7 days',
    'stage', f.stage,
    'counts', jsonb_build_object(
      'products', f.products_count, 'customers', f.customers_count, 'suppliers', f.suppliers_count,
      'sales', f.sales_count, 'purchases', f.purchases_count, 'sales_7d', f.sales_7d),
    'daily_sales', v_daily,
    'steps', jsonb_build_array(
      jsonb_build_object('key', 'shop',     'at', f.shop_created_at),
      jsonb_build_object('key', 'product',  'at', f.first_product_at),
      jsonb_build_object('key', 'supplier', 'at', f.first_supplier_at),
      jsonb_build_object('key', 'purchase', 'at', f.first_purchase_at),
      jsonb_build_object('key', 'sale',     'at', f.first_sale_at))
  );
END;
$$;

-- ---------- 7. admin_funnel ----------
-- steps: registered (barcha foydalanuvchi), 1..6 bosqichlarga yetgan do'konlar soni (stage >= n), foizlar butun son.
-- stuck: har bosqichda TO'XTAGAN (stage = n) do'konlar: faqat id va nom (6 — faol, to'xtamagan). users_without_shop — do'kon ochmaganlar soni.
CREATE OR REPLACE FUNCTION admin_funnel()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM _admin_gate('admin_funnel');

  WITH t AS (
    SELECT f.shop_id, f.shop_name, f.stage, f.shop_created_at FROM _admin_shop_facts() f
  ), u AS (
    SELECT count(*) AS n FROM auth.users
  ), k AS (
    SELECT 0 AS stage, 'registered'::text AS key, (SELECT n FROM u) AS cnt
    UNION ALL SELECT 1, 'shop',     (SELECT count(*) FROM t WHERE stage >= 1)
    UNION ALL SELECT 2, 'product',  (SELECT count(*) FROM t WHERE stage >= 2)
    UNION ALL SELECT 3, 'supplier', (SELECT count(*) FROM t WHERE stage >= 3)
    UNION ALL SELECT 4, 'purchase', (SELECT count(*) FROM t WHERE stage >= 4)
    UNION ALL SELECT 5, 'sale',     (SELECT count(*) FROM t WHERE stage >= 5)
    UNION ALL SELECT 6, 'active',   (SELECT count(*) FROM t WHERE stage >= 6)
  ), s AS (
    SELECT k.stage, k.key, k.cnt, lag(k.cnt) OVER (ORDER BY k.stage) AS prev FROM k
  )
  SELECT jsonb_build_object(
    'users', (SELECT n FROM u),
    'shops', (SELECT count(*) FROM t),
    'users_without_shop', (SELECT count(*) FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM shop_members m WHERE m.user_id = au.id AND m.role = 'owner')),
    'steps', (SELECT jsonb_agg(jsonb_build_object(
                'key', s.key, 'stage', s.stage, 'count', s.cnt,
                'pct_of_registered', CASE WHEN (SELECT n FROM u) > 0 THEN round(100.0 * s.cnt / (SELECT n FROM u))::int ELSE 0 END,
                'pct_of_prev', CASE WHEN s.prev > 0 THEN round(100.0 * s.cnt / s.prev)::int ELSE 0 END
              ) ORDER BY s.stage) FROM s),
    'stuck', (SELECT jsonb_object_agg(g.n::text,
                coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.shop_id, 'name', x.shop_name) ORDER BY x.shop_created_at DESC)
                          FROM (SELECT * FROM t WHERE t.stage = g.n ORDER BY t.shop_created_at DESC LIMIT 200) x), '[]'::jsonb))
              FROM generate_series(1, 5) AS g(n))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------- 8. admin_my_audit ----------
-- Adminning O'Z harakatlari (oxirgi p_limit, standart 100, eng ko'pi 100).
CREATE OR REPLACE FUNCTION admin_my_audit(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid;
BEGIN
  v_admin := _admin_gate('admin_my_audit');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'target', a.target, 'at', a.at) ORDER BY a.at DESC, a.id)
    FROM (SELECT * FROM admin_audit WHERE admin_id = v_admin ORDER BY at DESC, id LIMIT least(greatest(coalesce(p_limit, 100), 1), 100)) a
  ), '[]'::jsonb);
END;
$$;

-- ---------- 9. Huquqlar ----------
-- Ichki funksiyalar hech kimga ochilmaydi (ularni faqat definer funksiyalar chaqiradi).
REVOKE ALL ON FUNCTION _admin_gate(text, text), _admin_stage_of(boolean, boolean, boolean, boolean, bigint), _admin_shop_facts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION is_platform_admin(), admin_shop_stage(uuid), admin_overview(int), admin_shops(text, int, int, text),
  admin_shop_detail(uuid), admin_funnel(), admin_my_audit(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_platform_admin(), admin_shop_stage(uuid), admin_overview(int), admin_shops(text, int, int, text),
  admin_shop_detail(uuid), admin_funnel(), admin_my_audit(int) TO authenticated;
