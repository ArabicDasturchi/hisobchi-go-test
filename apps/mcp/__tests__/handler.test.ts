import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFetchHandler } from '../src/handler.js';
import { fakeDb, makeKeys, signToken, testConfig, type Keys } from './helpers.js';

let keys: Keys;
beforeAll(async () => {
  keys = await makeKeys();
});

function setup(cfg = testConfig(), db = fakeDb()) {
  const createDb = vi.fn((_token: string) => db);
  const handle = createFetchHandler({ config: cfg, key: keys.publicKey, createDb, now: () => new Date('2026-11-02T10:00:00Z') });
  return { handle, createDb, db };
}

const MCP = 'https://mcp.example.com/mcp';
function rpc(token: string | null, body: unknown, extra: Record<string, string> = {}): Request {
  return new Request(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}

describe('HTTP qatlami', () => {
  it('tokensiz so\'rov 401 va resource_metadata bilan', async () => {
    const { handle, createDb } = setup();
    const res = await handle(rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"');
    expect(createDb).not.toHaveBeenCalled();
  });

  it('MUDDATI O\'TGAN token 401 invalid_token, baza klienti yaratilmaydi', async () => {
    const { handle, createDb } = setup();
    const token = await signToken(keys.privateKey, { exp: Math.floor(Date.now() / 1000) - 3600 });
    const res = await handle(rpc(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
    expect(createDb).not.toHaveBeenCalled();
  });

  it('client_id yo\'q token productionda 403', async () => {
    const { handle, createDb } = setup();
    const token = await signToken(keys.privateKey, { clientId: null });
    const res = await handle(rpc(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(403);
    expect(createDb).not.toHaveBeenCalled();
  });

  it('protected resource metadata Supabase Auth\'ni ko\'rsatadi', async () => {
    const { handle } = setup();
    for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const res = await handle(new Request(`https://mcp.example.com${p}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        resource: 'https://mcp.example.com/mcp',
        authorization_servers: ['https://proj.supabase.co/auth/v1'],
        bearer_methods_supported: ['header'],
        resource_name: 'Hisobchi Go',
      });
    }
  });

  it('GET /mcp 405, noma\'lum yo\'l 404, /health 200', async () => {
    const { handle } = setup();
    expect((await handle(new Request(MCP))).status).toBe(405);
    expect((await handle(new Request(MCP, { method: 'DELETE' }))).status).toBe(405);
    expect((await handle(new Request('https://mcp.example.com/boshqa'))).status).toBe(404);
    expect((await handle(new Request('https://mcp.example.com/health'))).status).toBe(200);
  });

  it('juda katta so\'rov 413', async () => {
    const { handle } = setup();
    const token = await signToken(keys.privateKey);
    const res = await handle(rpc(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'content-length': String(10 * 1024 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('yaroqli token: tools/list 11 ta asbob qaytaradi, DB klienti shu token bilan yaratiladi', async () => {
    const { handle, createDb } = setup();
    const token = await signToken(keys.privateKey);
    const res = await handle(rpc(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools).toHaveLength(11);
    expect(createDb).toHaveBeenCalledWith(token);
  });

  it('boshdan oxirigacha: draft_sale 385 000 HTTP orqali, savdo yozuvchi metod chaqirilmaydi', async () => {
    const { handle, db } = setup();
    const token = await signToken(keys.privateKey);
    const res = await handle(
      rpc(token, {
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'draft_sale',
          arguments: {
            lines: [
              { product_name: 'chirmoq', qty: '10', price: '13 ming' },
              { product_name: 'yurak', qty: '5', price: '15 ming' },
              { product_name: 'momiq', qty: '20', price: '9 ming' },
            ],
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { content: Array<{ text: string }>; isError?: boolean } };
    expect(body.result.isError).toBeFalsy();
    expect(JSON.parse(body.result.content[0]!.text)).toMatchObject({ total: 385000, status: 'draft' });
    expect(db.draftSale.mock.calls[0]![0].clientTotal).toBe(385000n);
    expect(db.draftPayment).not.toHaveBeenCalled();
  });
});
