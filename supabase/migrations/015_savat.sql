-- ============================================================
-- HISOBCHI GO — 015: Savat (F2) va AI qoralamasini savatga olib tahrirlash (B3)
-- ============================================================
-- Muammo (F2): bozorda bir vaqtda bir nechta mijozga savdo yuritiladi; yarim qolgan savdo faqat ekranda turardi
--   (sahifa yangilansa yoki boshqa bo'limga o'tilsa yo'qolardi). AI qoralamasi (agent_drafts) qatorlarini tahrirlab
--   bo'lmasdi: accept_agent_draft faqat id oladi (B3, QARORLAR 10.11).
-- Yechim:
--   * `baskets` — savdogarning ochiq (tasdiqlanmagan) savdo/kirim ish holati. Bu PUL YOZUVI EMAS: jurnalga
--     (documents, ledger_entries, payments, stock_movements) hech narsa tushmaydi; tasdiqlash odatdagi `post_sale` /
--     `post_purchase` orqali (ikki yo'l hisob, client_op_id) va shundan keyin savat `done` bo'ladi.
--   * Ish holati o'zgaruvchan (qatorlar tahrirlanadi), shuning uchun append-only emas; lekin yozish faqat RPC orqali,
--     o'chirish yo'q (savat `discarded` holatiga o'tadi), har o'zgarishda `version` +1.
--   * Ikki qurilmadan bir savatni tahrirlash: `p_expected_version` serverdagi versiyaga teng bo'lmasa
--     `version_conflict` (oxirgi yozuv jimgina ustiga yozilmaydi). Takror yuborish (`p_client_op_id` = oxirgi
--     muvaffaqiyatli yozuv) — o'sha natija qaytadi (idempotent).
--   * B3: `agent_draft_to_basket` — AI qoralamasi savatga ko'chiriladi (bitta tranzaksiyada) va qoralama `converted`
--     holatiga o'tadi; savdogar qatorlarni savatda tahrirlab, odatdagidek tasdiqlaydi (server jami qayta hisoblaydi).
-- Tanlov sababi: docs/QARORLAR.md 12.11.2026 (alohida jadval, agent_drafts umumiylashtirilmadi: u append-only va
--   holat mashinasi qat'iy, savat esa o'zgaruvchan ish holati).
-- Xavfsizlik: har jadvalda shop_id, RLS (a'zo o'qiydi), to'g'ridan-to'g'ri yozish yopiq, OAuth token yozolmaydi
--   (RESTRICTIVE), RPC'lar SECURITY DEFINER + search_path + require_shop_member (birinchi tomon sessiyasi).
-- Qayta ishga tushirish xavfsiz. Talab: 001..013 (014 ga bog'liq emas).
-- ============================================================

CREATE TABLE IF NOT EXISTS baskets (
  id           uuid PRIMARY KEY,
  shop_id      uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('sale', 'purchase')),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'discarded')),
  -- sale: mijoz (doimiy) yoki NULL (mijozsiz); purchase: ta'minotchi yoki NULL (hali tanlanmagan)
  customer_id  uuid REFERENCES customers(id),
  supplier_id  uuid REFERENCES suppliers(id),
  -- Ish holati qatorlari (web DraftLine shakli: nom, soni/narx matni, birlik, tanlangan tovar, savollar). Hisob emas.
  lines        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array'),
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- Oxirgi muvaffaqiyatli yozuvning client_op_id si (takror yuborish idempotent)
  last_op_id   text,
  -- AI qoralamasidan olingan bo'lsa
  source_draft_id uuid REFERENCES agent_drafts(id),
  -- Tasdiqlangach: savdo (documents) yoki kirim (purchase_documents) id si
  document_id  uuid,
  created_by   uuid NOT NULL,
  updated_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  CHECK (kind = 'sale' OR customer_id IS NULL),
  CHECK (kind = 'purchase' OR supplier_id IS NULL),
  CHECK (status <> 'done' OR document_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_baskets_shop_open ON baskets (shop_id, updated_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_baskets_customer ON baskets (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_baskets_supplier ON baskets (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_baskets_source_draft ON baskets (source_draft_id) WHERE source_draft_id IS NOT NULL;

ALTER TABLE baskets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS baskets_select ON baskets;
CREATE POLICY baskets_select ON baskets FOR SELECT USING (is_shop_member(shop_id));
DROP POLICY IF EXISTS baskets_no_oauth ON baskets;
CREATE POLICY baskets_no_oauth ON baskets AS RESTRICTIVE FOR ALL
  USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token());

REVOKE ALL ON baskets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON baskets FROM authenticated;
GRANT SELECT ON baskets TO authenticated;

-- O'chirish taqiqlangan (savat `discarded` bo'ladi); yopilgan savat o'zgarmaydi
CREATE OR REPLACE FUNCTION baskets_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'basket_delete_forbidden';
  END IF;
  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'basket_closed';
  END IF;
  IF NEW.id <> OLD.id OR NEW.shop_id <> OLD.shop_id OR NEW.kind <> OLD.kind OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at OR NEW.source_draft_id IS DISTINCT FROM OLD.source_draft_id THEN
    RAISE EXCEPTION 'basket_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_baskets_guard ON baskets;
CREATE TRIGGER trg_baskets_guard BEFORE UPDATE OR DELETE ON baskets FOR EACH ROW EXECUTE FUNCTION baskets_guard();

-- Do'kon bo'yicha ochiq savatlar chegarasi (ommaviy yozuvdan himoya)
CREATE OR REPLACE FUNCTION basket_open_limit() RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp AS $$ SELECT 100 $$;

-- Qatorlar tekshiruvi: massiv, har element obyekt, ko'pi bilan 200 qator va 200 KB
CREATE OR REPLACE FUNCTION basket_check_lines(p_lines jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'basket_lines_invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'basket_too_many_lines' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_lines::text) > 200000 THEN
    RAISE EXCEPTION 'basket_too_large' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) e(v) WHERE jsonb_typeof(e.v) <> 'object') THEN
    RAISE EXCEPTION 'basket_lines_invalid' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Hamkor shu do'konga tegishlimi (sale: doimiy faol mijoz; purchase: faol ta'minotchi)
CREATE OR REPLACE FUNCTION basket_check_partner(p_shop_id uuid, p_kind text, p_partner_id uuid) RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_partner_id IS NULL THEN RETURN; END IF;
  IF p_kind = 'sale' THEN
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_partner_id AND shop_id = p_shop_id AND kind = 'regular' AND is_active) THEN
      RAISE EXCEPTION 'basket_partner_invalid' USING ERRCODE = '22023';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_partner_id AND shop_id = p_shop_id AND is_active) THEN
    RAISE EXCEPTION 'basket_partner_invalid' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ---------- basket_save: yaratish yoki yangilash (versiya bilan) ----------
-- p_expected_version: yangi savat uchun NULL; mavjud savat uchun klient ko'rgan versiya.
-- Natija: (basket_id, version). Xatolar: forbidden, basket_closed, version_conflict (DETAIL = server versiyasi),
-- basket_not_found, basket_limit, basket_partner_invalid, basket_lines_invalid, basket_too_many_lines, basket_too_large.
DROP FUNCTION IF EXISTS basket_save(uuid, uuid, text, uuid, jsonb, integer, text);
CREATE OR REPLACE FUNCTION basket_save(
  p_shop_id uuid,
  p_basket_id uuid,
  p_kind text,
  p_partner_id uuid,
  p_lines jsonb,
  p_expected_version integer,
  p_client_op_id text
) RETURNS TABLE (basket_id uuid, version integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b baskets%ROWTYPE;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  IF p_basket_id IS NULL OR p_client_op_id IS NULL OR length(p_client_op_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'basket_args_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('sale', 'purchase') THEN
    RAISE EXCEPTION 'basket_kind_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM basket_check_lines(p_lines);
  -- Bir savat id si bo'yicha parallel yaratish/yangilash ketma-ket bo'lsin
  PERFORM pg_advisory_xact_lock(hashtextextended('basket:' || p_basket_id::text, 0));

  SELECT * INTO v_b FROM baskets b WHERE b.id = p_basket_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'basket_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF (SELECT count(*) FROM baskets b WHERE b.shop_id = p_shop_id AND b.status = 'open') >= basket_open_limit() THEN
      RAISE EXCEPTION 'basket_limit' USING ERRCODE = '54000';
    END IF;
    PERFORM basket_check_partner(p_shop_id, p_kind, p_partner_id);
    INSERT INTO baskets (id, shop_id, kind, customer_id, supplier_id, lines, version, last_op_id, created_by, updated_by)
    VALUES (p_basket_id, p_shop_id, p_kind,
            CASE WHEN p_kind = 'sale' THEN p_partner_id END,
            CASE WHEN p_kind = 'purchase' THEN p_partner_id END,
            p_lines, 1, p_client_op_id, auth.uid(), auth.uid());
    RETURN QUERY SELECT p_basket_id, 1;
    RETURN;
  END IF;

  IF v_b.shop_id <> p_shop_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Takror yuborish: oxirgi muvaffaqiyatli yozuv shu bo'lsa — o'sha natija
  IF v_b.last_op_id = p_client_op_id THEN
    RETURN QUERY SELECT v_b.id, v_b.version;
    RETURN;
  END IF;
  IF v_b.status <> 'open' THEN
    RAISE EXCEPTION 'basket_closed' USING ERRCODE = '55000';
  END IF;
  IF v_b.kind <> p_kind THEN
    RAISE EXCEPTION 'basket_kind_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_b.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001', DETAIL = v_b.version::text;
  END IF;
  PERFORM basket_check_partner(p_shop_id, p_kind, p_partner_id);
  UPDATE baskets b SET
    lines = p_lines,
    customer_id = CASE WHEN p_kind = 'sale' THEN p_partner_id END,
    supplier_id = CASE WHEN p_kind = 'purchase' THEN p_partner_id END,
    version = v_b.version + 1,
    last_op_id = p_client_op_id,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE b.id = v_b.id;
  RETURN QUERY SELECT v_b.id, v_b.version + 1;
END;
$$;

-- ---------- basket_close: tasdiqlangach (done) yoki bekor (discarded) ----------
-- done: p_document_id shu do'kondagi tasdiqlangan savdo/kirim bo'lishi shart (savatsiz pul yozuvi yo'q).
-- Idempotent: o'sha holat va hujjat bilan qayta chaqirilsa xato yo'q.
-- discarded: p_expected_version berilsa tekshiriladi (boshqa qurilma o'zgartirgan savatni bilmasdan tashlamaslik).
DROP FUNCTION IF EXISTS basket_close(uuid, uuid, text, uuid, integer);
CREATE OR REPLACE FUNCTION basket_close(
  p_shop_id uuid,
  p_basket_id uuid,
  p_status text,
  p_document_id uuid DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b baskets%ROWTYPE;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  IF p_status NOT IN ('done', 'discarded') THEN
    RAISE EXCEPTION 'basket_status_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('basket:' || p_basket_id::text, 0));
  SELECT * INTO v_b FROM baskets WHERE id = p_basket_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'basket_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status <> 'open' THEN
    IF v_b.status = p_status AND v_b.document_id IS NOT DISTINCT FROM (CASE WHEN p_status = 'done' THEN p_document_id END) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'basket_closed' USING ERRCODE = '55000';
  END IF;
  IF p_status = 'done' THEN
    IF p_document_id IS NULL THEN
      RAISE EXCEPTION 'basket_document_required' USING ERRCODE = '22023';
    END IF;
    -- Hujjat AYNAN shu savatdan bo'lishi shart: id = savat id yoki client_op_id = 'basket:<id>' (web kalitlari)
    IF v_b.kind = 'sale' AND NOT EXISTS (
      SELECT 1 FROM documents d WHERE d.id = p_document_id AND d.shop_id = p_shop_id AND d.status IN ('posted', 'reversed')
        AND (d.id = p_basket_id OR d.client_op_id = 'basket:' || p_basket_id::text)
    ) THEN
      RAISE EXCEPTION 'basket_document_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_b.kind = 'purchase' AND NOT EXISTS (
      SELECT 1 FROM purchase_documents d WHERE d.id = p_document_id AND d.shop_id = p_shop_id AND d.status IN ('posted', 'reversed')
        AND (d.id = p_basket_id OR d.client_op_id = 'basket:' || p_basket_id::text)
    ) THEN
      RAISE EXCEPTION 'basket_document_invalid' USING ERRCODE = '22023';
    END IF;
  ELSIF p_expected_version IS NOT NULL AND p_expected_version <> v_b.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001', DETAIL = v_b.version::text;
  END IF;
  UPDATE baskets SET
    status = p_status,
    document_id = CASE WHEN p_status = 'done' THEN p_document_id END,
    version = v_b.version + 1,
    updated_by = auth.uid(),
    updated_at = now(),
    closed_at = now()
  WHERE id = v_b.id;
END;
$$;

-- ---------- B3: AI qoralamasini savatga olish ----------
-- agent_drafts: yangi holat `converted` (savatga olindi). Payload va boshqa ustunlar avvalgidek o'zgarmaydi.
ALTER TABLE agent_drafts ADD COLUMN IF NOT EXISTS converted_basket_id uuid REFERENCES baskets(id);
ALTER TABLE agent_drafts DROP CONSTRAINT IF EXISTS agent_drafts_status_check;
ALTER TABLE agent_drafts ADD CONSTRAINT agent_drafts_status_check CHECK (status IN ('draft', 'accepted', 'rejected', 'converted'));

-- 005 dagi guard + `converted` o'tishi (faqat draft → converted, savat id si bilan). search_path aniq (B9).
CREATE OR REPLACE FUNCTION agent_drafts_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only: agent_drafts yozuvini o''chirish taqiqlangan';
  END IF;
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'draft_already_decided';
  END IF;
  IF NEW.status NOT IN ('accepted', 'rejected', 'converted') THEN
    RAISE EXCEPTION 'draft_invalid_transition';
  END IF;
  IF NEW.status = 'converted' AND NEW.converted_basket_id IS NULL THEN
    RAISE EXCEPTION 'draft_invalid_transition';
  END IF;
  IF NEW.status <> 'converted' AND NEW.converted_basket_id IS NOT NULL THEN
    RAISE EXCEPTION 'draft_invalid_transition';
  END IF;
  IF (NEW.id, NEW.shop_id, NEW.kind, NEW.customer_id, NEW.target_id, NEW.total, NEW.payload, NEW.client_op_id, NEW.client_id,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.shop_id, OLD.kind, OLD.customer_id, OLD.target_id, OLD.total, OLD.payload, OLD.client_op_id, OLD.client_id,
      OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'draft_immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- p_lines: web qoralama qatorlaridan tuzgan savat qatorlari (DraftLine shakli; hisob emas).
-- Bitta tranzaksiyada: savat yaratiladi va qoralama `converted`. Takror chaqiruv (o'sha qoralama, o'sha savat) — o'sha id.
DROP FUNCTION IF EXISTS agent_draft_to_basket(uuid, uuid, uuid, jsonb);
CREATE OR REPLACE FUNCTION agent_draft_to_basket(
  p_shop_id uuid,
  p_draft_id uuid,
  p_basket_id uuid,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d agent_drafts%ROWTYPE;
  v_kind text;
  v_partner uuid;
BEGIN
  PERFORM require_shop_member(p_shop_id);
  PERFORM basket_check_lines(p_lines);
  SELECT * INTO v_d FROM agent_drafts WHERE id = p_draft_id AND shop_id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_d.status = 'converted' AND v_d.converted_basket_id = p_basket_id THEN
    RETURN p_basket_id;
  END IF;
  IF v_d.status <> 'draft' THEN
    RAISE EXCEPTION 'draft_already_decided' USING ERRCODE = '55000';
  END IF;
  IF v_d.kind = 'sale' THEN
    v_kind := 'sale';
    -- Bir martalik (walk-in) mijoz savatda NULL (mijozsiz)
    SELECT CASE WHEN c.kind = 'regular' AND c.is_active THEN c.id END INTO v_partner FROM customers c WHERE c.id = v_d.customer_id;
  ELSIF v_d.kind = 'purchase' THEN
    v_kind := 'purchase';
    SELECT s.id INTO v_partner FROM suppliers s WHERE s.id = v_d.target_id AND s.shop_id = p_shop_id AND s.is_active;
  ELSE
    RAISE EXCEPTION 'draft_kind_not_basket' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM baskets b WHERE b.shop_id = p_shop_id AND b.status = 'open') >= basket_open_limit() THEN
    RAISE EXCEPTION 'basket_limit' USING ERRCODE = '54000';
  END IF;
  INSERT INTO baskets (id, shop_id, kind, customer_id, supplier_id, lines, version, last_op_id, source_draft_id, created_by, updated_by)
  VALUES (p_basket_id, p_shop_id, v_kind,
          CASE WHEN v_kind = 'sale' THEN v_partner END,
          CASE WHEN v_kind = 'purchase' THEN v_partner END,
          p_lines, 1, 'draft:' || p_draft_id::text, p_draft_id, auth.uid(), auth.uid());
  UPDATE agent_drafts SET status = 'converted', converted_basket_id = p_basket_id, decided_by = auth.uid(), decided_at = now()
  WHERE id = v_d.id;
  RETURN p_basket_id;
END;
$$;

-- ---------- Huquqlar ----------
REVOKE ALL ON FUNCTION basket_save(uuid, uuid, text, uuid, jsonb, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION basket_close(uuid, uuid, text, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION agent_draft_to_basket(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION basket_save(uuid, uuid, text, uuid, jsonb, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION basket_close(uuid, uuid, text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_draft_to_basket(uuid, uuid, uuid, jsonb) TO authenticated;
-- Ichki yordamchilar to'g'ridan-to'g'ri chaqirilmaydi
REVOKE ALL ON FUNCTION basket_check_lines(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION basket_check_partner(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION basket_open_limit() FROM PUBLIC, anon, authenticated;
