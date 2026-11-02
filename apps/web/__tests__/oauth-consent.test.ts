import { describe, expect, it } from 'vitest';
import { CONSENT_COPY, CONSENT_PATH, loginNextFor, parseAuthorizationId, redirectHost, safeClientRedirect } from '../src/lib/oauthConsent';
import { safeNextPath } from '../src/lib/validation';

describe('parseAuthorizationId', () => {
  it('oddiy ID qabul qilinadi, g\'alati belgilar va bo\'sh qiymat rad etiladi', () => {
    expect(parseAuthorizationId('abc123XYZ_-0987')).toBe('abc123XYZ_-0987');
    expect(parseAuthorizationId('  abc123XYZ  ')).toBe('abc123XYZ');
    for (const bad of [null, undefined, '', 'short', 'a'.repeat(300), 'abc 12345678', 'abc12345678<script>', '../../etc/passwd1']) {
      expect(parseAuthorizationId(bad)).toBeNull();
    }
  });
});

describe('safeClientRedirect', () => {
  it('https va lokal http qabul qilinadi', () => {
    expect(safeClientRedirect('https://claude.ai/api/mcp/auth_callback?code=1&state=2')).toBe('https://claude.ai/api/mcp/auth_callback?code=1&state=2');
    expect(safeClientRedirect('http://localhost:3118/callback?code=1')).toBe('http://localhost:3118/callback?code=1');
    expect(safeClientRedirect('http://127.0.0.1:9/cb')).toBe('http://127.0.0.1:9/cb');
  });
  it('javascript:, data:, begona http, bo\'sh va noto\'g\'ri URL rad etiladi', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'http://evil.example.com/cb', 'ftp://x.uz/a', 'myapp://cb', '//evil.com', '', null, undefined, 'not a url']) {
      expect(safeClientRedirect(bad as string)).toBeNull();
    }
  });
});

describe('loginNextFor', () => {
  it('rozilik sahifasida query saqlanadi, boshqa sahifalarda faqat yo\'l', () => {
    expect(loginNextFor(CONSENT_PATH, '?authorization_id=abc123XYZ99')).toBe('/oauth/consent?authorization_id=abc123XYZ99');
    expect(loginNextFor('/customers', '?q=bir')).toBe('/customers');
  });
  it('natija safeNextPath tekshiruvidan o\'tadi (login keyin shu yerga qaytaradi)', () => {
    const next = loginNextFor(CONSENT_PATH, '?authorization_id=abc123XYZ99');
    expect(safeNextPath(next)).toBe(next);
  });
});

describe('redirectHost va matnlar', () => {
  it('host ko\'rsatiladi', () => {
    expect(redirectHost('https://chatgpt.com/connector_platform_oauth_redirect')).toBe('chatgpt.com');
    expect(redirectHost('nonsense')).toBeNull();
  });
  it('"qila olmaydi" ro\'yxatida tasdiqlash, to\'lov yozish va telefon bor', () => {
    const t = CONSENT_COPY.cannot.join(' ');
    expect(t).toMatch(/tasdiqlash/);
    expect(t).toMatch(/To'lovni yozish/);
    expect(t).toMatch(/telefon/);
  });
});
