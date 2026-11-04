/**
 * Veb: daftar/ombor/ta'minotchi (faqat ko'rish). Hisob core orqali; raqamlar TZ-3:
 * kirim 100×9 000 + 50×11 000 = 1 450 000, berildi 1 000 000 → ostatka 450 000.
 */
import { describe, expect, it } from 'vitest';
import { isActive, NAV_GROUPS, NAV_ITEMS, pageTitle } from '../src/components/layout/nav';
import { hasCustomerKind } from '../src/lib/data/api';
import { buildBooks, customerStatement, inDayRange, isActiveSettlement, stockView, supplierStatement, supplierTotals, type StockItem } from '../src/lib/data/books';
import type { Payment, SaleDoc } from '../src/lib/data/types';

const raw = () => ({
  suppliers: [
    { id: 's1', name: 'Baraka', phone: null, notes: null, is_active: true, created_at: '2026-10-01T00:00:00Z' },
    { id: 's2', name: "Bo'sh", phone: null, notes: null, is_active: true, created_at: '2026-10-01T00:00:00Z' },
  ],
  purchases: [
    { id: 'k1', supplier_id: 's1', doc_date: '2026-10-29', status: 'posted' as const, subtotal: '1450000', created_at: '2026-10-29T08:00:00Z' },
    { id: 'k2', supplier_id: 's1', doc_date: '2026-10-31', status: 'posted' as const, subtotal: '90000', created_at: '2026-10-31T08:00:00Z' },
    { id: 'k3', supplier_id: 's1', doc_date: '2026-10-31', status: 'reversed' as const, subtotal: '777000', created_at: '2026-10-31T09:00:00Z' },
  ],
  lines: [
    { document_id: 'k1', line_index: 0, product_id: 'p1', product_name: 'Un', qty_milli: '100000', unit: 'kg', unit_cost: '9000', line_total: '900000' },
    { document_id: 'k1', line_index: 1, product_id: 'p2', product_name: "Yog'", qty_milli: '50000', unit: 'litr', unit_cost: '11000', line_total: '550000' },
  ],
  payments: [
    { id: 'sp1', supplier_id: 's1', amount: '1000000', method: 'naqd', note: null, created_at: '2026-10-29T09:00:00Z' },
    { id: 'sp2', supplier_id: 's1', amount: '50000', method: 'karta', note: null, created_at: '2026-10-30T09:00:00Z' },
  ],
  voids: [{ payment_id: 'sp2' }],
  stockRows: [{ product_id: 'p1', qty_milli: '100000' }, { product_id: 'p2', qty_milli: '-2000' }],
  products: [
    { id: 'p1', name: 'Un', unit: 'kg' as const, is_active: true, cost_price: '9000', sale_price: '13000' },
    { id: 'p2', name: "Yog'", unit: 'litr' as const, is_active: true, cost_price: null, sale_price: '15000' },
    { id: 'p3', name: 'Yangi', unit: 'dona' as const, is_active: true, cost_price: null, sale_price: null },
  ],
});

describe('buildBooks', () => {
  it("xom qatorlarni BigInt va holatga o'giradi; harakatsiz tovar qoldig'i 0", () => {
    const b = buildBooks(raw());
    expect(b.purchases[0].subtotal).toBe(1450000n);
    expect(b.payments.map((p) => p.voided)).toEqual([false, true]);
    expect(b.stock.find((s) => s.product_id === 'p3')!.qty_milli).toBe(0n);
    expect(b.stock.find((s) => s.product_id === 'p2')!.qty_milli).toBe(-2000n);
    expect(b.lines[0].line_total).toBe(900000n);
  });
});

describe("ta'minotchi hisobi (core)", () => {
  const b = buildBooks(raw());
  it("kirim 1 450 000 + 90 000, bekor qilingan kirim va bekor to'lov hisobga kirmaydi", () => {
    const t = supplierTotals(b).get('s1')!;
    expect(t).toEqual({ goods: 1540000n, paid: 1000000n, outstanding: 540000n });
    expect(supplierTotals(b).has('s2')).toBe(false);
  });
  it("Eski + Tovar − Berildi = Ostatka davr bo'yicha", () => {
    expect(supplierStatement(b, 's1', { from: '2026-10-29', to: '2026-10-29' })).toMatchObject({ opening: 0n, goods: 1450000n, paid: 1000000n, balance: 450000n });
    expect(supplierStatement(b, 's1', { from: '2026-10-31', to: '2026-10-31' })).toMatchObject({ opening: 450000n, goods: 90000n, total: 540000n, paid: 0n, balance: 540000n });
    expect(supplierStatement(b, 's1', { from: null, to: null })).toMatchObject({ goods: 1540000n, paid: 1000000n, balance: 540000n });
  });
  it("harakatsiz ta'minotchi faol hisoblanmaydi", () => {
    expect(isActiveSettlement(supplierStatement(b, 's2', { from: null, to: null }))).toBe(false);
    expect(isActiveSettlement(supplierStatement(b, 's1', { from: null, to: null }))).toBe(true);
  });
});

describe('mijoz oldi-berdi (veb) mobil bilan bir xil qoida', () => {
  const sale = (id: string, st: 'posted' | 'reversed', total: bigint, at: string): SaleDoc =>
    ({ id, customer_id: 'c1', status: st, subtotal: total, created_at: at, posted_at: at, created_by: 'u' });
  const pay = (id: string, amount: bigint, at: string, voided = false): Payment =>
    ({ id, customer_id: 'c1', amount, method: 'naqd', note: null, created_by: 'u', created_at: at, void: voided ? { id: 'v', payment_id: id, reason: 'x', created_by: 'u', created_at: at } : null });
  it("bekor qilingan savdo va to'lov hisobga olinmaydi", () => {
    const sales = [sale('a', 'posted', 130000n, '2026-10-29T08:00:00Z'), sale('b', 'reversed', 99000n, '2026-10-29T09:00:00Z')];
    const pays = [pay('p1', 30000n, '2026-10-29T10:00:00Z'), pay('p2', 5000n, '2026-10-29T11:00:00Z', true)];
    expect(customerStatement(sales, pays, 'c1', { from: null, to: null })).toMatchObject({ goods: 130000n, paid: 30000n, balance: 100000n });
  });
  it("Toshkent kuni: UTC 20:00 → keyingi kun", () => {
    const sales = [sale('a', 'posted', 1000n, '2026-10-30T20:00:00Z')];
    expect(customerStatement(sales, [], 'c1', { from: '2026-10-31', to: '2026-10-31' }).goods).toBe(1000n);
    expect(customerStatement(sales, [], 'c1', { from: '2026-10-30', to: '2026-10-30' }).goods).toBe(0n);
  });
});

describe('ombor ko\'rinishi', () => {
  const item = (o: Partial<StockItem>): StockItem => ({ product_id: 'p', name: 'Un', unit: 'kg', is_active: true, qty_milli: 1000n, cost_price: 9000n, sale_price: 13000n, ...o });
  it("birlik foydasi core'dan; tan yoki sotuv narxi yo'q bo'lsa null; manfiy qoldiq", () => {
    expect(stockView(item({}))).toEqual({ level: 'positive', margin: 4000n });
    expect(stockView(item({ cost_price: null })).margin).toBeNull();
    expect(stockView(item({ sale_price: null })).margin).toBeNull();
    expect(stockView(item({ qty_milli: -1n })).level).toBe('negative');
    expect(stockView(item({ qty_milli: 0n })).level).toBe('zero');
    expect(stockView(item({ cost_price: 15000n })).margin).toBe(-2000n);
  });
  it("sana oralig'i ikki chegara bilan", () => {
    expect(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d) => inDayRange(d, { from: '2026-10-02', to: '2026-10-03' }))).toEqual([false, true, true, false]);
    expect(inDayRange('1999-01-01', { from: null, to: null })).toBe(true);
  });
});

describe('menyu', () => {
  it("Daftarlar va ombor bo'limi, sarlavhalar", () => {
    const g = NAV_GROUPS.find((x) => x.label === 'Daftarlar va ombor')!;
    expect(g.items.map((i) => i.href)).toEqual(['/books/in', '/books/out', '/warehouse', '/suppliers']);
    expect(pageTitle('/books/in')).toBe('Kirim daftari');
    expect(pageTitle('/books/out')).toBe('Chiqim daftari');
    expect(pageTitle('/warehouse')).toBe('Ombor');
    expect(NAV_ITEMS.filter((i) => i.href === '/suppliers')).toHaveLength(1);
    expect(isActive('/books/in', '/books/out')).toBe(false);
  });
});

describe('mijoz turi ustuni (006) bo\'lmasa ilova yiqilmaydi', () => {
  const fake = (error: unknown) => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error }) }) }) }),
  });
  it("ustun bor -> true; 42703 yoki 'does not exist' -> false; boshqa xato -> tashlaydi", async () => {
    expect(await hasCustomerKind(fake(null) as never, 's')).toBe(true);
    expect(await hasCustomerKind(fake({ code: '42703', message: 'x' }) as never, 's')).toBe(false);
    expect(await hasCustomerKind(fake({ message: 'column customers.kind does not exist' }) as never, 's')).toBe(false);
    await expect(hasCustomerKind(fake({ code: '42501', message: 'permission denied' }) as never, 's')).rejects.toBeTruthy();
  });
});
