import { describe, expect, it } from 'vitest';
import type { CustomerBalance } from '@/lib/data/ledger';
import type { Payment, Product, SaleDoc, SaleLineCost } from '@/lib/data/types';
import { buildDashboard, chartSeries, lastDays } from '@/lib/dashboardModel';

const NOW = new Date('2026-11-05T10:00:00Z'); // 15:00 Toshkent
const S = (id: string, iso: string, total: number, customer: string | null, status: SaleDoc['status'] = 'posted'): SaleDoc => ({
  id, customer_id: customer, status, subtotal: BigInt(total), created_at: iso, posted_at: iso, created_by: 'u',
});
const L = (doc: string, qty: number, price: number, cost: number | null): SaleLineCost => ({
  document_id: doc, product_id: null, product_name: 'x', qty_milli: BigInt(qty) * 1000n, unit_price: BigInt(price), unit_cost: cost === null ? null : BigInt(cost),
});
const P = (id: string, name: string, cost: number | null | undefined, active = true): Product => ({
  id, name, unit: 'kg', last_price: 1000n, cost_price: cost === undefined ? undefined : cost === null ? null : BigInt(cost), is_active: active, source: 'app', created_at: '', updated_at: '',
});
const bal = (debt: number): CustomerBalance => ({ sales: 0n, paid: 0n, debt: BigInt(debt), saleCount: 0, lastActivity: null });
const pay = (iso: string, amount: number, voided = false): Payment => ({
  id: iso + amount, customer_id: 'c1', amount: BigInt(amount), method: 'naqd', note: null, created_by: 'u', created_at: iso,
  void: voided ? { id: 'v', payment_id: 'p', reason: 'r', created_by: 'u', created_at: iso } : null,
});

const base = {
  sales: [S('s1', '2026-11-05T09:00:00Z', 385_000, null), S('s2', '2026-11-05T09:30:00Z', 300_000, 'c1'), S('s3', '2026-11-04T09:00:00Z', 50_000, null)],
  saleLines: [L('s1', 10, 13_000, 11_000), L('s1', 5, 15_000, 12_000), L('s1', 20, 9_000, 7_500), L('s2', 3, 100_000, null), L('s3', 1, 50_000, 40_000)],
  payments: [pay('2026-11-05T11:00:00Z', 100_000), pay('2026-11-05T11:00:00Z', 5_000_000, true)],
  customers: [{ id: 'c1', name: 'Karim aka' }] as never,
  balances: new Map([['c1', bal(200_000)], ['c2', bal(-10)], ['c3', bal(500_000)]]),
  products: [P('a', 'Guruch', 11_000), P('b', 'Un', null), P('c', 'Eski', null, false)],
  stock: new Map([['a', 2_000n], ['b', 100_000n], ['c', 0n]]),
  books: null,
  now: NOW,
};

describe('buildDashboard', () => {
  const m = buildDashboard(base);
  it('bugun: savdo, foyda, kassa core hisobi bilan', () => {
    expect(m.today.sales).toBe(685_000n); // 385 000 + 300 000
    expect(m.today.profit).toBe(65_000n); // s1 qatorlari; s2 tan narxi yo'q
    expect(m.today.unknownCostLines).toBe(1);
    expect(m.today.cash).toBe(385_000n + 100_000n); // mijozsiz savdo + to'lov; bekor qilingan to'lov kirmaydi
  });
  it('qarzlar: musbatlar, eng kattasi oldinda', () => {
    expect(m.debts.owedToMe).toBe(700_000n);
    expect(m.debts.topDebtors.map((d) => d.id)).toEqual(['c3', 'c1']);
    expect(m.debts.topDebtors[1]?.name).toBe('Karim aka');
    expect(m.debts.iOwe).toBe(0n);
  });
  it('tugayotgan tovar: faqat faol va kuzatiladigan; arxivlangan chiqmaydi', () => {
    expect(m.lowStock.map((x) => x.productId)).toEqual(['a']);
  });
  it("tan narxi yo'q tovarlar: faqat faol", () => {
    expect(m.noCostProducts?.map((p) => p.id)).toEqual(['b']);
  });
  it("cost_price ustuni yo'q (undefined) bo'lsa tekshirib bo'lmaydi → null", () => {
    expect(buildDashboard({ ...base, products: [P('a', 'Guruch', undefined)] }).noCostProducts).toBeNull();
  });
  it("ombor ma'lumoti yo'q (stock=null) bo'lsa ogohlantirish chiqmaydi", () => {
    expect(buildDashboard({ ...base, stock: null }).lowStock).toEqual([]);
  });
});

describe('chartSeries', () => {
  it('7 kun, eskidan yangiga; bugungi savdo va foyda; foyda manfiy bo‘lishi mumkin', () => {
    const s = chartSeries(base, 7);
    expect(s).toHaveLength(7);
    expect(s[6]).toMatchObject({ key: '2026-11-05', label: '05.11', sales: 685_000, profit: 65_000 });
    expect(s[5]).toMatchObject({ key: '2026-11-04', sales: 50_000, profit: 10_000 });
    expect(s[0]?.sales).toBe(0);
  });
  it('lastDays sana tartibi', () => {
    expect(lastDays(NOW, 3)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05']);
  });
});
