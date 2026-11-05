import { describe, expect, it } from 'vitest';
import { debtSummary, dayTotals, lowStock, saleLineTotal, type DaySale, type DaySaleLine } from '../src/index.js';

// Toshkent = UTC+5. 10:00 UTC → 15:00 Toshkent shu kun. 20:00 UTC → ertasi 01:00 Toshkent.
const TODAY = '2026-11-05';
const at = (utcHour: number, day = '2026-11-05') => `${day}T${String(utcHour).padStart(2, '0')}:00:00Z`;

const sale = (id: string, createdAt: string, total: number, customerId: string | null = null, posted = true): DaySale => ({ id, createdAt, posted, total: BigInt(total), customerId });
const line = (documentId: string, qty: number, price: number, cost: number | null): DaySaleLine => ({ documentId, qtyMilli: BigInt(qty) * 1000n, unitPrice: BigInt(price), unitCost: cost === null ? null : BigInt(cost) });

describe('dayTotals', () => {
  it('namuna 10×13 000 + 5×15 000 + 20×9 000 = 385 000, foyda tan narxdan', () => {
    const lines = [line('s1', 10, 13_000, 11_000), line('s1', 5, 15_000, 12_000), line('s1', 20, 9_000, 7_500)];
    const t = dayTotals({ sales: [sale('s1', at(10), 385_000)], lines, payments: [], date: TODAY });
    expect(t.sales).toBe(385_000n);
    expect(t.saleCount).toBe(1);
    // 10×2000 + 5×3000 + 20×1500 = 20000 + 15000 + 30000
    expect(t.profit).toBe(65_000n);
    expect(t.unknownCostLines).toBe(0);
  });

  it("tan narxi noma'lum qator foydaga kirmaydi va sanaladi", () => {
    const lines = [line('s1', 10, 13_000, 11_000), line('s1', 5, 15_000, null), line('s1', 1, 1_000, null)];
    const t = dayTotals({ sales: [sale('s1', at(10), 146_000)], lines, payments: [], date: TODAY });
    expect(t.profit).toBe(20_000n);
    expect(t.unknownCostLines).toBe(2);
  });

  it('zarar (sotish < tan narx) foydadan ayiriladi', () => {
    const t = dayTotals({ sales: [sale('s1', at(10), 90_000)], lines: [line('s1', 10, 9_000, 9_500)], payments: [], date: TODAY });
    expect(t.profit).toBe(-5_000n);
  });

  it('bekor qilingan savdo savdo, foyda va kassaga kirmaydi', () => {
    const t = dayTotals({
      sales: [sale('s1', at(10), 100_000), sale('s2', at(10), 50_000, null, false)],
      lines: [line('s1', 1, 100_000, 60_000), line('s2', 1, 50_000, 10_000)],
      payments: [],
      date: TODAY,
    });
    expect(t.sales).toBe(100_000n);
    expect(t.saleCount).toBe(1);
    expect(t.profit).toBe(40_000n);
    expect(t.cash).toBe(100_000n);
  });

  it('boshqa kun savdosi kirmaydi; Toshkent kuni chegarasi (UTC 19:00 = 00:00 Toshkent)', () => {
    const t = dayTotals({
      sales: [sale('a', at(18, '2026-11-04'), 1_000), sale('b', at(19, '2026-11-04'), 2_000), sale('c', at(18), 4_000), sale('d', at(19), 8_000)],
      lines: [],
      payments: [],
      date: TODAY,
    });
    // a: 04.11 23:00 Tosh → kirmaydi; b: 05.11 00:00 Tosh → kiradi; c: 05.11 23:00 → kiradi; d: 06.11 00:00 → kirmaydi
    expect(t.sales).toBe(6_000n);
    expect(t.saleCount).toBe(2);
  });

  it("kassa: mijozsiz savdo + qabul qilingan to'lovlar − naqd chiqim; mijozli savdoning o'zi kassaga kirmaydi", () => {
    const t = dayTotals({
      sales: [sale('s1', at(10), 385_000, null), sale('s2', at(10), 300_000, 'c1')],
      lines: [],
      payments: [
        { createdAt: at(11), amount: 100_000n, voided: false },
        { createdAt: at(11), amount: 999_000n, voided: true },
        { createdAt: at(11, '2026-11-04'), amount: 7_000n, voided: false },
      ],
      supplierPayments: [
        { createdAt: at(12), amount: 50_000n, method: 'naqd', voided: false },
        { createdAt: at(12), amount: 70_000n, method: 'karta', voided: false },
        { createdAt: at(12), amount: 80_000n, method: 'naqd', voided: true },
      ],
      date: TODAY,
    });
    expect(t.cashSales).toBe(385_000n);
    expect(t.paymentsIn).toBe(100_000n);
    expect(t.cashOut).toBe(50_000n);
    expect(t.cash).toBe(385_000n + 100_000n - 50_000n);
  });

  it("qatorlari yo'q savdolar sanaladi (foyda noma'lum bo'lib qolmasin)", () => {
    const t = dayTotals({ sales: [sale('s1', at(10), 10_000), sale('s2', at(10), 20_000)], lines: [line('s1', 1, 10_000, 5_000)], payments: [], date: TODAY });
    expect(t.salesWithoutLines).toBe(1);
  });

  it("bo'sh kirish — nollar", () => {
    const t = dayTotals({ sales: [], lines: [], payments: [], date: TODAY });
    expect(t).toMatchObject({ sales: 0n, saleCount: 0, profit: 0n, cash: 0n, unknownCostLines: 0 });
  });

  it('katta summalarda aniqlik yo‘qolmaydi (> 2^53)', () => {
    const big = 9_007_199_254_740_993n;
    const t = dayTotals({ sales: [{ id: 'x', createdAt: at(10), posted: true, total: big, customerId: null }], lines: [], payments: [], date: TODAY });
    expect(t.sales).toBe(big);
    expect(t.cash).toBe(big);
  });
});

describe('debtSummary', () => {
  const E = (id: string, debt: number) => ({ id, name: id, debt: BigInt(debt) });
  it('faqat musbat qarzlar; manfiy (ortiqcha to‘langan) va nol kirmaydi', () => {
    const s = debtSummary([E('a', 100), E('b', 0), E('c', -50), E('d', 300), E('e', 200), E('f', 50)], [E('s1', 1_000), E('s2', -5)]);
    expect(s.owedToMe).toBe(650n);
    expect(s.debtorCount).toBe(4);
    expect(s.topDebtors.map((d) => d.id)).toEqual(['d', 'e', 'a']);
    expect(s.iOwe).toBe(1_000n);
    expect(s.supplierCount).toBe(1);
  });
  it("top soni sozlanadi; bo'sh ro'yxat", () => {
    expect(debtSummary([E('a', 1), E('b', 2)], [], 1).topDebtors.map((d) => d.id)).toEqual(['b']);
    expect(debtSummary([], [])).toMatchObject({ owedToMe: 0n, iOwe: 0n, debtorCount: 0, topDebtors: [] });
  });
});

describe('lowStock', () => {
  const I = (productId: string, qty: number) => ({ productId, name: productId, unit: 'kg', qtyMilli: BigInt(qty) });
  it('chegara (5 birlik) va undan kam; eng kami birinchi; darajalar', () => {
    const r = lowStock([I('a', 5_000), I('b', 5_001), I('c', 0), I('d', -2_000), I('e', 1_500)]);
    expect(r.map((x) => `${x.productId}:${x.level}`)).toEqual(['d:negative', 'c:zero', 'e:low', 'a:low']);
  });
  it('chegarani o‘zgartirish mumkin', () => {
    expect(lowStock([I('a', 9_000)], 10_000n)).toHaveLength(1);
    expect(lowStock([I('a', 9_000)], 8_000n)).toHaveLength(0);
  });
});

describe('saleLineTotal', () => {
  it('core formulasi: (qty×narx + 500) / 1000', () => expect(saleLineTotal({ qtyMilli: 1_500n, unitPrice: 3_333n })).toBe(5_000n));
});
