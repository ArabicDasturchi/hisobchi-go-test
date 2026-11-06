import { describe, expect, it } from 'vitest';
import { paymentTimestamp } from '../src/components/forms/SupplierPaymentModal';
import type { BooksData } from '../src/lib/data/books';
import { safeSupplierBook } from '../src/lib/supplierBook';

const sup = (id: string, name: string, active = true) => ({ id, name, phone: null, notes: null, is_active: active, created_at: '2026-01-01T00:00:00Z' });
const data: Pick<BooksData, 'suppliers' | 'purchases' | 'payments'> = {
  suppliers: [sup('s1', 'Ali'), sup('s2', 'Vali'), sup('s3', 'Arxiv', false)],
  purchases: [
    { id: 'o1', kind: 'opening', supplier_id: 's1', doc_date: '2026-11-05', status: 'posted', subtotal: 60_186_000n, created_at: '2026-11-05T09:00:00Z' },
    { id: 'k1', kind: 'purchase', supplier_id: 's1', doc_date: '2026-11-01', status: 'posted', subtotal: 2_000_000n, created_at: '2026-11-01T09:00:00Z' },
    { id: 'k2', kind: 'purchase', supplier_id: 's1', doc_date: '2026-11-02', status: 'reversed', subtotal: 777n, created_at: '2026-11-02T09:00:00Z' },
    { id: 'k3', kind: 'purchase', supplier_id: 's2', doc_date: '2026-11-03', status: 'posted', subtotal: 500_000n, created_at: '2026-11-03T09:00:00Z' },
  ],
  payments: [
    { id: 'p1', supplier_id: 's1', amount: 1_000_000n, method: 'naqd', note: null, created_at: '2026-11-06T09:00:00Z', voided: false },
    { id: 'p2', supplier_id: 's2', amount: 500_000n, method: 'naqd', note: null, created_at: '2026-11-04T09:00:00Z', voided: false },
    { id: 'p3', supplier_id: 's2', amount: 9n, method: 'naqd', note: null, created_at: '2026-11-04T10:00:00Z', voided: true },
  ],
};

describe("ta'minotchilar daftari: «Mening qarzim» kartasi", () => {
  it("boshlang'ich qarz bilan jami qarz, ikki yo'l mos", () => {
    const b = safeSupplierBook(data);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.card.iOwe).toBe(61_186_000n); // 60 186 000 + 2 000 000 − 1 000 000; s2 to'langan
    expect(b.card.creditorCount).toBe(1);
    const by = Object.fromEntries(b.rows.map((r) => [r.id, r]));
    expect(by.s2!.balance).toBe(0n);
    expect(by.s1!.lastActivity).toBe('2026-11-06T09:00:00Z');
  });
});

describe("ta'minotchi to'lov sanasi", () => {
  it('bugun — server vaqti (null), boshqa kun — Toshkent tushligi', () => {
    expect(paymentTimestamp('2026-11-06', '2026-11-06')).toBeNull();
    expect(paymentTimestamp('2026-11-01', '2026-11-06')).toBe('2026-11-01T12:00:00+05:00');
  });
});
