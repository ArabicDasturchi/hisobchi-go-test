import { describe, expect, it } from 'vitest';
import { createOpenAiCompatibleProvider } from '../providers/openaiCompatible.ts';
import { ANTHROPIC_VERSION, createAnthropicProvider } from '../providers/anthropic.ts';
import { createMockProvider } from '../providers/mock.ts';
import { createGeminiProvider } from '../providers/gemini.ts';
import { createProvider, SUPPORTED_PROVIDERS } from '../provider.ts';
import { AiError, type FetchLike, type LlmRequest } from '../types.ts';

interface Captured {
  url: string;
  init: RequestInit;
  body: any;
  headers: Record<string, string>;
}

function fetchMock(status: number, json: unknown): { fetch: FetchLike; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

/** Signal bekor qilinguncha kutadigan fetch (timeout testi) */
const hangingFetch: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const REQ: LlmRequest = { system: 'SYS', user: 'USR', maxOutputTokens: 1000, timeoutMs: 5000 };
const IMG = { mime: 'image/png', base64: 'iVBORw0KGgo=' };

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(AiError);
  await expect(p).rejects.toMatchObject({ code });
}

const OPENAI_OK = {
  model: 'qwen3:latest',
  choices: [{ message: { role: 'assistant', content: '{"lines":[]}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 120, completion_tokens: 30 },
};
const ANTHROPIC_OK = {
  model: 'claude-x',
  content: [
    { type: 'thinking', thinking: '' },
    { type: 'text', text: '{"lines":' },
    { type: 'text', text: '[]}' },
  ],
  stop_reason: 'end_turn',
  usage: { input_tokens: 200, output_tokens: 40, cache_read_input_tokens: 10 },
};

const GEMINI_OK = {
  modelVersion: 'gemini-2.5-flash-001',
  candidates: [{ content: { role: 'model', parts: [{ text: 'fikr', thought: true }, { text: '{"lines":' }, { text: '[]}' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 25 },
};

describe('gemini', () => {
  it("so'rov tanasi: systemInstruction, contents, JSON rejim, maxOutputTokens, rasm inline_data", async () => {
    const m = fetchMock(200, GEMINI_OK);
    const p = createGeminiProvider({ apiKey: 'k', model: 'models/gemini-2.5-flash', fetch: m.fetch });
    const res = await p.complete({ ...REQ, images: [IMG] });
    expect(m.calls[0].body).toEqual({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'USR' }, { inline_data: { mime_type: 'image/png', data: IMG.base64 } }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000 },
    });
    expect(m.calls[0].url).toContain('/models/gemini-2.5-flash:generateContent');
    // "fikrlash" qismi javobga qo'shilmaydi
    expect(res).toEqual({ text: '{"lines":[]}', usage: { inputTokens: 150, outputTokens: 25 }, model: 'gemini-2.5-flash-001' });
  });

  it('xatolar: MAX_TOKENS, SAFETY, bloklangan so‘rov, bo‘sh javob, 429, timeout', async () => {
    const mk = (json: unknown, status = 200) => createGeminiProvider({ apiKey: 'k', model: 'g', fetch: fetchMock(status, json).fetch });
    await expectCode(mk({ candidates: [{ content: { parts: [{ text: '{' }] }, finishReason: 'MAX_TOKENS' }] }).complete(REQ), 'ai_output_truncated');
    await expectCode(mk({ candidates: [{ finishReason: 'SAFETY' }] }).complete(REQ), 'ai_refused');
    await expectCode(mk({ promptFeedback: { blockReason: 'SAFETY' } }).complete(REQ), 'ai_refused');
    await expectCode(mk({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }).complete(REQ), 'ai_bad_output');
    await expectCode(mk({ candidates: [] }).complete(REQ), 'ai_bad_output');
    await expectCode(mk({ error: { message: 'quota' } }, 429).complete(REQ), 'ai_provider_busy');
    await expectCode(mk({}, 400).complete(REQ), 'ai_provider_error');
    await expectCode(createGeminiProvider({ apiKey: 'k', model: 'g', fetch: hangingFetch }).complete({ ...REQ, timeoutMs: 20 }), 'ai_timeout');
  });
});

describe('openaiCompatible', () => {
  it('so\'rov tanasi: /chat/completions, system+user, max_tokens, json rejim, Bearer', async () => {
    const m = fetchMock(200, OPENAI_OK);
    const p = createOpenAiCompatibleProvider({ baseUrl: 'http://localhost:11434/v1/', model: 'qwen3:latest', apiKey: 'sk-test', fetch: m.fetch });
    const res = await p.complete(REQ);
    expect(m.calls[0].url).toBe('http://localhost:11434/v1/chat/completions');
    expect(m.calls[0].init.method).toBe('POST');
    expect(m.calls[0].headers.authorization).toBe('Bearer sk-test');
    expect(m.calls[0].body).toEqual({
      model: 'qwen3:latest',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USR' },
      ],
      max_tokens: 1000,
      stream: false,
      response_format: { type: 'json_object' },
    });
    expect(res).toEqual({ text: '{"lines":[]}', usage: { inputTokens: 120, outputTokens: 30 }, model: 'qwen3:latest' });
  });

  it('rasm image_url data URL bo\'lib ketadi; kalitsiz Authorization yo\'q; jsonMode off; temperature', async () => {
    const m = fetchMock(200, OPENAI_OK);
    const p = createOpenAiCompatibleProvider({ baseUrl: 'https://api.example.com/v1', model: 'm', jsonMode: false, temperature: 0, fetch: m.fetch });
    await p.complete({ ...REQ, images: [IMG] });
    expect(m.calls[0].headers.authorization).toBeUndefined();
    expect(m.calls[0].body.response_format).toBeUndefined();
    expect(m.calls[0].body.temperature).toBe(0);
    expect(m.calls[0].body.messages[1].content).toEqual([
      { type: 'text', text: 'USR' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
    ]);
  });

  it('xatolar: HTTP 500 → provider_error, 429 → busy, length → truncated, refusal → refused, bo\'sh → bad_output', async () => {
    const mk = (status: number, json: unknown) => createOpenAiCompatibleProvider({ baseUrl: 'https://x/v1', model: 'm', fetch: fetchMock(status, json).fetch });
    await expectCode(mk(500, { error: 'boom' }).complete(REQ), 'ai_provider_error');
    await expectCode(mk(429, {}).complete(REQ), 'ai_provider_busy');
    await expectCode(mk(200, { choices: [{ message: { content: '{"li' }, finish_reason: 'length' }] }).complete(REQ), 'ai_output_truncated');
    await expectCode(mk(200, { choices: [{ message: { content: null, refusal: 'no' }, finish_reason: 'stop' }] }).complete(REQ), 'ai_refused');
    await expectCode(mk(200, { choices: [{ message: { content: '  ' }, finish_reason: 'stop' }] }).complete(REQ), 'ai_bad_output');
    await expectCode(mk(200, { choices: [] }).complete(REQ), 'ai_bad_output');
  });

  it('HTTP xato xabarida javob tanasi (foydalanuvchi matni) yo\'q', async () => {
    const p = createOpenAiCompatibleProvider({ baseUrl: 'https://x/v1', model: 'm', fetch: fetchMock(400, { error: { message: 'Karim aka 10 chirmoq' } }).fetch });
    const e = await p.complete(REQ).catch((x) => x);
    expect(e.code).toBe('ai_provider_error');
    expect(e.httpStatus).toBe(400);
    expect(String(e.message)).not.toContain('Karim');
  });

  it('timeout → ai_timeout', async () => {
    const p = createOpenAiCompatibleProvider({ baseUrl: 'https://x/v1', model: 'm', fetch: hangingFetch });
    const t0 = Date.now();
    await expectCode(p.complete({ ...REQ, timeoutMs: 50 }), 'ai_timeout');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('tarmoq xatosi → ai_provider_error', async () => {
    const p = createOpenAiCompatibleProvider({ baseUrl: 'https://x/v1', model: 'm', fetch: async () => { throw new TypeError('fetch failed'); } });
    await expectCode(p.complete(REQ), 'ai_provider_error');
  });
});

describe('anthropic', () => {
  it('so\'rov tanasi: /v1/messages, x-api-key, anthropic-version, temperature yo\'q', async () => {
    const m = fetchMock(200, ANTHROPIC_OK);
    const p = createAnthropicProvider({ apiKey: 'ak-test', model: 'claude-x', fetch: m.fetch });
    const res = await p.complete({ ...REQ, images: [IMG] });
    expect(m.calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(m.calls[0].headers['x-api-key']).toBe('ak-test');
    expect(m.calls[0].headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(m.calls[0].headers.authorization).toBeUndefined();
    expect(m.calls[0].body).toEqual({
      model: 'claude-x',
      max_tokens: 1000,
      system: 'SYS',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
            { type: 'text', text: 'USR' },
          ],
        },
      ],
    });
    expect('temperature' in m.calls[0].body).toBe(false);
    // faqat text bloklari, thinking tashlanadi; kesh tokenlari kirishga qo'shiladi
    expect(res).toEqual({ text: '{"lines":[]}', usage: { inputTokens: 210, outputTokens: 40 }, model: 'claude-x' });
  });

  it('stop_reason: refusal → ai_refused, max_tokens → ai_output_truncated; 529 → busy', async () => {
    const mk = (status: number, json: unknown) => createAnthropicProvider({ apiKey: 'k', model: 'm', fetch: fetchMock(status, json).fetch });
    await expectCode(mk(200, { ...ANTHROPIC_OK, stop_reason: 'refusal' }).complete(REQ), 'ai_refused');
    await expectCode(mk(200, { ...ANTHROPIC_OK, stop_reason: 'max_tokens' }).complete(REQ), 'ai_output_truncated');
    await expectCode(mk(529, {}).complete(REQ), 'ai_provider_busy');
    await expectCode(mk(200, { ...ANTHROPIC_OK, content: [] }).complete(REQ), 'ai_bad_output');
  });

  it('timeout → ai_timeout', async () => {
    const p = createAnthropicProvider({ apiKey: 'k', model: 'm', fetch: hangingFetch });
    await expectCode(p.complete({ ...REQ, timeoutMs: 30 }), 'ai_timeout');
  });
});

describe('mock', () => {
  it('chaqiruvlarni yozadi va xato tashlay oladi', async () => {
    const ok = createMockProvider('{"lines":[]}');
    await ok.complete(REQ);
    expect(ok.calls).toHaveLength(1);
    await expectCode(createMockProvider({ error: 'ai_timeout' }).complete(REQ), 'ai_timeout');
  });
});

describe('createProvider', () => {
  it('qo‘llanadigan provayderlar: gemini (standart), openai-compatible, openrouter (tayyor, yoqilmagan), anthropic', () => {
    expect([...SUPPORTED_PROVIDERS]).toEqual(['gemini', 'openai-compatible', 'openrouter', 'anthropic']);
    for (const name of ['google', 'vertex', 'openai']) {
      expect(() => createProvider({ AI_PROVIDER: name, AI_MODEL: 'm', AI_API_KEY: 'k' })).toThrowError(
        expect.objectContaining({ code: 'ai_not_configured' }),
      );
    }
  });

  it('standart: AI_PROVIDER berilmasa, faqat kalit bilan Gemini (gemini-2.5-flash); kalitsiz — sozlanmagan', async () => {
    const m = fetchMock(200, GEMINI_OK);
    const p = createProvider({ AI_API_KEY: 'g-key' }, { fetch: m.fetch });
    expect(p.kind).toBe('gemini');
    expect(p.model).toBe('gemini-2.5-flash');
    await p.complete(REQ);
    expect(m.calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(() => createProvider({})).toThrowError(expect.objectContaining({ code: 'ai_not_configured' }));
    // OpenRouter faqat aniq tanlansa (avtomatik yoqilmaydi)
    expect(createProvider({ AI_API_KEY: 'k' }).kind).not.toBe('openai-compatible');
  });

  it('gemini va openrouter kalitsiz ishlamaydi', () => {
    for (const env of [{ AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-2.5-flash' }, { AI_PROVIDER: 'openrouter', AI_MODEL: 'google/gemini-2.5-flash' }]) {
      expect(() => createProvider(env)).toThrowError(expect.objectContaining({ code: 'ai_not_configured' }));
    }
  });

  it('gemini: standart manzil, model URL ichida, kalit faqat sarlavhada', async () => {
    const m = fetchMock(200, GEMINI_OK);
    const p = createProvider({ AI_PROVIDER: ' GEMINI ', AI_MODEL: 'gemini-2.5-flash', AI_API_KEY: 'g-key' }, { fetch: m.fetch });
    expect(p.kind).toBe('gemini');
    await p.complete(REQ);
    expect(m.calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(m.calls[0].url).not.toContain('g-key');
    expect(m.calls[0].headers['x-goog-api-key']).toBe('g-key');
  });

  it('openrouter preset: OpenRouter manzili, Bearer kalit', async () => {
    const m = fetchMock(200, OPENAI_OK);
    const p = createProvider({ AI_PROVIDER: 'openrouter', AI_MODEL: 'google/gemini-2.5-flash', AI_API_KEY: 'or-key' }, { fetch: m.fetch });
    expect(p.kind).toBe('openai-compatible');
    await p.complete(REQ);
    expect(m.calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(m.calls[0].headers.authorization).toBe('Bearer or-key');
  });

  it('sozlanmagan → ai_not_configured', () => {
    const cases = [
      {},
      { AI_PROVIDER: '' },
      { AI_PROVIDER: 'anthropic' },
      { AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-x' },
      { AI_PROVIDER: 'openai-compatible' },
      { AI_PROVIDER: 'openai-compatible', AI_MODEL: 'bad model with spaces' },
      { AI_PROVIDER: 'openai-compatible', AI_MODEL: 'm', AI_BASE_URL: 'http://api.example.com/v1' },
      { AI_PROVIDER: 'openai-compatible', AI_MODEL: 'm', AI_BASE_URL: 'not a url' },
      { AI_PROVIDER: 'openai-compatible', AI_MODEL: 'm', AI_BASE_URL: 'https://u:p@x.com/v1' },
      { AI_PROVIDER: 'openai-compatible', AI_MODEL: 'm', AI_TEMPERATURE: 'issiq' },
    ];
    for (const env of cases) {
      expect(() => createProvider(env)).toThrowError(expect.objectContaining({ code: 'ai_not_configured' }));
    }
  });

  it('openai-compatible: standart OpenAI URL, Ollama lokal http ruxsat, kalitsiz ishlaydi', async () => {
    const m = fetchMock(200, OPENAI_OK);
    const p = createProvider({ AI_PROVIDER: 'openai-compatible', AI_MODEL: 'gpt-x', AI_API_KEY: 'sk' }, { fetch: m.fetch });
    expect(p.kind).toBe('openai-compatible');
    await p.complete(REQ);
    expect(m.calls[0].url).toBe('https://api.openai.com/v1/chat/completions');

    const m2 = fetchMock(200, OPENAI_OK);
    const o = createProvider(
      { AI_PROVIDER: ' OpenAI-Compatible ', AI_MODEL: 'qwen3:latest', AI_BASE_URL: 'http://localhost:11434/v1', AI_TEMPERATURE: '0', AI_JSON_MODE: 'off' },
      { fetch: m2.fetch },
    );
    await o.complete(REQ);
    expect(m2.calls[0].url).toBe('http://localhost:11434/v1/chat/completions');
    expect(m2.calls[0].headers.authorization).toBeUndefined();
    expect(m2.calls[0].body.temperature).toBe(0);
    expect(m2.calls[0].body.response_format).toBeUndefined();
  });

  it('anthropic: AI_BASE_URL bilan (proxy)', async () => {
    const m = fetchMock(200, ANTHROPIC_OK);
    const p = createProvider({ AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-x', AI_API_KEY: 'k', AI_BASE_URL: 'https://proxy.example.com/' }, { fetch: m.fetch });
    expect(p.kind).toBe('anthropic');
    await p.complete(REQ);
    expect(m.calls[0].url).toBe('https://proxy.example.com/v1/messages');
  });
});
