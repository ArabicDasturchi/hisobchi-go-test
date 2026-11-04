/**
 * Kirim, ostatka, ombor, foyda, oldi-berdi, bir martalik savdo. Raqamlar SQL testlari bilan bir xil
 * (supabase/tests/40_partners_stock.test.sql, 50_purchases.test.sql): ikki mustaqil yo'l bir natija berishi kerak.
 */
import { describe, expect, it } from 'vitest';
import {
  assertTotalsMatch,
  calculateDocument,
  calculatePurchase,
  checkSalePayment,
  lineProfit,
  movementError,
  partnerBalance,
  partnerStatement,
  reversalMovements,
  saleMovements,
  saleProfit,
  settle,
  settlePurchase,
  stockBalances,
  stockLevel,
  stockWarning,
  tashkentDate,
  TotalsMismatchError,
  type StatementEntry,
  type StockMovement,
} from '../src/index.js';

describe('savdo namunasi (o\'zgarmagan): 10×13 000 + 5×15 000 + 20×9 000 = 385 000', () => {
  it('385 000', () => {
    const r = calculateDocument([
      { qtyMilli: 10_000n, unitPrice: 13_000n },
      { qtyMilli: 5_000n, unitPrice: 15_000n },
      { qtyMilli: 20_000n, unitPrice: 9_000n },
    ]);
    expect(r.subtotal).toBe(385_000n);
  });
});

describe('kirim: 100×9 000 + 50×11 000 = 1 450 000', () => {
  const lines = [
    { qtyMilli: 100_000n, unitCost: 9_000n },
    { qtyMilli: 50_000n, unitCost: 11_000n },
  ];

  it('jami 1 450 000, qatorlar alohida yaxlitlanadi', () => {
    const r = calculatePurchase(lines);
    expect(r.subtotal).toBe(1_450_000n);
    expect(r.lines.map((l) => l.lineTotal)).toEqual([900_000n, 550_000n]);
    // kasr miqdor: 0,333 × 1 000 = 333; 2,5 × 4 000 = 10 000
    expect(calculatePurchase([{ qtyMilli: 333n, unitCost: 1_000n }, { qtyMilli: 2_500n, unitCost: 4_000n }]).subtotal).toBe(10_333n);
  });

  it('berildi 1 000 000 -> ostatka 450 000 (Eski 0 + Tovar 1 450 000 - Berildi 1 000 000)', () => {
    const r = settlePurchase(0n, lines, 1_000_000n);
    expect(r).toEqual({ ok: true, settlement: { opening: 0n, goods: 1_450_000n, total: 1_450_000n, paid: 1_000_000n, balance: 450_000n } });
  });

  it('Eski bilan: Eski 450 000 + Tovar 300 000 - Berildi 100 000 = 650 000', () => {
    expect(settle(450_000n, 300_000n, 100_000n)).toEqual({ opening: 450_000n, goods: 300_000n, total: 750_000n, paid: 100_000n, balance: 650_000n });
  });

  it('berildi jamidan oshsa rad etiladi (jimgina yaxlitlanmaydi)', () => {
    const r = settlePurchase(0n, lines, 1_450_001n);
    expect(r.ok).toBe(false);
    expect(settlePurchase(0n, lines, 1_450_000n).ok).toBe(true);
    expect(() => settle(0n, 1n, -1n)).toThrow();
    expect(() => settle(0n, -1n, 0n)).toThrow();
  });

  it('manfiy miqdor yoki tan narx xato', () => {
    expect(() => calculatePurchase([{ qtyMilli: -1n, unitCost: 1n }])).toThrow();
    expect(() => calculatePurchase([{ qtyMilli: 1n, unitCost: -1n }])).toThrow();
  });
});

describe('hisob mos kelmasa to\'xtaydi', () => {
  it('TS va (simulyatsiya qilingan) SQL jami farq qilsa TotalsMismatchError', () => {
    const ts = calculatePurchase([{ qtyMilli: 100_000n, unitCost: 9_000n }]).subtotal;
    expect(assertTotalsMatch('kirim', ts, 900_000n)).toBe(900_000n);
    expect(() => assertTotalsMatch('kirim', ts, 900_001n)).toThrow(TotalsMismatchError);
    try {
      assertTotalsMatch('kirim', ts, 900_001n);
    } catch (e) {
      expect((e as TotalsMismatchError).first).toBe(900_000n);
      expect((e as Error).message).toMatch(/mos kelmadi/);
    }
  });
});

describe('foyda faqat kodda: sotuv 10×13 000, tan 10×11 000 = 20 000', () => {
  it('qator foydasi', () => {
    expect(lineProfit({ qtyMilli: 10_000n, unitPrice: 13_000n, unitCost: 11_000n })).toBe(20_000n);
    expect(lineProfit({ qtyMilli: 10_000n, unitPrice: 13_000n, unitCost: null })).toBeNull();
  });

  it('savdo foydasi: noma\'lum tan narxli qator foydaga kirmaydi va alohida sanaladi', () => {
    const r = saleProfit([
      { qtyMilli: 10_000n, unitPrice: 13_000n, unitCost: 11_000n },
      { qtyMilli: 5_000n, unitPrice: 15_000n, unitCost: null },
      { qtyMilli: 20_000n, unitPrice: 9_000n, unitCost: 9_500n },
    ]);
    expect(r.profit).toBe(20_000n - 10_000n);
    expect(r.revenue).toBe(130_000n + 180_000n);
    expect(r.unknownCostLines).toEqual([1]);
  });

  it('zarar manfiy foyda; yaxlitlash qator bo\'yicha (SQL bilan bir xil)', () => {
    expect(lineProfit({ qtyMilli: 333n, unitPrice: 1_000n, unitCost: 1_500n })).toBe(333n - 500n);
  });
});

describe('bir martalik mijoz qarz yaratmaydi', () => {
  it('to\'liq to\'lov shart, doimiy mijozda qisman ruxsat', () => {
    expect(checkSalePayment({ kind: 'one_time', total: 9_000n, paid: 9_000n })).toEqual({ ok: true, debt: 0n });
    expect(checkSalePayment({ kind: 'one_time', total: 9_000n, paid: null })).toMatchObject({ ok: false, code: 'WALKIN_REQUIRES_FULL_PAYMENT' });
    expect(checkSalePayment({ kind: 'one_time', total: 9_000n, paid: 5_000n })).toMatchObject({ ok: false, code: 'WALKIN_REQUIRES_FULL_PAYMENT' });
    expect(checkSalePayment({ kind: 'one_time', total: 0n, paid: 0n })).toMatchObject({ ok: false });
    expect(checkSalePayment({ kind: 'regular', total: 30_000n, paid: 10_000n })).toEqual({ ok: true, debt: 20_000n });
    expect(checkSalePayment({ kind: 'regular', total: 30_000n, paid: null })).toEqual({ ok: true, debt: 30_000n });
    expect(checkSalePayment({ kind: 'regular', total: 30_000n, paid: 30_001n })).toMatchObject({ ok: false, code: 'PAID_EXCEEDS_TOTAL' });
    expect(checkSalePayment({ kind: 'regular', total: 30_000n, paid: -1n })).toMatchObject({ ok: false, code: 'NEGATIVE_PAID' });
  });
});

describe('ombor qoldig\'i harakatlardan', () => {
  const P = 'p-chirmoq';
  const m = (kind: StockMovement['kind'], qtyMilli: bigint, productId = P): StockMovement => ({ productId, kind, qtyMilli });

  it('kirim + , savdo -, tuzatish +-', () => {
    const b = stockBalances([m('purchase', 100_000n), m('sale', -10_000n), m('adjustment', 5_000n), m('adjustment', -3_000n)]);
    expect(b.get(P)).toBe(92_000n);
  });

  it('manfiy qoldiq ruxsat, lekin sariq ogohlantirish beradi', () => {
    const b = stockBalances([m('sale', -10_000n)]);
    expect(b.get(P)).toBe(-10_000n);
    expect(stockLevel(-10_000n)).toBe('negative');
    expect(stockWarning(-10_000n)).toMatchObject({ code: 'NEGATIVE_STOCK', severity: 'warning' });
    expect(stockWarning(0n)).toBeNull();
    expect(stockWarning(1n)).toBeNull();
    expect(stockLevel(0n)).toBe('zero');
    expect(stockLevel(1n)).toBe('positive');
  });

  it('teskari yozuv qoldiqni qaytaradi (savdo va kirim)', () => {
    const sale = saleMovements([{ productId: P, qtyMilli: 10_000n }, { productId: null, qtyMilli: 5_000n }]);
    expect(sale).toEqual([m('sale', -10_000n)]);
    const purchase = [m('purchase', 100_000n)];
    const all = [...purchase, ...sale];
    expect(stockBalances(all).get(P)).toBe(90_000n);
    const back = [...all, ...reversalMovements(all)];
    expect(stockBalances(back).get(P)).toBe(0n);
    expect(reversalMovements([m('adjustment', 5_000n)])).toEqual([]);
  });

  it('noto\'g\'ri ishorali harakat rad etiladi', () => {
    expect(movementError(m('purchase', -1n))).not.toBeNull();
    expect(movementError(m('sale', 1n))).not.toBeNull();
    expect(movementError(m('adjustment', 0n))).not.toBeNull();
    expect(movementError(m('adjustment', -1n))).toBeNull();
    expect(() => stockBalances([m('sale', 1n)])).toThrow();
  });

  it('tovarlar alohida hisoblanadi', () => {
    const b = stockBalances([m('purchase', 3_000n, 'a'), m('purchase', 4_000n, 'b'), m('sale', -1_000n, 'a')]);
    expect(b.get('a')).toBe(2_000n);
    expect(b.get('b')).toBe(4_000n);
  });
});

describe('oldi-berdi (Eski / Tovar / Jami / Berildi / Ostatka) va teskari yozuv', () => {
  // supabase/tests/50_purchases.test.sql bilan bir xil ssenariy: ta'minotchi
  const supplier: StatementEntry[] = [
    { kind: 'goods', date: '2026-10-20', amount: 1_450_000n, cancelled: false },
    { kind: 'payment', date: '2026-10-20', amount: 1_000_000n, cancelled: false },
    { kind: 'payment', date: '2026-11-03', amount: 200_000n, cancelled: true }, // bekor qilingan to'lov
    { kind: 'goods', date: '2026-11-02', amount: 300_000n, cancelled: false },
    { kind: 'payment', date: '2026-11-03', amount: 100_000n, cancelled: false },
  ];

  it('ta\'minotchi: Eski 450 000, Tovar 300 000, Jami 750 000, Berildi 100 000, Ostatka 650 000', () => {
    expect(partnerStatement(supplier, '2026-11-01', '2026-11-03')).toEqual({ opening: 450_000n, goods: 300_000n, total: 750_000n, paid: 100_000n, balance: 650_000n });
    expect(partnerStatement(supplier, '2026-10-01', '2026-10-31')).toEqual({ opening: 0n, goods: 1_450_000n, total: 1_450_000n, paid: 1_000_000n, balance: 450_000n });
  });

  it('to\'liq davr ostatkasi = joriy qoldiq', () => {
    expect(partnerStatement(supplier, '2026-01-01', '2027-01-01').balance).toBe(partnerBalance(supplier));
    expect(partnerBalance(supplier)).toBe(650_000n);
  });

  it('bekor qilingan kirim ostatkani qaytaradi (hisobga olinmaydi)', () => {
    const reversed = supplier.map((e) => (e.kind === 'goods' && e.amount === 300_000n ? { ...e, cancelled: true } : e));
    expect(partnerBalance(reversed)).toBe(350_000n);
    expect(partnerStatement(reversed, '2026-11-01', '2026-11-03')).toEqual({ opening: 450_000n, goods: 0n, total: 450_000n, paid: 100_000n, balance: 350_000n });
  });

  it('mijoz: Toshkent sanasi chegarasi (23:59 Eski, 01:00 Tovar), bekor qilingan savdo hisobga olinmaydi', () => {
    const at = (iso: string) => tashkentDate(iso);
    expect(at('2026-10-31T18:59:00Z')).toBe('2026-10-31');
    expect(at('2026-10-31T19:00:00Z')).toBe('2026-11-01');
    expect(at('2026-10-31T20:00:00+00:00')).toBe('2026-11-01');
    expect(at('2026-11-02T10:00:00+05:00')).toBe('2026-11-02');
    const customer: StatementEntry[] = [
      { kind: 'goods', date: at('2026-10-31T18:59:00Z'), amount: 385_000n, cancelled: false },
      { kind: 'goods', date: at('2026-10-31T20:00:00Z'), amount: 30_000n, cancelled: false },
      { kind: 'goods', date: at('2026-11-02T10:00:00+05:00'), amount: 7_000n, cancelled: true },
      { kind: 'payment', date: at('2026-11-02T15:00:00+05:00'), amount: 100_000n, cancelled: false },
    ];
    expect(partnerStatement(customer, '2026-11-01', '2026-11-03')).toEqual({ opening: 385_000n, goods: 30_000n, total: 415_000n, paid: 100_000n, balance: 315_000n });
  });

  it('noto\'g\'ri davr, sana yoki manfiy summa rad etiladi', () => {
    expect(() => partnerStatement([], '2026-11-03', '2026-11-01')).toThrow();
    expect(() => partnerStatement([], '2026-1-1', '2026-11-01')).toThrow();
    expect(() => partnerStatement([{ kind: 'goods', date: 'x', amount: 1n, cancelled: false }], '2026-11-01', '2026-11-02')).toThrow();
    expect(() => partnerStatement([{ kind: 'goods', date: '2026-11-01', amount: -1n, cancelled: false }], '2026-11-01', '2026-11-02')).toThrow();
    expect(() => tashkentDate('yo\'q')).toThrow();
  });
});
