import { describe, expect, it } from 'vitest';
import { DEMO_SHOPS, demoShops } from '@/lib/demo';
import { OVERVIEW_LINKS, shopHref } from '@/lib/links';
import { filterActive, parseShopsParams, recommendation } from '@/lib/shopsView';

const NOW = new Date('2026-11-09T09:00:00Z');

describe('havolalar', () => {
  it("kartochka havolalari to'g'ri", () => {
    expect(OVERVIEW_LINKS).toEqual({ shops: '/shops', users: '/shops', salesToday: '/shops?sort=activity', active7d: '/shops?faol=7' });
  });
  it("qator havolasi do'kon sahifasiga", () => {
    expect(shopHref('abc')).toBe('/shops/abc');
    expect(shopHref(DEMO_SHOPS[0].id)).toBe(`/shops/${DEMO_SHOPS[0].id}`);
  });
});

describe('parseShopsParams', () => {
  const from = (o: Record<string, string>) => (k: string) => o[k] ?? null;
  it('standart va noto\'g\'ri qiymatlar', () => {
    expect(parseShopsParams(from({}))).toEqual({ sort: 'activity', activeDays: null });
    expect(parseShopsParams(from({ sort: 'new', faol: '7' }))).toEqual({ sort: 'new', activeDays: 7 });
    expect(parseShopsParams(from({ sort: "x'; drop", faol: '30' }))).toEqual({ sort: 'activity', activeDays: null });
  });
});

describe('filterActive', () => {
  it("demo: faol filtr Umumiy ko'rinishdagi 'faol do'konlar' soniga teng", async () => {
    const { demoOverview } = await import('@/lib/demo');
    const rows = demoShops(NOW).rows;
    expect(filterActive(rows, 7, NOW)).toHaveLength(demoOverview(NOW).active_shops_7d);
  });
  it("faollik yo'q do'kon filtrga kirmaydi", () => {
    const rows = demoShops(NOW).rows.map((r) => ({ ...r, last_activity_at: null }));
    expect(filterActive(rows, 7, NOW)).toEqual([]);
  });
});

describe('recommendation', () => {
  it('har bosqich uchun matn; faolsizlik belgilanadi', () => {
    for (const s of [1, 2, 3, 4, 5, 6] as const) expect(recommendation(s, false).length).toBeGreaterThan(10);
    expect(recommendation(3, true).startsWith('Faolsiz (7+ kun)')).toBe(true);
    expect(recommendation(3, false)).not.toContain('Faolsiz');
  });
});

describe('do\'kon faoliyati (012): demo', () => {
  it("faqat to'rt son; sonlar manfiy emas", async () => {
    const { demoShopDetail } = await import('@/lib/demo');
    for (const s of DEMO_SHOPS) {
      const a = demoShopDetail(NOW, s.id).activity!;
      expect(Object.keys(a).sort()).toEqual(['drafts_accepted', 'drafts_pending', 'payments', 'supplier_payments']);
      for (const n of Object.values(a)) expect(Number.isInteger(n) && n >= 0).toBe(true);
    }
  });
});
