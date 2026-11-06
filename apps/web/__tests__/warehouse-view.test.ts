import { describe, expect, it } from 'vitest';
import type { PurchaseDoc, PurchaseLine } from '../src/lib/data/books';
import type { StockMovementRow } from '../src/lib/data/movements';
import { outflowItems, outflowTotals, outflowType, parseTab, presetRange, receiptDays } from '../src/lib/warehouseView';

const doc = (id: string, supplier: string, date: string, subtotal: bigint, over: Partial<PurchaseDoc> = {}): PurchaseDoc => ({ id, kind: 'purchase', supplier_id: supplier, doc_date: date, status: 'posted', subtotal, created_at: `${date}T09:00:00Z`, ...over });
const line = (document_id: string, name: string, qty: bigint, cost: bigint): PurchaseLine => ({ document_id, line_index: 0, product_id: 'p', product_name: name, qty_milli: qty, unit: 'dona', unit_cost: cost, line_total: (qty * cost) / 1000n });
const NAMES = new Map([['s1', 'Ali'], ['s2', 'Vali']]);

describe('tab parametri', () => {
  it("noma'lum qiymat — Qoldiq", () => {
    expect(parseTab(null)).toBe('stock');
    expect(parseTab('in')).toBe('in');
    expect(parseTab('out')).toBe('out');
    expect(parseTab('xyz')).toBe('stock');
  });
});

describe('Kirim ko\'rinishi', () => {
  const purchases = [
    doc('a', 's1', '2026-11-03', 1_000_000n),
    doc('b', 's2', '2026-11-03', 500_000n),
    doc('c', 's1', '2026-11-02', 40_000n, { status: 'reversed' }),
    doc('o', 's1', '2026-11-05', 60_186_000n, { kind: 'opening' }),
  ];
  const lines = [line('a', 'Un', 100_000n, 10_000n)];

  it("boshlang'ich qarz kirim emas: ro'yxat va jamiga kirmaydi (60 186 000 xatosi)", () => {
    const r = receiptDays(purchases, lines, NAMES, { range: { from: null, to: null } });
    expect(r.total).toBe(1_500_000n);
    expect(r.count).toBe(2);
    expect(r.days.flatMap((d) => d.items.map((i) => i.id))).not.toContain('o');
  });

  it("kun jami: bekor qilingan kirim qatorda turadi, jamiga kirmaydi", () => {
    const r = receiptDays(purchases, lines, NAMES, { range: { from: null, to: null } });
    expect(r.days.map((d) => [d.date, d.total])).toEqual([
      ['2026-11-03', 1_500_000n],
      ['2026-11-02', 0n],
    ]);
    expect(r.days[1]!.items[0]!.reversed).toBe(true);
  });

  it("ta'minotchi, sana va qidiruv filtri; tovar qatorlari biriktiriladi", () => {
    expect(receiptDays(purchases, lines, NAMES, { range: { from: null, to: null }, supplierId: 's2' }).total).toBe(500_000n);
    expect(receiptDays(purchases, lines, NAMES, { range: { from: '2026-11-03', to: '2026-11-03' } }).count).toBe(2);
    const q = receiptDays(purchases, lines, NAMES, { range: { from: null, to: null }, query: 'un' });
    expect(q.count).toBe(1);
    expect(q.days[0]!.items[0]!.lines).toHaveLength(1);
  });

  it('davr tayyor tanlovlari', () => {
    expect(presetRange('today', '2026-11-06')).toEqual({ from: '2026-11-06', to: '2026-11-06' });
    expect(presetRange('week', '2026-11-06')).toEqual({ from: '2026-10-31', to: '2026-11-06' });
    expect(presetRange('month', '2026-11-06')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect(presetRange('all', '2026-11-06')).toEqual({ from: null, to: null });
  });
});

describe('Chiqim ko\'rinishi', () => {
  const mv = (id: string, product: string, kind: StockMovementRow['kind'], qty: bigint, at: string, note: string | null = null): StockMovementRow => ({ id, product_id: product, kind, qty_milli: qty, document_id: kind === 'adjustment' ? null : 'd', note, created_at: at });
  const rows = [
    mv('1', 'p1', 'sale', -10_000n, '2026-11-03T07:00:00Z'),
    mv('2', 'p1', 'sale', -5_000n, '2026-11-04T07:00:00Z'),
    mv('3', 'p1', 'sale_reversal', 5_000n, '2026-11-04T08:00:00Z'),
    mv('4', 'p2', 'adjustment', -2_000n, '2026-11-04T09:00:00Z', 'singan'),
    mv('5', 'p2', 'adjustment', 1_000n, '2026-11-04T10:00:00Z', 'topildi'),
    mv('6', 'p1', 'purchase', 99_000n, '2026-11-04T10:00:00Z'),
  ];
  const names = new Map([['p1', 'Un'], ['p2', 'Shakar']]);

  it('turi: savdo, bekor, yo\'qotish, ortiqcha; kirim harakati kirmaydi', () => {
    expect(outflowType({ kind: 'adjustment', qty_milli: -1n })).toBe('loss');
    expect(outflowType({ kind: 'adjustment', qty_milli: 1n })).toBe('gain');
    const items = outflowItems(rows, names, { range: { from: null, to: null } });
    expect(items).toHaveLength(5);
  });

  it('tovar bo\'yicha yig\'indi: sotildi = savdo − bekor qilingan', () => {
    const t = outflowTotals(outflowItems(rows, names, { range: { from: null, to: null } }));
    const by = Object.fromEntries(t.map((x) => [x.productId, x]));
    expect(by.p1).toMatchObject({ sold: 10_000n, lost: 0n, found: 0n });
    expect(by.p2).toMatchObject({ sold: 0n, lost: 2_000n, found: 1_000n });
  });

  it('sana va tur filtri (Toshkent kuni)', () => {
    expect(outflowItems(rows, names, { range: { from: '2026-11-04', to: '2026-11-04' } })).toHaveLength(4);
    expect(outflowItems(rows, names, { range: { from: null, to: null }, type: 'loss' }).map((x) => x.id)).toEqual(['4']);
    expect(outflowItems(rows, names, { range: { from: null, to: null }, query: 'shak' })).toHaveLength(2);
  });
});
