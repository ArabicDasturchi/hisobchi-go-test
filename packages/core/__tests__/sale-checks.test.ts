import { describe, expect, it } from 'vitest';
import { LOW_STOCK_MILLI, soldBelowCost, stockCheck, topSellingProducts } from '../src/index.js';

describe('stockCheck', () => {
  it('yetarli qoldiq → ok', () => expect(stockCheck(100_000n, 10_000n)).toBe('ok'));
  it("sotuvdan keyin 5 birlik yoki kam qolsa → low (chegara ham)", () => {
    expect(stockCheck(15_000n, 10_000n)).toBe('low'); // 5 qoladi
    expect(stockCheck(10_000n, 10_000n)).toBe('low'); // 0 qoladi
    expect(stockCheck(15_001n, 10_000n)).toBe('ok'); // 5,001 qoladi
  });
  it('qoldiqdan ko‘p sotilsa → negative', () => {
    expect(stockCheck(9_999n, 10_000n)).toBe('negative');
    expect(stockCheck(-1_000n, 1n)).toBe('negative');
  });
  it('chegara konstantasi 5 birlik', () => expect(LOW_STOCK_MILLI).toBe(5_000n));
});

describe('soldBelowCost', () => {
  it('narx < tan narx → true', () => expect(soldBelowCost(8_999n, 9_000n)).toBe(true));
  it('narx = tan narx yoki yuqori → false', () => {
    expect(soldBelowCost(9_000n, 9_000n)).toBe(false);
    expect(soldBelowCost(13_000n, 9_000n)).toBe(false);
  });
  it("tan narx noma'lum → false (taxmin yo'q)", () => expect(soldBelowCost(1n, null)).toBe(false));
  it('tan narx 0 bo‘lsa zarar emas', () => expect(soldBelowCost(0n, 0n)).toBe(false));
});

describe('topSellingProducts', () => {
  const L = (productId: string | null, q: number) => ({ productId, qtyMilli: BigInt(q) * 1000n });
  it('qatorlar soni bo‘yicha, teng bo‘lsa miqdor bo‘yicha tartiblaydi', () => {
    const top = topSellingProducts([L('a', 1), L('b', 50), L('a', 1), L('c', 60), L('b', 1), L('c', 1)], 8);
    expect(top.map((t) => t.productId)).toEqual(['c', 'b', 'a']); // b va c: 2 tadan; c miqdori katta. a: 2 ta, kichik miqdor
    expect(top[0]).toEqual({ productId: 'c', count: 2, qtyMilli: 61_000n });
  });
  it("tovarsiz (null) qatorlar reytingga kirmaydi, limit ishlaydi", () => {
    const top = topSellingProducts([L(null, 5), L('a', 1), L('b', 1), L('c', 1)], 2);
    expect(top).toHaveLength(2);
    expect(top.some((t) => t.productId === (null as unknown as string))).toBe(false);
  });
  it('bo‘sh kirish va limit 0', () => {
    expect(topSellingProducts([], 8)).toEqual([]);
    expect(topSellingProducts([L('a', 1)], 0)).toEqual([]);
  });
  it('teng natijada tartib barqaror (id bo‘yicha)', () => {
    expect(topSellingProducts([L('b', 1), L('a', 1)], 8).map((t) => t.productId)).toEqual(['a', 'b']);
  });
});
