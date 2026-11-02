import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthError, authenticate } from '../src/auth.js';
import { makeKeys, signToken, SUPABASE, testConfig, USER, type Keys } from './helpers.js';

let keys: Keys;
let other: Keys;
beforeAll(async () => {
  keys = await makeKeys();
  other = await makeKeys();
});

async function reject(token: string, cfg = testConfig(), key = keys.publicKey): Promise<AuthError> {
  try {
    await authenticate(token, cfg, key);
  } catch (e) {
    expect(e).toBeInstanceOf(AuthError);
    return e as AuthError;
  }
  throw new Error('token rad etilishi kerak edi');
}

describe('authenticate', () => {
  it('yaroqli OAuth tokenni qabul qiladi', async () => {
    const r = await authenticate(await signToken(keys.privateKey), testConfig(), keys.publicKey);
    expect(r.userId).toBe(USER);
    expect(r.clientId).toBe('claude-test-client');
  });

  it('MUDDATI O\'TGAN tokenni rad etadi', async () => {
    const e = await reject(await signToken(keys.privateKey, { exp: Math.floor(Date.now() / 1000) - 3600 }));
    expect(e.code).toBe('invalid_token');
    expect(e.message).toMatch(/JWTExpired/);
  });

  it('exp claim\'i yo\'q tokenni rad etadi', async () => {
    expect((await reject(await signToken(keys.privateKey, { exp: null }))).code).toBe('invalid_token');
  });

  it('boshqa kalit bilan imzolangan tokenni rad etadi', async () => {
    expect((await reject(await signToken(other.privateKey))).code).toBe('invalid_token');
  });

  it('o\'zgartirilgan (tamper) tokenni rad etadi', async () => {
    const t = await signToken(keys.privateKey);
    const [h, p, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), sub: 'b2b2b2b2-0000-0000-0000-000000000002' })).toString('base64url');
    expect((await reject(`${h}.${forged}.${s}`)).code).toBe('invalid_token');
  });

  it('noto\'g\'ri issuer va audience\'ni rad etadi', async () => {
    expect((await reject(await signToken(keys.privateKey, { iss: 'https://evil.example.com/auth/v1' }))).code).toBe('invalid_token');
    expect((await reject(await signToken(keys.privateKey, { aud: 'anon' }))).code).toBe('invalid_token');
  });

  it('HS256 (simmetrik) tokenni rad etadi', async () => {
    const t = await new SignJWT({ role: 'authenticated', client_id: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER)
      .setIssuer(`${SUPABASE}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('secret-secret-secret-secret-1234'));
    expect((await reject(t)).code).toBe('invalid_token');
  });

  it('sub UUID bo\'lmasa va role noto\'g\'ri bo\'lsa rad etadi', async () => {
    expect((await reject(await signToken(keys.privateKey, { sub: 'not-a-uuid' }))).code).toBe('invalid_token');
    expect((await reject(await signToken(keys.privateKey, { role: 'service_role' }))).code).toBe('invalid_token');
  });

  it('client_id yo\'q token productionda rad etiladi (403), lokal devda ruxsat', async () => {
    const t = await signToken(keys.privateKey, { clientId: null });
    expect((await reject(t)).code).toBe('forbidden');
    const r = await authenticate(t, testConfig({ allowFirstPartyToken: true, isProduction: false }), keys.publicKey);
    expect(r.clientId).toBeNull();
  });

  it('MCP_ALLOWED_CLIENT_IDS bo\'lsa, boshqa klient rad etiladi', async () => {
    const cfg = testConfig({ allowedClientIds: ['known'] });
    expect((await reject(await signToken(keys.privateKey, { clientId: 'stranger' }), cfg)).code).toBe('forbidden');
    expect((await authenticate(await signToken(keys.privateKey, { clientId: 'known' }), cfg, keys.publicKey)).clientId).toBe('known');
  });
});
