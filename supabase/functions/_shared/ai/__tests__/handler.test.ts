import { describe, expect, it } from 'vitest';
import { decodeJwtClaims, handleAiParse, mapBeginError, TOTAL_TIMEOUT_MS, type AiParseDeps, type RpcResult } from '../handler.ts';
import { createMockProvider, type MockReply } from '../providers/mock.ts';
import { AiError, type LlmProvider } from '../types.ts';
import type { CatalogProduct } from '../extract.ts';

const SHOP = '11111111-2222-4333-8444-555555555555';
const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const REQ_ID = 'rrrrrrrr-0000-4000-8000-000000000001'.replace(/r/g, 'b');
const CATALOG: CatalogProduct[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Chirmoq', unit: 'dona' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Yurak', unit: 'dona' },
];

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims: Record<string, unknown>) => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`;
const USER_JWT = jwt({ sub: USER, role: 'authenticated' });

interface Harness {
  deps: AiParseDeps;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown>; jwt: string }>;
  logs: Array<Record<string, unknown>>;
  provider: ReturnType<typeof createMockProvider>;
  catalogCalls: number;
}

function harness(opts: {
  reply?: MockReply;
  begin?: RpcResult;
  userId?: string | null;
  catalog?: CatalogProduct[] | Error;
  providerFactory?: () => LlmProvider;
  env?: Record<string, string>;
} = {}): Harness {
  const h: Harness = {
    rpcCalls: [],
    logs: [],
    provider: createMockProvider(opts.reply ?? JSON.stringify({ lines: [{ name: 'Chirmoq', product_id: 'k1', qty_text: '10', unit: null, price_text: '13 ming', row_total_text: null, note: null }] })),
    catalogCalls: 0,
    deps: undefined as unknown as AiParseDeps,
  };
  h.deps = {
    env: opts.env ?? { AI_PROVIDER: 'openai-compatible', AI_MODEL: 'test' },
    getUserId: async () => (opts.userId === undefined ? USER : opts.userId),
    rpc: async (j, fn, args) => {
      h.rpcCalls.push({ fn, args, jwt: j });
      if (fn === 'ai_begin_request') return opts.begin ?? { data: REQ_ID, error: null };
      return { data: null, error: null };
    },
    loadCatalog: async () => {
      h.catalogCalls += 1;
      if (opts.catalog instanceof Error) throw opts.catalog;
      return opts.catalog ?? CATALOG;
    },
    createProvider: opts.providerFactory ?? (() => h.provider),
    log: (e) => h.logs.push(e),
  };
  return h;
}

function post(body: unknown, token: string | null = USER_JWT, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: 'https://panel.example', ...extraHeaders };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request('https://fn.local/ai-parse', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

const SALE = { shop_id: SHOP, mode: 'sale_text', text: "Karim akaga o'nta chirmoq o'n uch mingdan" };

describe('handleAiParse: muvaffaqiyat', () => {
  it('to\'liq oqim: begin → katalog → provayder → validatsiya → finish ok; jami yo\'q', async () => {
    const h = harness();
    const res = await handleAiParse(post(SALE), h.deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      request_id: REQ_ID,
      lines: [
        {
          name: 'Chirmoq', product_id: CATALOG[0].id, qty_text: '10', unit: null, price_text: '13 ming',
          row_total_text: null, note: null, line: 'Chirmoq 10x13 ming',
        },
      ],
      model: 'mock-model',
      usage: { input_tokens: 100, output_tokens: 50 },
      warnings: [],
    });
    expect(JSON.stringify(body)).not.toMatch(/total"|jami|summa/);

    expect(h.rpcCalls.map((c) => c.fn)).toEqual(['ai_begin_request', 'ai_finish_request']);
    expect(h.rpcCalls[0].args).toEqual({ p_shop_id: SHOP, p_mode: 'sale_text', p_input_chars: SALE.text.length });
    expect(h.rpcCalls[1].args).toEqual({
      p_request_id: REQ_ID, p_status: 'ok', p_error_code: null, p_input_tokens: 100, p_output_tokens: 50, p_model: 'mock-model',
    });
    // service_role emas: hamma RPC foydalanuvchi JWT'si bilan
    expect(h.rpcCalls.every((c) => c.jwt === USER_JWT)).toBe(true);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const call = h.provider.calls[0];
    expect(call.timeoutMs).toBeLessThanOrEqual(TOTAL_TIMEOUT_MS);
    expect(call.timeoutMs).toBeGreaterThan(TOTAL_TIMEOUT_MS - 1000);
    expect(call.user).toContain('k1 | Chirmoq | dona');
    expect(call.images).toBeUndefined();
  });

  it('model jami qaytarsa ham javobga o\'tmaydi', async () => {
    const h = harness({ reply: JSON.stringify({ lines: [{ name: 'Yurak', qty_text: '5', price_text: '15000', line_total: 75000 }], total: 75000, qarz: 75000 }) });
    const body = await (await handleAiParse(post(SALE), h.deps)).json();
    expect(JSON.stringify(body)).not.toContain('75000');
    expect(body.warnings).toContain('fields_dropped');
  });

  it('logda matn, mijoz ismi, tovar nomi yo\'q', async () => {
    const h = harness();
    await handleAiParse(post(SALE), h.deps);
    const dump = JSON.stringify(h.logs);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatchObject({ fn: 'ai-parse', status: 'ok', mode: 'sale_text', input_tokens: 100, output_tokens: 50, lines: 1 });
    expect(dump).not.toMatch(/Karim|chirmoq|Chirmoq|13 ming/i);
    expect(dump).not.toContain(SHOP);
  });

  it('rasm rejimi: rasm provayderga boradi, kirish hajmi baytda', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString('base64');
    const h = harness({ reply: JSON.stringify({ lines: [{ name: 'Un', qty_text: '10', unit: 'kg', price_text: '8000', row_total_text: '80 000' }] }) });
    const res = await handleAiParse(post({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/png', base64: png } }), h.deps);
    expect(res.status).toBe(200);
    expect(h.provider.calls[0].images).toEqual([{ mime: 'image/png', base64: png }]);
    expect(h.rpcCalls[0].args.p_input_chars).toBe(12);
    const body = await res.json();
    expect(body.lines[0]).toMatchObject({ row_total_text: '80 000', line: 'Un 10 kgx8000' });
  });

  it('CORS: OPTIONS 204; AI_ALLOWED_ORIGINS bilan faqat ruxsat etilgan origin', async () => {
    const h = harness({ env: { AI_PROVIDER: 'openai-compatible', AI_MODEL: 't', AI_ALLOWED_ORIGINS: 'https://panel.example, https://b.example' } });
    const pre = await handleAiParse(new Request('https://fn.local', { method: 'OPTIONS', headers: { origin: 'https://b.example' } }), h.deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://b.example');
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
    const other = await handleAiParse(new Request('https://fn.local', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), h.deps);
    expect(other.headers.get('access-control-allow-origin')).toBe('https://panel.example');
  });
});

describe('handleAiParse: rad etish (limit sarflanmaydi)', () => {
  const cases: Array<[string, () => Request, number, string]> = [
    ['GET', () => new Request('https://fn.local', { method: 'GET' }), 405, 'method_not_allowed'],
    ['tokensiz', () => post(SALE, null), 401, 'unauthorized'],
    ['JWT emas', () => post(SALE, 'abc'), 401, 'unauthorized'],
    ['OAuth tokeni (client_id)', () => post(SALE, jwt({ sub: USER, client_id: 'claude-mcp' })), 403, 'oauth_client_forbidden'],
    ['JSON emas', () => post('{bad'), 400, 'invalid_request'],
    ['do\'kon id noto\'g\'ri', () => post({ ...SALE, shop_id: 'x' }), 400, 'invalid_shop_id'],
    ['matn juda uzun', () => post({ ...SALE, text: 'a'.repeat(4001) }), 400, 'text_too_long'],
    ['gif', () => post({ shop_id: SHOP, mode: 'purchase_image', image: { mime: 'image/gif', base64: 'R0lGODlh' } }), 400, 'unsupported_image_type'],
    ['tana > 6 MB', () => post(SALE, USER_JWT, { 'content-length': String(7 * 1024 * 1024) }), 413, 'payload_too_large'],
  ];
  for (const [name, mk, status, code] of cases) {
    it(`${name} → ${status} ${code}`, async () => {
      const h = harness();
      const res = await handleAiParse(mk(), h.deps);
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(code);
      expect(h.rpcCalls).toHaveLength(0);
      expect(h.provider.calls).toHaveLength(0);
    });
  }

  it('yaroqsiz/eskirgan JWT (getUser null) → 401', async () => {
    const h = harness({ userId: null });
    const res = await handleAiParse(post(SALE), h.deps);
    expect(res.status).toBe(401);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it('AI sozlanmagan → 503 ai_not_configured, begin chaqirilmaydi', async () => {
    const h = harness({ providerFactory: () => { throw new AiError('ai_not_configured', 'x'); } });
    const res = await handleAiParse(post(SALE), h.deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_not_configured', message: expect.any(String) });
    expect(h.rpcCalls).toHaveLength(0);
  });

  it('haqiqiy createProvider: Gemini kalitsiz → ai_not_configured (13.11: Gemini standart, kalit shart)', async () => {
    const h = harness({ env: { AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-2.5-flash' } });
    delete (h.deps as Partial<AiParseDeps>).createProvider;
    const res = await handleAiParse(post(SALE), h.deps);
    expect((await res.json()).error).toBe('ai_not_configured');
  });
});

describe('handleAiParse: baza javoblari', () => {
  const cases: Array<[string, number, string]> = [
    ['ai_daily_limit', 429, 'ai_daily_limit'],
    ['forbidden', 403, 'forbidden'],
    ['oauth_client_forbidden', 403, 'oauth_client_forbidden'],
    ['not_authenticated', 401, 'unauthorized'],
    ['permission denied for function ai_begin_request', 403, 'forbidden'],
    ['something else', 500, 'internal_error'],
  ];
  for (const [msg, status, code] of cases) {
    it(`begin "${msg}" → ${status} ${code}; provayder chaqirilmaydi`, async () => {
      const h = harness({ begin: { data: null, error: { message: msg } } });
      const res = await handleAiParse(post(SALE), h.deps);
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(code);
      expect(h.provider.calls).toHaveLength(0);
      expect(h.catalogCalls).toBe(0);
      expect(h.rpcCalls.map((c) => c.fn)).toEqual(['ai_begin_request']);
    });
  }

  it('mapBeginError PostgREST xabaridagi kodni topadi', () => {
    expect(mapBeginError('ERROR: ai_daily_limit (P0001)').code).toBe('ai_daily_limit');
  });

  it('katalog o\'qilmasa → finish error catalog_unavailable', async () => {
    const h = harness({ catalog: new Error('db') });
    const res = await handleAiParse(post(SALE), h.deps);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('catalog_unavailable');
    expect(h.rpcCalls[1].args).toMatchObject({ p_status: 'error', p_error_code: 'catalog_unavailable' });
    expect(h.provider.calls).toHaveLength(0);
  });
});

describe('handleAiParse: provayder xatolari finish bilan yoziladi', () => {
  const cases: Array<[MockReply, number, string]> = [
    [{ error: 'ai_timeout' }, 504, 'ai_timeout'],
    [{ error: 'ai_provider_error' }, 502, 'ai_provider_error'],
    [{ error: 'ai_provider_busy' }, 503, 'ai_provider_busy'],
    [{ error: 'ai_refused', usage: { inputTokens: 7, outputTokens: 1 } }, 422, 'ai_refused'],
    [{ error: 'ai_output_truncated' }, 422, 'ai_output_truncated'],
    ['bu JSON emas', 502, 'ai_bad_output'],
    ['{"lines": 5}', 502, 'ai_bad_output'],
  ];
  for (const [reply, status, code] of cases) {
    it(`${code} → ${status}`, async () => {
      const h = harness({ reply });
      const res = await handleAiParse(post(SALE), h.deps);
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.error).toBe(code);
      expect(body.lines).toBeUndefined();
      const fin = h.rpcCalls.find((c) => c.fn === 'ai_finish_request');
      expect(fin?.args).toMatchObject({ p_request_id: REQ_ID, p_status: 'error', p_error_code: code });
    });
  }

  it('ai_bad_output: sarflangan tokenlar baribir yoziladi', async () => {
    const h = harness({ reply: { text: 'yomon', usage: { inputTokens: 900, outputTokens: 12 } } });
    await handleAiParse(post(SALE), h.deps);
    expect(h.rpcCalls[1].args).toMatchObject({ p_input_tokens: 900, p_output_tokens: 12 });
  });

  it('katalog sekin bo\'lib 20 s tugasa provayder chaqirilmaydi → 504 ai_timeout', async () => {
    const h = harness();
    let t = 0;
    h.deps.now = () => t;
    const origLoad = h.deps.loadCatalog;
    h.deps.loadCatalog = async (...a) => { t = TOTAL_TIMEOUT_MS - 500; return origLoad(...a); };
    const res = await handleAiParse(post(SALE), h.deps);
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBe('ai_timeout');
    expect(h.provider.calls).toHaveLength(0);
    expect(h.rpcCalls[1].args).toMatchObject({ p_status: 'error', p_error_code: 'ai_timeout' });
  });

  it('kutilmagan xato → 500 internal_error, finish error', async () => {
    const h = harness({ reply: () => { throw new Error('boom'); } });
    const res = await handleAiParse(post(SALE), h.deps);
    expect(res.status).toBe(500);
    expect(h.rpcCalls[1].args).toMatchObject({ p_status: 'error', p_error_code: 'internal_error' });
  });

  it('finish xatosi muvaffaqiyatli javobni buzmaydi', async () => {
    const h = harness();
    const orig = h.deps.rpc;
    h.deps.rpc = async (j, fn, args) => (fn === 'ai_finish_request' ? { data: null, error: { message: 'x' } } : orig(j, fn, args));
    const res = await handleAiParse(post(SALE), h.deps);
    expect(res.status).toBe(200);
    expect(h.logs.some((l) => l.code === 'finish_failed')).toBe(true);
  });
});

describe('decodeJwtClaims', () => {
  it('base64url payload, yaroqsiz shakllar null', () => {
    expect(decodeJwtClaims(jwt({ sub: 'x', name: 'Ўзбек' }))).toEqual({ sub: 'x', name: 'Ўзбек' });
    expect(decodeJwtClaims('a.b')).toBeNull();
    expect(decodeJwtClaims('a.!!!.c')).toBeNull();
    expect(decodeJwtClaims(`a.${b64url([1, 2])}.c`)).toBeNull();
  });
});
