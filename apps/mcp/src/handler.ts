/**
 * HTTP qatlami (Web standart Request/Response): Vercel funksiyasi ham, lokal server ham, testlar ham shuni ishlatadi.
 *
 *   GET  /health                                          — tekshiruv
 *   GET  /.well-known/oauth-protected-resource[/mcp]      — RFC 9728 metadata (authorization server = Supabase Auth)
 *   POST /mcp                                             — Streamable HTTP (stateless, JSON javob)
 *
 * Har so'rov mustaqil: token tekshiriladi, foydalanuvchi tokeni bilan DB klienti yaratiladi, yangi MCP server quriladi.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { AuthError, authenticate, type AuthedToken, type KeyInput } from './auth.js';
import type { Config } from './config.js';
import type { AgentDb } from './db.js';
import { buildMcpServer } from './server.js';

export interface HandlerDeps {
  config: Config;
  key: KeyInput;
  /** Foydalanuvchi tokeni bilan ma'lumotlar qatlami */
  createDb: (accessToken: string) => AgentDb;
  now?: () => Date;
}

const MAX_BODY_BYTES = 256 * 1024;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function metadataUrl(cfg: Config): string {
  return `${cfg.publicUrl}/.well-known/oauth-protected-resource/mcp`;
}

function unauthorized(cfg: Config, description?: string): Response {
  const challenge = [`resource_metadata="${metadataUrl(cfg)}"`];
  if (description) challenge.push('error="invalid_token"', `error_description="${description.replace(/"/g, "'")}"`);
  return json(
    401,
    { error: 'unauthorized', error_description: description ?? 'Authorization: Bearer <token> kerak' },
    { 'www-authenticate': `Bearer ${challenge.join(', ')}` },
  );
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? (m[1] ?? null) : null;
}

export function createFetchHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const { config } = deps;
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;

    if (path === '/health') return json(200, { ok: true });

    if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') {
      if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' }, { allow: 'GET' });
      return json(200, {
        resource: `${config.publicUrl}/mcp`,
        authorization_servers: [config.issuer],
        bearer_methods_supported: ['header'],
        resource_name: 'Hisobchi Go',
      });
    }

    if (path !== '/mcp') return json(404, { error: 'not_found' });
    // Stateless server: SSE oqimi (GET) va sessiya o'chirish (DELETE) yo'q
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { allow: 'POST' });

    const token = bearer(req);
    if (!token) return unauthorized(config);
    let auth: AuthedToken;
    try {
      auth = await authenticate(token, config, deps.key);
    } catch (e) {
      if (e instanceof AuthError) {
        return e.code === 'forbidden' ? json(403, { error: 'forbidden', error_description: e.message }) : unauthorized(config, e.message);
      }
      return unauthorized(config, 'Token yaroqsiz');
    }

    const declared = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413, { error: 'payload_too_large' });

    const server = buildMcpServer({ db: deps.createDb(token), now });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      return await transport.handleRequest(req, { authInfo: { token: '', clientId: auth.clientId ?? 'first_party', scopes: [], expiresAt: auth.expiresAt } });
    } catch (e) {
      console.error('mcp so\'rov xatosi:', e instanceof Error ? e.message : 'noma\'lum');
      return json(500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  };
}
