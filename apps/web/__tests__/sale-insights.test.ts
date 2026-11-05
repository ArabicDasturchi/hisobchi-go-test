import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/data/types';
import { buildReceiptText } from '@/lib/receipt';
import type { DraftLine } from '@/lib/saleForm';
import { saleInsights } from '@/lib/saleInsights';

const P = (id: string, name: string, price: number, cost: number | null): Product => ({
  id,
  name,
  unit: 'kg',
  last_price: BigInt(price),
  cost_price: cost === null ? null : BigInt(cost),
  is_active: true,
  source: 'app',
  created_at: '',
  updated_at: '',
});
const L = (key: string, name: string, qty: string, price: string): DraftLine => ({ key, productName: name, qty, unit: 'kg', price });
const CAT = [P('g', 'Guruch', 13000, 11000), P('u', 'Un', 15000, null), P('y', "Yog'", 9000, 9500)];
const plain = (s: string) => s.replace(/ /g, ' ');

describe('saleInsights: foyda (core lineProfit/saleProfit)', () => {
  it("tan narx ma'lum qator foydasi; noma'lum qator foydaga kirmaydi va sanaladi", () => {
    const r = saleInsights([L('1', 'Guruch', '10', '13 000'), L('2', 'Un', '5', '15 000'), L('3', 'Yangi tovar', '1', '1 000')], CAT, null);
    expect(r.perLine.get('1')?.profit).toBe(20_000n); // 10 × (13000 − 11000)
    expect(r.perLine.get('2')?.profit).toBeNull();
    expect(r.perLine.get('2')?.costKnown).toBe(false);
    expect(r.profit).toBe(20_000n);
    expect(r.unknownCostLines).toBe(2); // Un va katalogda yo'q tovar
  });
  it('sotish narxi tan narxdan past → belowCost, foyda manfiy', () => {
    const r = saleInsights([L('1', "Yog'", '20', '9 000')], CAT, null);
    expect(r.perLine.get('1')?.belowCost).toBe(true);
    expect(r.perLine.get('1')?.profit).toBe(-10_000n);
  });
  it("narx = tan narx → ogohlantirish yo'q", () => {
    expect(saleInsights([L('1', 'Guruch', '1', '11 000')], CAT, null).perLine.get('1')?.belowCost).toBe(false);
  });
  it("xatoli va bo'sh qatorlar e'tiborga olinmaydi", () => {
    const r = saleInsights([L('1', 'Guruch', 'abc', '13 000'), L('2', '', '', '')], CAT, null);
    expect(r.perLine.size).toBe(0);
    expect(r.unknownCostLines).toBe(0);
  });
});

describe('saleInsights: ombor ogohlantirishi', () => {
  const stock = new Map<string, bigint>([
    ['g', 12_000n],
    ['y', 100_000n],
  ]);
  it("qoldiqdan ko'p sotilsa negative", () => {
    expect(saleInsights([L('1', 'Guruch', '13', '13 000')], CAT, stock).perLine.get('1')?.stock).toBe('negative');
  });
  it('sotuvdan keyin kam qolsa low', () => {
    expect(saleInsights([L('1', 'Guruch', '8', '13 000')], CAT, stock).perLine.get('1')?.stock).toBe('low'); // 4 qoladi
  });
  it("yetarli bo'lsa ok; kuzatilmagan tovar va stock=null da ogohlantirish yo'q", () => {
    expect(saleInsights([L('1', "Yog'", '10', '9 000')], CAT, stock).perLine.get('1')?.stock).toBe('ok');
    expect(saleInsights([L('1', 'Un', '10', '15 000')], CAT, stock).perLine.get('1')?.stock).toBeNull();
    expect(saleInsights([L('1', 'Guruch', '99', '13 000')], CAT, null).perLine.get('1')?.stock).toBeNull();
  });
  it("bir tovar ikki qatorda bo'lsa qoldiq birgalikda tekshiriladi", () => {
    const r = saleInsights([L('1', 'Guruch', '7', '13 000'), L('2', 'Guruch', '7', '13 000')], CAT, stock);
    expect(r.perLine.get('1')?.stock).toBe('negative');
    expect(r.perLine.get('2')?.stock).toBe('negative');
  });
});

describe('buildReceiptText', () => {
  it("namuna savdo cheki: jami 385 000, to'langan va qarz", () => {
    const t = plain(
      buildReceiptText({
        shopName: "Demo do'kon",
        number: '#A1B2C3D4',
        dateText: '05.11.2026',
        customerName: 'Karim aka',
        lines: [
          { name: 'Guruch', qtyMilli: 10_000n, unit: 'kg', unitPrice: 13_000n },
          { name: 'Un', qtyMilli: 5_000n, unit: 'kg', unitPrice: 15_000n },
          { name: "Yog'", qtyMilli: 20_000n, unit: 'litr', unitPrice: 9_000n },
        ],
        total: 385_000n,
        paid: 200_000n,
        debt: 185_000n,
        totalDebtAfter: 293_000n,
      }),
    );
    expect(t).toContain("Jami: 385 000 so'm");
    expect(t).toContain("Guruch 10 kg × 13 000 = 130 000 so'm");
    expect(t).toContain("To'landi: 200 000");
    expect(t).toContain('Qarzga yozildi: 185 000');
    expect(t).toContain('Umumiy qarz: 293 000');
    expect(t).toContain('Mijoz: Karim aka');
  });
  it("mijozsiz naqd savdo: qarz va mijoz satri yo'q", () => {
    const t = plain(
      buildReceiptText({ shopName: 'D', number: '#1', dateText: 'x', customerName: null, lines: [{ name: 'Un', qtyMilli: 1_500n, unit: 'kg', unitPrice: 15_000n }], total: 22_500n, paid: 0n, debt: 0n, totalDebtAfter: null }),
    );
    expect(t).not.toContain('Mijoz');
    expect(t).not.toContain('Qarz');
    expect(t).toContain("Un 1,5 kg × 15 000 = 22 500 so'm");
  });
});
