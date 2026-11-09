import { describe, expect, it } from 'vitest';
import { DEMO_SHOPS, demoShopDetail } from '@/lib/demo';
import { describeSteps, stoppedAt } from '@/lib/shopSteps';
import type { AdminShopDetail } from '@/lib/types';

const NOW = new Date('2026-11-09T09:00:00Z');
const at = '2026-11-01T10:00:00Z';

function steps(over: Partial<Record<string, string | null>>): AdminShopDetail['steps'] {
  const base = { shop: at, product: null, supplier: null, purchase: null, sale: null, ...over };
  return (['shop', 'product', 'supplier', 'purchase', 'sale'] as const).map((key) => ({ key, at: base[key] ?? null }));
}

describe('describeSteps', () => {
  it('yangi do\'kon: keyingi qadam — tovar', () => {
    const v = describeSteps({ stage: 1, steps: steps({}) });
    expect(v.map((x) => x.state)).toEqual(['done', 'next', 'todo', 'todo', 'todo']);
  });

  it('ta\'minotchida to\'xtagan: kirim — keyingi', () => {
    const v = describeSteps({ stage: 3, steps: steps({ product: at, supplier: at }) });
    expect(v.map((x) => x.state)).toEqual(['done', 'done', 'done', 'next', 'todo']);
  });

  it('ta\'minotchisiz sotgan do\'kon: o\'tkazib yuborilgan qadamlar ko\'rsatiladi', () => {
    const v = describeSteps({ stage: 5, steps: steps({ product: at, sale: at }) });
    expect(v.map((x) => x.state)).toEqual(['done', 'done', 'skipped', 'skipped', 'done']);
  });

  it('faol do\'konda keyingi qadam yo\'q', () => {
    const v = describeSteps({ stage: 6, steps: steps({ product: at, supplier: at, purchase: at, sale: at }) });
    expect(v.every((x) => x.state === 'done')).toBe(true);
  });

  it('demo: Sardor (kirim bor, savdo yo\'q) savdoda to\'xtagan', () => {
    const d = demoShopDetail(NOW, DEMO_SHOPS[3].id);
    const v = describeSteps(d);
    expect(v.find((x) => x.key === 'sale')?.state).toBe('next');
    expect(v.find((x) => x.key === 'purchase')?.state).toBe('done');
  });
});

describe('stoppedAt', () => {
  it('har bosqich uchun matn', () => {
    expect(stoppedAt(1)).toBe('Keyingi qadam: birinchi tovar');
    expect(stoppedAt(4)).toBe('Keyingi qadam: birinchi savdo');
    expect(stoppedAt(5)).toContain('5+ savdo');
    expect(stoppedAt(6)).toBeNull();
  });
});
