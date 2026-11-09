-- ============================================================
-- HISOBCHI GO — 012: admin_shop_detail ga to'lov va qoralama SONLARI
-- ============================================================
-- Faqat `admin_shop_detail` qayta yoziladi (CREATE OR REPLACE, imzo o'sha). Eski maydonlar o'zgarmaydi;
-- yangi yuqori daraja kalit `activity`: { payments, supplier_payments, drafts_pending, drafts_accepted }.
-- Faqat sonlar: summa, mijoz/ta'minotchi, qoralama mazmuni qaytmaydi. Qayta ishga tushirish xavfsiz. Talab: 001..011.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_shop_detail(p_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  f record;
  v_daily jsonb;
  v_activity jsonb;
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

  -- Faqat sonlar: to'lov summasi, mijoz va qoralama mazmuni QAYTMAYDI.
  -- Mijoz to'lovlari va ta'minotchiga to'lovlar (bekor qilinganlar sanalmaydi); qoralama: 'draft' = kutayotgan.
  SELECT jsonb_build_object(
    'payments', (SELECT count(*) FROM payments p WHERE p.shop_id = p_shop_id
                   AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id)),
    'supplier_payments', (SELECT count(*) FROM supplier_payments sp WHERE sp.shop_id = p_shop_id
                   AND NOT EXISTS (SELECT 1 FROM supplier_payment_voids v WHERE v.payment_id = sp.id)),
    'drafts_pending', (SELECT count(*) FROM agent_drafts d WHERE d.shop_id = p_shop_id AND d.status = 'draft'),
    'drafts_accepted', (SELECT count(*) FROM agent_drafts d WHERE d.shop_id = p_shop_id AND d.status = 'accepted')
  ) INTO v_activity;

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
    'activity', v_activity,
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

REVOKE ALL ON FUNCTION admin_shop_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_shop_detail(uuid) TO authenticated;
