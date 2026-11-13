-- ============================================================
-- HISOBCHI GO — 018: AI so'rovlari hisobi (sarf, kunlik limit, o'lchov)
-- ============================================================
-- Maqsad: Edge Function `ai-parse` har bir AI chaqiruvini shu yerda ro'yxatdan o'tkazadi:
--   1. ai_begin_request  — a'zolik (faqat birinchi tomon sessiyasi, OAuth rad) + do'kon bo'yicha
--                          kunlik limit (oxirgi 24 soatda 200 ta). So'rov id'sini qaytaradi.
--   2. ai_finish_request — natija: holat, xato kodi, token soni, model. Faqat o'z so'rovi,
--                          faqat 'started' holatidan va faqat bir marta.
--   3. ai_usage_summary  — kunlik o'lchov (Toshkent vaqti bo'yicha): so'rovlar, xatolar, tokenlar.
--
-- Maxfiylik: matn, rasm, mijoz ismi SAQLANMAYDI. Faqat uzunlik (belgi; rasm uchun bayt), token, model.
-- AI hech narsani hisoblamaydi va bu jadvalga o'zi yozmaydi: yozuvni Edge Function foydalanuvchi JWT'si
-- bilan RPC orqali qiladi (service_role ishlatilmaydi).
--
-- Qayta ishga tushirish xavfsiz (IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE). Ma'lumot o'chirilmaydi.
-- Talab: 001, 003, 004 qo'llangan bo'lishi kerak (is_shop_member, require_shop_member, is_oauth_client_token).
-- ============================================================

-- ---------- 1. Jadval ----------
CREATE TABLE IF NOT EXISTS ai_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('sale_text', 'purchase_text', 'purchase_image')),
  status        text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'ok', 'error')),
  -- Faqat mashina kodi (masalan 'ai_timeout'), erkin matn emas
  error_code    text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  -- Matn uchun belgilar soni, rasm uchun bayt soni. Matnning o'zi saqlanmaydi.
  input_chars   integer NOT NULL CHECK (input_chars >= 0),
  input_tokens  integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  model         text CHECK (model IS NULL OR char_length(model) <= 200),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  CONSTRAINT ai_requests_finished_consistent CHECK ((status = 'started') = (finished_at IS NULL)),
  CONSTRAINT ai_requests_error_code_consistent CHECK (
    (status = 'error' AND error_code IS NOT NULL) OR (status <> 'error' AND error_code IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_ai_requests_shop_started ON ai_requests(shop_id, started_at DESC);

ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_requests_select ON ai_requests;
CREATE POLICY ai_requests_select ON ai_requests FOR SELECT USING (is_shop_member(shop_id));
-- 004 uslubi: OAuth (MCP) tokeni jadvalga to'g'ridan-to'g'ri tegmaydi
DROP POLICY IF EXISTS ai_requests_no_oauth ON ai_requests;
CREATE POLICY ai_requests_no_oauth ON ai_requests AS RESTRICTIVE FOR ALL
  USING (NOT is_oauth_client_token()) WITH CHECK (NOT is_oauth_client_token());

-- To'g'ridan-to'g'ri yozish yo'q: faqat SECURITY DEFINER RPC'lar
REVOKE ALL ON ai_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON ai_requests FROM authenticated;
GRANT SELECT ON ai_requests TO authenticated;

-- Yozuv mazmuni o'zgarmaydi; faqat 'started' → 'ok' | 'error' bir marta.
-- (DELETE trigger bilan to'silmaydi: do'kon o'chirilsa CASCADE ishlashi kerak; DELETE huquqi esa hech kimda yo'q.)
CREATE OR REPLACE FUNCTION ai_requests_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status <> 'started' THEN
    RAISE EXCEPTION 'ai_request_already_finished';
  END IF;
  IF NEW.status NOT IN ('ok', 'error') THEN
    RAISE EXCEPTION 'ai_request_invalid_transition';
  END IF;
  IF (NEW.id, NEW.shop_id, NEW.user_id, NEW.mode, NEW.input_chars, NEW.started_at)
     IS DISTINCT FROM
     (OLD.id, OLD.shop_id, OLD.user_id, OLD.mode, OLD.input_chars, OLD.started_at) THEN
    RAISE EXCEPTION 'ai_request_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ai_requests_guard ON ai_requests;
CREATE TRIGGER trg_ai_requests_guard BEFORE UPDATE ON ai_requests
  FOR EACH ROW EXECUTE FUNCTION ai_requests_guard();

-- ---------- 2. Limit ----------
-- Do'kon bo'yicha oxirgi 24 soatda nechta AI so'rovi (xatolar ham hisoblanadi: provayder baribir pul oladi).
CREATE OR REPLACE FUNCTION ai_daily_limit_per_shop()
RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT 200 $$;

-- ---------- 3. So'rovni boshlash ----------
CREATE OR REPLACE FUNCTION ai_begin_request(p_shop_id uuid, p_mode text, p_input_chars integer)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_id    uuid;
BEGIN
  -- auth.uid() bor, OAuth emas (assert_first_party), do'kon a'zosi
  PERFORM require_shop_member(p_shop_id);
  IF p_mode IS NULL OR p_mode NOT IN ('sale_text', 'purchase_text', 'purchase_image') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023';
  END IF;
  IF p_input_chars IS NULL OR p_input_chars < 0 OR p_input_chars > 10000000 THEN
    RAISE EXCEPTION 'invalid_input_size' USING ERRCODE = '22023';
  END IF;

  -- Bir do'konning parallel so'rovlari limitni birga chetlab o'tmasligi uchun (tranzaksiya oxirigacha qulf)
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_requests:' || p_shop_id::text, 0));

  SELECT count(*) INTO v_count
  FROM ai_requests r
  WHERE r.shop_id = p_shop_id AND r.started_at > now() - interval '24 hours';
  IF v_count >= ai_daily_limit_per_shop() THEN
    RAISE EXCEPTION 'ai_daily_limit' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ai_requests (shop_id, user_id, mode, input_chars)
  VALUES (p_shop_id, auth.uid(), p_mode, p_input_chars)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 4. So'rovni yakunlash ----------
CREATE OR REPLACE FUNCTION ai_finish_request(
  p_request_id uuid, p_status text, p_error_code text,
  p_input_tokens integer, p_output_tokens integer, p_model text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_model text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  PERFORM assert_first_party();

  IF p_status IS NULL OR p_status NOT IN ('ok', 'error') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'error' AND (p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,64}$') THEN
    RAISE EXCEPTION 'invalid_error_code' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'ok' AND p_error_code IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_error_code' USING ERRCODE = '22023';
  END IF;
  IF (p_input_tokens IS NOT NULL AND (p_input_tokens < 0 OR p_input_tokens > 10000000))
     OR (p_output_tokens IS NOT NULL AND (p_output_tokens < 0 OR p_output_tokens > 10000000)) THEN
    RAISE EXCEPTION 'invalid_tokens' USING ERRCODE = '22023';
  END IF;
  v_model := nullif(left(trim(coalesce(p_model, '')), 200), '');

  UPDATE ai_requests r
     SET status = p_status,
         error_code = CASE WHEN p_status = 'error' THEN p_error_code END,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         model = v_model,
         finished_at = clock_timestamp()
   WHERE r.id = p_request_id AND r.user_id = auth.uid() AND r.status = 'started'
  RETURNING r.id INTO v_id;

  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM ai_requests r WHERE r.id = p_request_id AND r.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'ai_request_already_finished' USING ERRCODE = '55000';
    END IF;
    -- Boshqa foydalanuvchining so'rovi borligi ham oshkor qilinmaydi
    RAISE EXCEPTION 'ai_request_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ---------- 5. O'lchov ----------
CREATE OR REPLACE FUNCTION ai_usage_summary(p_shop_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  day date, mode text, requests bigint, ok_count bigint, error_count bigint,
  input_tokens bigint, output_tokens bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
BEGIN
  PERFORM require_shop_member(p_shop_id);
  RETURN QUERY
    SELECT (r.started_at AT TIME ZONE 'Asia/Tashkent')::date AS day,
           r.mode,
           count(*)::bigint,
           count(*) FILTER (WHERE r.status = 'ok')::bigint,
           count(*) FILTER (WHERE r.status = 'error')::bigint,
           coalesce(sum(r.input_tokens), 0)::bigint,
           coalesce(sum(r.output_tokens), 0)::bigint
    FROM ai_requests r
    WHERE r.shop_id = p_shop_id
      AND r.started_at > now() - make_interval(days => v_days)
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2;
END;
$$;

-- ---------- 6. Huquqlar: faqat tizimga kirgan foydalanuvchi (OAuth RPC ichida rad etiladi) ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('ai_begin_request', 'ai_finish_request', 'ai_usage_summary', 'ai_daily_limit_per_shop')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
  -- Trigger funksiyasi hech kim tomonidan to'g'ridan-to'g'ri chaqirilmaydi
  REVOKE ALL ON FUNCTION ai_requests_guard() FROM PUBLIC, anon, authenticated;
END $$;
