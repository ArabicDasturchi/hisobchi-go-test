import { jwtVerify, type CryptoKey, type JWTVerifyGetKey } from 'jose';
import type { Config } from './config.js';

export class AuthError extends Error {
  constructor(
    /** invalid_token → 401, forbidden → 403 */
    readonly code: 'invalid_token' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthedToken {
  userId: string;
  /** OAuth klient; oddiy sessiya tokenida yo'q */
  clientId: string | null;
  expiresAt: number;
}

export type KeyInput = JWTVerifyGetKey | CryptoKey;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supabase JWT'sini tekshiradi: imzo (faqat asimmetrik algoritmlar, JWKS), issuer, audience, muddat.
 * HS256 qabul qilinmaydi (algoritm almashtirish hujumiga yo'l yo'q).
 * Token PostgREST'da yana bir bor Supabase tomonidan tekshiriladi.
 */
export async function authenticate(token: string, cfg: Config, key: KeyInput): Promise<AuthedToken> {
  const options = {
    issuer: cfg.issuer,
    audience: 'authenticated',
    algorithms: ['ES256', 'RS256', 'EdDSA'],
    requiredClaims: ['exp', 'sub'],
    clockTolerance: 5,
  };
  let payload;
  try {
    ({ payload } = typeof key === 'function' ? await jwtVerify(token, key, options) : await jwtVerify(token, key, options));
  } catch (e) {
    const reason = e instanceof Error ? e.name : 'JWTInvalid';
    throw new AuthError('invalid_token', `Token yaroqsiz (${reason})`);
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!UUID.test(sub)) throw new AuthError('invalid_token', 'Token yaroqsiz (sub)');
  if (payload.role !== undefined && payload.role !== 'authenticated') {
    throw new AuthError('invalid_token', 'Token yaroqsiz (role)');
  }
  const clientId = typeof payload.client_id === 'string' && payload.client_id !== '' ? payload.client_id : null;

  if (clientId === null && !cfg.allowFirstPartyToken) {
    throw new AuthError('forbidden', 'OAuth klient tokeni kerak (oddiy sessiya tokeni qabul qilinmaydi)');
  }
  if (clientId !== null && cfg.allowedClientIds.length > 0 && !cfg.allowedClientIds.includes(clientId)) {
    throw new AuthError('forbidden', 'Bu OAuth klientga ruxsat berilmagan');
  }
  return { userId: sub, clientId, expiresAt: payload.exp ?? 0 };
}
