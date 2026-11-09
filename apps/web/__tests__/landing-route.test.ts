import { describe, expect, it } from 'vitest';
import { contactLinks, phoneUrl, telegramUrl } from '../src/lib/contact';
import { decideLanding, isLandingPath } from '../src/lib/rootRoute';

const cfg = { demo: false, configured: true };

describe("'/' yo'naltirish", () => {
  it("kirmagan foydalanuvchi landing ko'radi, kirgan dashboard ga o'tadi", () => {
    expect(decideLanding('/', { ...cfg, signedIn: false })).toBe('pass');
    expect(decideLanding('/', { ...cfg, signedIn: true })).toBe('dashboard');
  });
  it("demo rejimida / dashboard ga o'tadi (avvalgi xatti-harakat)", () => {
    expect(decideLanding('/', { demo: true, configured: true, signedIn: false })).toBe('dashboard');
  });
  it("Supabase sozlanmagan bo'lsa landing ochiq", () => {
    expect(decideLanding('/', { demo: false, configured: false, signedIn: false })).toBe('pass');
  });
  it('himoyalangan sahifalarga tegmaydi', () => {
    for (const p of ['/dashboard', '/customers', '/login', '/setup']) {
      expect(isLandingPath(p)).toBe(false);
      expect(decideLanding(p, { ...cfg, signedIn: false })).toBeNull();
    }
  });
  it('maxfiylik, robots va sitemap ochiq', () => {
    for (const p of ['/maxfiylik', '/robots.txt', '/sitemap.xml']) {
      expect(decideLanding(p, { ...cfg, signedIn: false })).toBe('pass');
    }
  });
});

describe('aloqa havolalari (env)', () => {
  it("bo'sh env — tugma yo'q", () => {
    expect(contactLinks('', '')).toEqual({ telegram: '', phone: '', any: false });
    expect(contactLinks(undefined, undefined).any).toBe(false);
  });
  it('Telegram shakllari bitta havolaga keladi', () => {
    for (const v of ['@hisobchi_go', 'hisobchi_go', 'https://t.me/hisobchi_go']) {
      expect(telegramUrl(v)).toBe('https://t.me/hisobchi_go');
    }
  });
  it("noto'g'ri qiymat rad etiladi", () => {
    expect(telegramUrl('javascript:alert(1)')).toBe('');
    expect(telegramUrl('https://evil.com/x')).toBe('');
    expect(phoneUrl('abc')).toBe('');
  });
  it('telefon tel: havolasiga aylanadi', () => {
    expect(phoneUrl('+998 90 123 45 67')).toBe('tel:+998901234567');
  });
});
