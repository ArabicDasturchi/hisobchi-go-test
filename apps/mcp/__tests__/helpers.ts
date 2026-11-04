import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { vi } from 'vitest';
import type { Config } from '../src/config.js';
import type { AgentDb, Shop } from '../src/db.js';

export const SUPABASE = 'https://proj.supabase.co';
export const USER = 'a2a2a2a2-0000-0000-0000-000000000001';
export const SHOP = '11111111-1111-4111-8111-111111111111';
export const CUSTOMER = 'c2c2c2c2-0000-4000-8000-000000000001';

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    supabaseUrl: SUPABASE,
    publishableKey: 'sb_publishable_testtesttesttesttest',
    issuer: `${SUPABASE}/auth/v1`,
    jwksUrl: new URL(`${SUPABASE}/auth/v1/.well-known/jwks.json`),
    publicUrl: 'https://mcp.example.com',
    allowFirstPartyToken: false,
    allowedClientIds: [],
    isProduction: true,
    ...over,
  };
}

export interface Keys {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}
export async function makeKeys(): Promise<Keys> {
  return (await generateKeyPair('ES256')) as Keys;
}

interface TokenOpts {
  sub?: string;
  clientId?: string | null;
  iss?: string;
  aud?: string;
  /** epoch soniya; null — exp yo'q */
  exp?: number | null;
  role?: string;
}
export async function signToken(privateKey: CryptoKey, o: TokenOpts = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { role: o.role ?? 'authenticated' };
  if (o.clientId !== null) claims.client_id = o.clientId ?? 'claude-test-client';
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(o.sub ?? USER)
    .setIssuer(o.iss ?? `${SUPABASE}/auth/v1`)
    .setAudience(o.aud ?? 'authenticated')
    .setIssuedAt(now - 10);
  if (o.exp !== null) jwt = jwt.setExpirationTime(o.exp ?? now + 3600);
  return jwt.sign(privateKey);
}

export const ONE_SHOP: Shop[] = [{ shop_id: SHOP, shop_name: 'A do\'koni', role: 'owner' }];

/** Barcha AgentDb metodlari kuzatiladi (vi.fn). */
export function fakeDb(over: Partial<AgentDb> = {}): { [K in keyof AgentDb]: ReturnType<typeof vi.fn> } & AgentDb {
  const db = {
    whoami: vi.fn(async () => ONE_SHOP),
    listCustomers: vi.fn(async () => []),
    customerBalance: vi.fn(async () => ({ id: CUSTOMER, name: 'Karim', outstanding: 285000n })),
    listSales: vi.fn(async () => []),
    getSale: vi.fn(async () => {
      throw new Error('mock');
    }),
    dayRows: vi.fn(async () => ({
      day: '2026-11-02',
      sales: [],
      payments: [],
      pg_totals: { sales_posted: 0n, sales_reversed: 0n, payments: 0n },
    })),
    listProducts: vi.fn(async () => []),
    addCustomer: vi.fn(async () => ({ id: CUSTOMER, name: 'Rahim aka', created: true, is_active: true, source: 'agent' })),
    addProducts: vi.fn(async () => ({ created: [], existing: [], created_count: 0, existing_count: 0 })),
    proposeCustomerUpdate: vi.fn(async () => 'e4e4e4e4-0000-4000-8000-000000000001'),
    proposeProductUpdate: vi.fn(async () => 'e4e4e4e4-0000-4000-8000-000000000002'),
    proposeArchive: vi.fn(async () => 'e4e4e4e4-0000-4000-8000-000000000003'),
    draftSale: vi.fn(async () => 'd3d3d3d3-0000-4000-8000-000000000001'),
    draftPayment: vi.fn(async () => 'd3d3d3d3-0000-4000-8000-000000000002'),
    ...over,
  };
  return db as never;
}
