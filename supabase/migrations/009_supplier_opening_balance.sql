-- ============================================================
-- HISOBCHI GO — 009: ta'minotchining boshlang'ich qarzi (ochilish qoldig'i)
-- ============================================================
-- Muammo: savdogar ilovaga ta'minotchi bilan allaqachon qarzdor holda kiradi ("Hozirgi qarzim").
-- Hozir qarz faqat kirim hujjatlari (post_purchase) bilan paydo bo'ladi, boshlang'ich qoldiq kiritishning yo'li yo'q.
--
-- Yechim (append-only buzilmaydi): boshlang'ich qoldiq — alohida "ochilish qoldig'i" yozuvi.
-- Bu qatorsiz (tovarsiz) kirim hujjati: purchase_documents.kind = 'opening', status 'posted', subtotal = summa.
-- Shuning uchun mavjud supplier_outstanding(), partner_statement(), veb va mobil hisob o'zgarmasdan uni "Eski/Tovar"
-- ga qo'shadi; bekor qilish uchun mavjud reverse_purchase ishlaydi (teskari yozuv, o'chirish yo'q).
-- Bir ta'minotchiga bitta faol ochilish qoldig'i (ikkinchisi kerak bo'lsa avval birinchisi bekor qilinadi).
-- Hisob ikki yo'l: summa foydalanuvchi kiritgan butun son; server uni faqat tekshiradi (hisoblash yo'q), qarz
-- esa mavjud ikki yo'l (TypeScript supplierTotals va SQL supplier_outstanding) bilan o'qiladi.
--
-- Qayta ishga tushirish xavfsiz. Talab: 001..008. Qo'llash: main'ga merge bo'lganda CI (docs/MIGRATSIYA-CI.md).
-- ============================================================

ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'purchase';
ALTER TABLE purchase_documents DROP CONSTRAINT IF EXISTS purchase_documents_kind_check;
ALTER TABLE purchase_documents ADD CONSTRAINT purchase_documents_kind_check CHECK (kind IN ('purchase', 'opening'));

-- Bitta ta'minotchiga bitta faol (bekor qilinmagan) ochilish qoldig'i
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_documents_opening
  ON purchase_documents (shop_id, supplier_id) WHERE kind = 'opening' AND status <> 'reversed';

CREATE OR REPLACE FUNCTION post_supplier_opening_balance(
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
  IF EXISTS (SELECT 1 FROM purchase_documents WHERE shop_id = p_shop_id AND supplier_id = p_supplier_id AND kind = 'opening' AND status <> 'reversed') THEN
    RAISE EXCEPTION 'opening_balance_exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO purchase_documents (id, shop_id, supplier_id, doc_date, status, kind, subtotal, ts_total, pg_total, calc_match, client_op_id, created_by, posted_at)
  VALUES (p_document_id, p_shop_id, p_supplier_id, v_date, 'posted', 'opening', p_amount, p_amount, p_amount, true, p_client_op_id, auth.uid(), now());
  RETURN p_document_id;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'post_supplier_opening_balance'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
