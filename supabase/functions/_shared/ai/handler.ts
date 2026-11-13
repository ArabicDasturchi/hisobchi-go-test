/**
 * `ai-parse` Edge Function'ning butun oqimi, tashqi bog'liqliklar (Supabase, provayder) inyeksiya qilinadi.
 * `supabase/functions/ai-parse/index.ts` faqat Deno.serve + supabase-js'ni ulaydi; mantiq shu yerda va
 * Node (vitest) da testlanadi.
 *
 * Qadamlar: CORS → Bearer JWT → OAuth tokeni rad (client_id claim) → tana tekshiruvi → foydalanuvchi →
 * provayder sozlanganmi → ai_begin_request (a'zolik + kunlik limit) → katalog (foydalanuvchi JWT, RLS) →
 * provayder → validatsiya → ai_finish_request → javob {lines, model, usage, warnings, request_id}. Jami YO'Q.
 *
 * Log: faqat kod, rejim, davomiylik, tokenlar, model, qatorlar soni. Matn, rasm, mijoz/tovar nomi yozilmaydi.
 */
import { AiError, isAiError, type LlmProvider, type LlmUsage } from './types.ts';
import { createProvider, type EnvLike } from './provider.ts';
import { buildExtractionPrompt, validateExtraction, type CatalogProduct, type ExtractedLine } from './extract.ts';
import { MAX_BODY_BYTES, parseAiParseRequest } from './request.ts';

export const TOTAL_TIMEOUT_MS = 20_000;
export const MIN_PROVIDER_TIMEOUT_MS = 1_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
/** Katalogdan nechta faol tovar o'qiladi (promptga ulardan ko'pi bilan 300 tasi tanlanadi) */
export const CATALOG_FETCH_LIMIT = 2000;

export interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface AiParseDeps {
  env: EnvLike;
  /** JWT'ni tekshiradi (supabase.auth.getUser). Yaroqsiz bo'lsa null. */
  getUserId(jwt: string): Promise<string | null>;
  /** Foydalanuvchi JWT'si bilan RPC (service_role EMAS) */
  rpc(jwt: string, fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  /** Do'konning faol tovarlari, foydalanuvchi JWT'si bilan (RLS) */
  loadCatalog(jwt: string, shopId: string, limit: number): Promise<CatalogProduct[]>;
  createProvider?: (env: EnvLike) => LlmProvider;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

export interface AiParseSuccess {
  request_id: string;
  lines: ExtractedLine[];
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  warnings: string[];
}

const ERROR_MESSAGES: Record<string, string> = {
  method_not_allowed: 'Faqat POST',
  unauthorized: 'Tizimga kiring',
  oauth_client_forbidden: 'Bu amal faqat ilovada',
  forbidden: 'Do\'konga ruxsat yo\'q',
  payload_too_large: 'So\'rov juda katta',
  invalid_request: 'So\'rov noto\'g\'ri',
  invalid_shop_id: 'Do\'kon noto\'g\'ri',
  invalid_mode: 'Rejim noto\'g\'ri',
  text_required: 'Matn kiriting',
  text_too_long: 'Matn 4000 belgidan oshmasin',
  image_required: 'Rasm yuboring',
  unsupported_image_type: 'Rasm JPEG, PNG yoki WEBP bo\'lsin',
  invalid_image: 'Rasm o\'qilmadi',
  image_too_large: 'Rasm 4 MB dan oshmasin',
  ai_not_configured: 'AI sozlanmagan, qo\'lda kiriting',
  ai_daily_limit: 'Bugungi AI limiti tugadi, qo\'lda kiriting',
  ai_timeout: 'AI javob bermadi, qayta urining yoki qo\'lda kiriting',
  ai_provider_error: 'AI xizmatida xato, qo\'lda kiriting',
  ai_provider_busy: 'AI band, birozdan keyin urining',
  ai_refused: 'AI bu matnni qayta ishlamadi, qo\'lda kiriting',
  ai_output_truncated: 'Ro\'yxat juda uzun, bo\'lib yuboring',
  ai_bad_output: 'AI javobi tushunilmadi, qo\'lda kiriting',
  catalog_unavailable: 'Katalog o\'qilmadi, qayta urining',
  internal_error: 'Server xatosi',
};

const AI_ERROR_STATUS: Record<string, number> = {
  ai_not_configured: 503,
  ai_timeout: 504,
  ai_provider_error: 502,
  ai_provider_busy: 503,
  ai_refused: 422,
  ai_output_truncated: 422,
  ai_bad_output: 502,
};

export function corsHeaders(req: Request, env: EnvLike): Record<string, string> {
  const allowed = (env.AI_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') ?? '';
  const allowOrigin = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

/** JWT payload'ini o'qiydi (imzo tekshiruvi supabase.auth.getUser da). Faqat claim'larni ko'rish uchun. */
export function decodeJwtClaims(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** PostgREST xato xabaridan RPC kodini ajratish */
export function mapBeginError(message: string): { code: string; status: number } {
  const m = message.toLowerCase();
  if (m.includes('ai_daily_limit')) return { code: 'ai_daily_limit', status: 429 };
  if (m.includes('oauth_client_forbidden')) return { code: 'oauth_client_forbidden', status: 403 };
  if (m.includes('not_authenticated')) return { code: 'unauthorized', status: 401 };
  if (m.includes('forbidden') || m.includes('permission denied')) return { code: 'forbidden', status: 403 };
  if (m.includes('invalid_mode')) return { code: 'invalid_mode', status: 400 };
  if (m.includes('invalid_input_size')) return { code: 'invalid_request', status: 400 };
  return { code: 'internal_error', status: 500 };
}

export async function handleAiParse(req: Request, deps: AiParseDeps): Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const cors = corsHeaders(req, deps.env);

  let mode: string | undefined;
  let requestId: string | undefined;

  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  const fail = (status: number, code: string, extra: Record<string, unknown> = {}) => {
    log({ fn: 'ai-parse', status: 'error', code, http: status, mode, request_id: requestId, ms: now() - started, ...extra });
    return respond(status, { error: code, message: ERROR_MESSAGES[code] ?? code });
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  // 1. Token
  const auth = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!match) return fail(401, 'unauthorized');
  const jwt = match[1];
  const claims = decodeJwtClaims(jwt);
  if (!claims) return fail(401, 'unauthorized');
  // OAuth (MCP) tokeni: AI agent ichki AI'ni chaqira olmaydi (004 qoidasi; bazada ham require_shop_member rad etadi)
  if (typeof claims.client_id === 'string' && claims.client_id !== '') return fail(403, 'oauth_client_forbidden');

  // 2. Tana
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'payload_too_large');
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return fail(400, 'invalid_request');
  }
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'payload_too_large');
  let bodyJson: unknown;
  try {
    bodyJson = JSON.parse(raw);
  } catch {
    return fail(400, 'invalid_request');
  }
  const parsed = parseAiParseRequest(bodyJson);
  if (!parsed.ok) return fail(400, parsed.code);
  const input = parsed.value;
  mode = input.mode;

  // 3. Foydalanuvchi (imzo va muddat tekshiruvi)
  let userId: string | null;
  try {
    userId = await deps.getUserId(jwt);
  } catch {
    userId = null;
  }
  if (!userId) return fail(401, 'unauthorized');

  // 4. Provayder: sozlanmagan bo'lsa limit sarflanmaydi
  let provider: LlmProvider;
  try {
    provider = (deps.createProvider ?? createProvider)(deps.env);
  } catch (e) {
    if (isAiError(e) && e.code === 'ai_not_configured') return fail(503, 'ai_not_configured');
    return fail(500, 'internal_error');
  }

  // 5. A'zolik + kunlik limit (bazada)
  const inputSize = input.image ? input.image.bytes : Array.from(input.text ?? '').length;
  const begin = await deps.rpc(jwt, 'ai_begin_request', {
    p_shop_id: input.shop_id,
    p_mode: input.mode,
    p_input_chars: inputSize,
  });
  if (begin.error || typeof begin.data !== 'string') {
    const mapped = begin.error ? mapBeginError(begin.error.message) : { code: 'internal_error', status: 500 };
    return fail(mapped.status, mapped.code);
  }
  requestId = begin.data;

  const finish = async (status: 'ok' | 'error', errorCode: string | null, usage: LlmUsage | undefined, model: string | null) => {
    try {
      const r = await deps.rpc(jwt, 'ai_finish_request', {
        p_request_id: requestId,
        p_status: status,
        p_error_code: errorCode,
        p_input_tokens: usage?.inputTokens ?? null,
        p_output_tokens: usage?.outputTokens ?? null,
        p_model: model,
      });
      if (r.error) log({ fn: 'ai-parse', status: 'warn', code: 'finish_failed', request_id: requestId });
    } catch {
      log({ fn: 'ai-parse', status: 'warn', code: 'finish_failed', request_id: requestId });
    }
  };

  // 6. Katalog (foydalanuvchi JWT bilan, RLS)
  let catalog: CatalogProduct[];
  try {
    catalog = await deps.loadCatalog(jwt, input.shop_id, CATALOG_FETCH_LIMIT);
  } catch {
    await finish('error', 'catalog_unavailable', undefined, null);
    return fail(500, 'catalog_unavailable');
  }

  // 7. Provayder
  const prompt = buildExtractionPrompt({ mode: input.mode, text: input.text, catalog });
  const remaining = TOTAL_TIMEOUT_MS - (now() - started);
  if (remaining < MIN_PROVIDER_TIMEOUT_MS) {
    // Katalog/baza sekin bo'lsa umumiy 20 s chegarasidan oshmaslik uchun provayder chaqirilmaydi
    await finish('error', 'ai_timeout', undefined, provider.model);
    return fail(504, 'ai_timeout');
  }
  const maxOut = Number(deps.env.AI_MAX_OUTPUT_TOKENS ?? '') || DEFAULT_MAX_OUTPUT_TOKENS;
  let usage: LlmUsage | undefined;
  let model: string = provider.model;
  try {
    const res = await provider.complete({
      system: prompt.system,
      user: prompt.user,
      images: input.image ? [{ mime: input.image.mime, base64: input.image.base64 }] : undefined,
      maxOutputTokens: Math.max(256, Math.min(maxOut, 32000)),
      timeoutMs: remaining,
    });
    usage = res.usage;
    model = res.model;

    // 8. Validatsiya (jami/summa maydonlari shu yerda tushib qoladi)
    const result = validateExtraction(res.text, { mode: input.mode, keyMap: prompt.keyMap });
    await finish('ok', null, usage, model);
    const body: AiParseSuccess = {
      request_id: requestId,
      lines: result.lines,
      model,
      usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
      warnings: result.warnings,
    };
    log({
      fn: 'ai-parse', status: 'ok', http: 200, mode, request_id: requestId, ms: now() - started,
      model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, lines: result.lines.length,
      warnings: result.warnings,
    });
    return respond(200, body);
  } catch (e) {
    const err = isAiError(e) ? e : new AiError('ai_provider_error', 'unexpected');
    const code = isAiError(e) ? err.code : 'internal_error';
    const u = usage ?? err.usage;
    await finish('error', code, u, model);
    return fail(AI_ERROR_STATUS[code] ?? 500, code, {
      model,
      input_tokens: u?.inputTokens,
      output_tokens: u?.outputTokens,
      provider_http: err.httpStatus,
    });
  }
}
