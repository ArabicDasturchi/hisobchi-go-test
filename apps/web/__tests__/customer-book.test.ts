import { describe, expect, it } from 'vitest';
import { buildCustomerBook } from '../src/lib/customerBook';
import type { Customer, Payment, SaleDoc } from '../src/lib/data/types';

const NOW = new Date('2026-11-10T07:00:00Z');
const cust = (id: string, name: string, active = true): Customer => ({ id, name, phone: null, notes: null, is_active: active, source: 'app', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
const sale = (id: string, customer: string, at: string, subtotal: bigint, status: SaleDoc['status'] = 'posted'): SaleDoc => ({ id, customer_id: customer, status, subtotal, created_at: at, posted_at: at, created_by: 'u' });
const pay = (id: string, customer: string, at: string, amount: bigint, voided = false): Payment => ({
  id, customer_id: customer, amount, method: 'naqd', note: null, created_by: 'u', created_at: at,
  void: voided ? { id: 'v', payment_id: id, reason: 'xato', created_by: 'u', created_at: at } : null,
});

describe('mijozlar daftari: umumiy qarz kartasi', () => {
  const customers = [cust('a', 'Aziz'), cust('b', 'Bahrom'), cust('c', 'Ceyhun', false)];
  const sales = [
    sale('s1', 'a', '2026-09-01T07:00:00Z', 1_000_000n), // 30+ kun
    sale('s2', 'a', '2026-11-08T07:00:00Z', 300_000n), // yangi
    sale('s3', 'b', '2026-11-09T07:00:00Z', 500_000n),
    sale('s4', 'b', '2026-11-09T08:00:00Z', 90_000n, 'reversed'),
    sale('s5', 'c', '2026-10-01T07:00:00Z', 70_000n),
  ];
  const payments = [pay('p1', 'a', '2026-11-09T07:00:00Z', 400_000n), pay('p2', 'b', '2026-11-09T09:00:00Z', 500_000n), pay('p3', 'b', '2026-11-09T10:00:00Z', 10n, true)];

  it('jami qarz, qarzdorlar soni va 30+ kunlik qarz', () => {
    const b = buildCustomerBook(customers, sales, payments, NOW);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    // Aziz: 1 300 000 − 400 000 = 900 000 (shundan eski: 900 000 − 300 000 = 600 000); Bahrom: 0; Ceyhun (arxiv): 70 000, eski
    expect(b.card.totalDebt).toBe(970_000n);
    expect(b.card.debtorCount).toBe(2);
    expect(b.card.aged).toBe(670_000n);
    expect(b.card.agedCount).toBe(2);
  });

  it('har qator: qoldiq va eskirgan qarz', () => {
    const b = buildCustomerBook(customers, sales, payments, NOW);
    const by = Object.fromEntries(b.rows.map((r) => [r.id, r]));
    expect(by.a!.balance).toBe(900_000n);
    expect(by.a!.aged).toBe(600_000n);
    expect(by.b!.balance).toBe(0n);
    expect(by.b!.aged).toBe(0n);
  });

  it("mijozsiz savdo va boshqa do'kon yozuvlari qarzga qo'shilmaydi", () => {
    const b = buildCustomerBook([cust('a', 'Aziz')], [sale('x', 'zzz', '2026-11-01T07:00:00Z', 5n)], [], NOW);
    expect(b.ok && b.card.totalDebt).toBe(0n);
  });
});
