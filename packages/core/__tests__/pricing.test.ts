/**
 * Narx qoidalari: optom narx tanlash va ustamadan sotuv narxi (bigint).
 * SQL ikkinchi yo'li bilan bir xil kirishlar: supabase/tests/fixtures/pricing-cases.json (SQL testi 95).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isValidMarkupPercent, isWholesaleApplied, resolveUnitPrice, suggestSalePrice } from '../src/pricing.js';

interface Fixture {
  resolve: { name: string; sale: number | null; ws: number | null; min: number | null; qty: number; expected: number | null }[];
  suggest: { name: string; cost: number; pct: number; expected: number | null }[];
}
const fx = JSON.parse(readFileSync(new URL('../../../supabase/tests/fixtures/pricing-cases.json', import.meta.url), 'utf8')) as Fixture;
const big = (n: number | null) => (n === null ? null : BigInt(n));

describe('resolveUnitPrice (SQL bilan bir xil kirishlar)', () => {
  it.each(fx.resolve)('$name', (c) => {
    const input = { salePrice: big(c.sale), wholesalePrice: big(c.ws), wholesaleMinQtyMilli: big(c.min), qtyMilli: BigInt(c.qty) };
    expect(resolveUnitPrice(input)).toBe(big(c.expected));
  });

  it('chegara: oldin / chegarada / keyin (13 000 → 12 000)', () => {
    const base = { salePrice: 13_000n, wholesalePrice: 12_000n, wholesaleMinQtyMilli: 10_000n };
    expect(resolveUnitPrice({ ...base, qtyMilli: 9_999n })).toBe(13_000n);
    expect(resolveUnitPrice({ ...base, qtyMilli: 10_000n })).toBe(12_000n);
    expect(resolveUnitPrice({ ...base, qtyMilli: 10_001n })).toBe(12_000n);
    expect(isWholesaleApplied({ ...base, qtyMilli: 9_999n })).toBe(false);
    expect(isWholesaleApplied({ ...base, qtyMilli: 10_000n })).toBe(true);
  });

  it('chegara 0 yoki manfiy bo\'lsa optom ishlamaydi (himoya)', () => {
    expect(resolveUnitPrice({ salePrice: 100n, wholesalePrice: 50n, wholesaleMinQtyMilli: 0n, qtyMilli: 5_000n })).toBe(100n);
    expect(isWholesaleApplied({ salePrice: 100n, wholesalePrice: 50n, wholesaleMinQtyMilli: 0n, qtyMilli: 5_000n })).toBe(false);
  });

  it('faqat bittasi berilgan (juftlik buzilgan) bo\'lsa optom ishlamaydi', () => {
    expect(resolveUnitPrice({ salePrice: 100n, wholesalePrice: 50n, wholesaleMinQtyMilli: null, qtyMilli: 5_000n })).toBe(100n);
    expect(resolveUnitPrice({ salePrice: 100n, wholesalePrice: null, wholesaleMinQtyMilli: 1_000n, qtyMilli: 5_000n })).toBe(100n);
  });

  it('birlik: kg miqdorida ham, donada ham miqdor milli (1000 = 1)', () => {
    // 10 dona = 10 000 milli; chegara 10 dona
    expect(resolveUnitPrice({ salePrice: 5_000n, wholesalePrice: 4_500n, wholesaleMinQtyMilli: 10_000n, qtyMilli: 10_000n })).toBe(4_500n);
    // 2.5 kg = 2 500 milli, chegara 5 kg
    expect(resolveUnitPrice({ salePrice: 20_000n, wholesalePrice: 18_000n, wholesaleMinQtyMilli: 5_000n, qtyMilli: 2_500n })).toBe(20_000n);
  });
});

describe('suggestSalePrice (SQL bilan bir xil kirishlar)', () => {
  it.each(fx.suggest)('$name', (c) => {
    expect(suggestSalePrice(BigInt(c.cost), c.pct)).toBe(big(c.expected));
  });

  it('noto\'g\'ri foiz: 1001, manfiy, kasr, NaN → null', () => {
    for (const pct of [1001, -1, 10.5, Number.NaN]) expect(suggestSalePrice(1_000n, pct)).toBeNull();
    expect(isValidMarkupPercent(0)).toBe(true);
    expect(isValidMarkupPercent(1000)).toBe(true);
    expect(isValidMarkupPercent(1001)).toBe(false);
  });

  it('suzuvchi nuqtadan farqi: 0.1+0.2 turidagi xato yo\'q (katta tan narx)', () => {
    // 2^53 dan katta: number bilan aniq chiqmaydi, bigint bilan aniq
    expect(suggestSalePrice(9_007_199_254_740_993n, 0)).toBe(9_007_199_254_740_993n);
  });
});
