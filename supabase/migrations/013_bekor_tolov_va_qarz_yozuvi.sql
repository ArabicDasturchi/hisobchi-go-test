-- ============================================================
-- HISOBCHI GO — 013: savdoni to'lovi bilan bekor qilish (W1) va ta'minotchiga tovarsiz qarz yozuvi (W2)
-- ============================================================
-- W1 muammo: doimiy mijozning to'langan savdosi `reverse_sale` bilan bekor qilinsa, to'lov joyida qoladi
--   (faqat bir martalik mijoz to'lovi avtomatik bekor qilinadi). Mijoz qarzi manfiy bo'lib qoladi, kassa esa
--   pulni saqlab turadi; "Qayta yozish" yangi to'lov yozsa, kassa ikki marta sanaladi. Veb ikki alohida RPC
--   (reverse_sale + void_payment) bilan qilsa, orada uzilish yarim holat qoldiradi.
-- W1 yechim: `reverse_sale_with_payments` — savdoni bekor qilish va tanlangan to'lovlarni bekor qilish BITTA
--   tranzaksiyada. Mavjud `reverse_sale` va `void_payment` qayta ishlatiladi (mantiq takrorlanmaydi), ularning
--   imzosi o'zgarmaydi (mobil va MCP buzilmaydi). To'lovlar aniq id bilan beriladi (savdogar ko'rib tasdiqlaydi):
--   hammasi shu savdoning mijoziga tegishli, bekor qilinmagan va yig'indisi savdo summasidan oshmasligi shart.
--   Idempotent: o'sha client_op_id bilan qayta chaqirilsa mavjud teskari yozuv qaytadi, hech narsa takrorlanmaydi.
--
-- W2 muammo: panel "Daftarga yozish" ta'minotchi uchun `post_supplier_opening_balance` chaqiradi; u bir
--   ta'minotchiga bitta faol yozuvga ruxsat beradi, ikkinchisi `opening_balance_exists` bilan yiqiladi.
-- W2 yechim: yangi hujjat turi `purchase_documents.kind = 'debt'` (tovarsiz qarz yozuvi, bir nechta bo'lishi
--   mumkin) va `post_supplier_debt` RPC. Qatorsiz, ombor harakati yo'q. Mavjud `supplier_outstanding()`,
--   `partner_statement()` va veb `supplierTotals` hamma `posted` hujjatlarni turidan qat'i nazar qo'shadi, shuning
--   uchun qarzning ikki hisob yo'li o'zgarmasdan uni o'qiydi. Bekor qilish: mavjud `reverse_purchase`.
--   Summa foydalanuvchi kiritgan butun son; server faqat tekshiradi (hisoblash yo'q).
--
-- Append-only buzilmaydi: faqat INSERT, bekor qilish teskari yozuv bilan. Qayta ishga tushirish xavfsiz.
-- Talab: 001..012. Qo'llash: main'ga merge bo'lganda CI (docs/MIGRATSIYA-CI.md), avval staging.
-- ============================================================

-- ---------- W1: savdoni to'lovlari bilan bekor qilish ----------
CREATE OR REPLACE FUNCTION reverse_sale_with_payments(
  p_shop_id uuid,
  p_document_id uuid,
  p_client_op_id text,
  p_reason text,
  p_void_payment_ids uuid[] DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rev uuid;
  v_doc documents%ROWTYPE;
  v_ids uuid[] := coalesce(p_void_payment_ids, ARRAY[]::uuid[]);
  v_found int;
  v_sum bigint;
  v_pid uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);

  -- Idempotent: birinchi chaqiruv atomik tugagan (savdo + to'lovlar), qayta hech narsa qilinmaydi
  SELECT id INTO v_rev FROM document_reversals WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_rev IS NOT NULL THEN
    RETURN v_rev;
  END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Qulfdan keyin qayta: o'sha client_op_id bilan parallel chaqiruv (ikki marta bosish, timeout'dan keyin qayta
  -- yuborish) birinchisi tugashini kutgan bo'lsa, xato emas, o'sha natija qaytadi
  SELECT id INTO v_rev FROM document_reversals WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_rev IS NOT NULL THEN
    RETURN v_rev;
  END IF;

  IF cardinality(v_ids) > 0 THEN
    IF cardinality(v_ids) > 20 OR (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'invalid_payment_list' USING ERRCODE = '22023';
    END IF;
    IF v_doc.customer_id IS NULL THEN
      RAISE EXCEPTION 'payment_not_linked' USING ERRCODE = '22023';
    END IF;
    -- To'lovlarni qulflab tekshirish: shu do'kon, shu mijoz, bekor qilinmagan
    PERFORM 1 FROM payments WHERE id = ANY (v_ids) AND shop_id = p_shop_id FOR UPDATE;
    SELECT count(*), coalesce(sum(p.amount), 0) INTO v_found, v_sum
      FROM payments p
     WHERE p.id = ANY (v_ids) AND p.shop_id = p_shop_id AND p.customer_id = v_doc.customer_id
       AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id);
    IF v_found <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'payment_not_linked' USING ERRCODE = '22023';
    END IF;
    IF v_sum > v_doc.subtotal THEN
      RAISE EXCEPTION 'payment_exceeds_sale: payments=%, sale=%', v_sum, v_doc.subtotal USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Savdo: mavjud teskari yozuv mantiqi (holat, sabab, ombor, bir martalik mijoz to'lovi)
  v_rev := reverse_sale(p_shop_id, p_document_id, p_client_op_id, p_reason);

  -- To'lovlar: mavjud void_payment (teskari yozuv payment_voids, o'chirish yo'q)
  FOREACH v_pid IN ARRAY v_ids LOOP
    PERFORM void_payment(p_shop_id, v_pid, left('savdo bekor qilindi: ' || trim(p_reason), 300));
  END LOOP;
  RETURN v_rev;
END;
$$;

-- ---------- W2: ta'minotchiga tovarsiz qarz yozuvi ----------
ALTER TABLE purchase_documents DROP CONSTRAINT IF EXISTS purchase_documents_kind_check;
ALTER TABLE purchase_documents ADD CONSTRAINT purchase_documents_kind_check CHECK (kind IN ('purchase', 'opening', 'debt'));

CREATE OR REPLACE FUNCTION post_supplier_debt(
  p_shop_id uuid,
  p_document_id uuid,
  p_client_op_id text,
  p_supplier_id uuid,
  p_amount bigint,
  p_doc_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_date date := coalesce(p_doc_date, (now() AT TIME ZONE 'Asia/Tashkent')::date);
BEGIN
  PERFORM require_shop_member(p_shop_id);

  -- Idempotent: o'sha client_op_id bilan qayta yuborilsa mavjud yozuv qaytadi
  SELECT id INTO v_existing FROM purchase_documents WHERE shop_id = p_shop_id AND client_op_id = p_client_op_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_documents WHERE id = p_document_id) THEN
    RAISE EXCEPTION 'id_conflict' USING ERRCODE = '23505';
  END IF;
  PERFORM 1 FROM suppliers WHERE id = p_supplier_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_in_shop' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF v_date < DATE '2000-01-01' OR v_date > (now() AT TIME ZONE 'Asia/Tashkent')::date + 1 THEN
    RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023';
  END IF;

  INSERT INTO purchase_documents (id, shop_id, supplier_id, doc_date, status, kind, subtotal, ts_total, pg_total, calc_match, client_op_id, created_by, posted_at)
  VALUES (p_document_id, p_shop_id, p_supplier_id, v_date, 'posted', 'debt', p_amount, p_amount, p_amount, true, p_client_op_id, auth.uid(), now());
  RETURN p_document_id;
END;
$$;

-- ---------- Huquqlar: faqat tizimga kirgan foydalanuvchi (OAuth require_shop_member ichida rad etiladi) ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('reverse_sale_with_payments', 'post_supplier_debt')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
