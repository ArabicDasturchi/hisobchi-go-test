import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, looksLikeServiceKey } from '../src/config.js';

const base = {
  SUPABASE_URL: 'https://proj.supabase.co/',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest',
  MCP_PUBLIC_URL: 'https://mcp.example.com/',
};

function problems(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (e) {
    if (e instanceof ConfigError) return e.problems;
    throw e;
  }
  return [];
}

describe('loadConfig', () => {
  it('to\'g\'ri sozlamani o\'qiydi va URL\'larni normallashtiradi', () => {
    const c = loadConfig(base);
    expect(c.supabaseUrl).toBe('https://proj.supabase.co');
    expect(c.issuer).toBe('https://proj.supabase.co/auth/v1');
    expect(c.jwksUrl.toString()).toBe('https://proj.supabase.co/auth/v1/.well-known/jwks.json');
    expect(c.publicUrl).toBe('https://mcp.example.com');
  });

  it('yetishmayotgan o\'zgaruvchilarni nomma-nom aytadi', () => {
    expect(problems({})).toEqual(
      expect.arrayContaining(['SUPABASE_URL berilmagan', 'MCP_PUBLIC_URL berilmagan', 'SUPABASE_PUBLISHABLE_KEY berilmagan']),
    );
  });

  it('http faqat localhost uchun', () => {
    expect(problems({ ...base, SUPABASE_URL: 'http://proj.supabase.co' })).toContain("SUPABASE_URL https bo'lishi kerak");
    expect(problems({ ...base, MCP_PUBLIC_URL: 'http://localhost:8787' })).toEqual([]);
  });

  it('service_role / secret kalitni rad etadi', () => {
    expect(problems({ ...base, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_aaaaaaaaaaaaaaaaaaaaaaaa' }).join(' ')).toMatch(/service_role/);
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const jwt = `aaaa.${payload}.bbbb`;
    expect(looksLikeServiceKey(jwt)).toBe(true);
    expect(problems({ ...base, SUPABASE_PUBLISHABLE_KEY: jwt }).join(' ')).toMatch(/service_role/);
    const anon = `aaaa.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.bbbb`;
    expect(looksLikeServiceKey(anon)).toBe(false);
  });

  it('oddiy sessiya tokeniga ruxsat productionda yo\'q, lokal devda bor', () => {
    expect(problems({ ...base, MCP_ALLOW_FIRST_PARTY_TOKEN: 'true', VERCEL_ENV: 'production' }).join(' ')).toMatch(/productionda/);
    expect(problems({ ...base, MCP_ALLOW_FIRST_PARTY_TOKEN: 'true', NODE_ENV: 'production' }).join(' ')).toMatch(/productionda/);
    expect(loadConfig({ ...base, MCP_ALLOW_FIRST_PARTY_TOKEN: 'true' }).allowFirstPartyToken).toBe(true);
    expect(loadConfig(base).allowFirstPartyToken).toBe(false);
  });

  it('MCP_ALLOWED_CLIENT_IDS ro\'yxatga aylanadi', () => {
    expect(loadConfig({ ...base, MCP_ALLOWED_CLIENT_IDS: ' a , b ,,' }).allowedClientIds).toEqual(['a', 'b']);
  });
});
