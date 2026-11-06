/**
 * Mijozlar daftari ro'yxati (UI'siz, testlanadi). Hisob core'da: qoldiq `partnerBalance`, eskirgan qarz `agedDebt`.
 * Ikkinchi yo'l: jami qarz alohida kod bilan (`computeTotals`, ledger.ts) hisoblanib solishtiriladi — mos kelmasa to'xtaydi.
 */
import { agedDebt, assertTotalsMatch, partnerBalance, tashkentDate, TotalsMismatchError } from '@hisobchi/core';
import { computeTotals } from './data/ledger';
import { customerEntries } from './data/partnerLedger';
import type { Customer, Payment, SaleDoc } from './data/types';
import type { PartnerListRow } from './ledgerView';

export interface CustomerListRow extends PartnerListRow {
  /** 30+ kunlik qarz (FIFO) */
  aged: bigint;
}

export interface DebtCard {
  /** Jami qarz (faqat musbat qoldiqlar, faol va arxivlanganlar birga) */
  totalDebt: bigint;
  debtorCount: number;
  /** 30+ kunlik qarz jami va shunday mijozlar soni */
  aged: bigint;
  agedCount: number;
}

export type CustomerBook = { ok: true; rows: CustomerListRow[]; card: DebtCard } | { ok: false; message: string; rows: CustomerListRow[]; card: null };

const newest = (a: string | null, b: string) => (a === null || new Date(b).getTime() > new Date(a).getTime() ? b : a);

export function buildCustomerBook(customers: readonly Customer[], sales: readonly SaleDoc[], payments: readonly Payment[], now: Date = new Date()): CustomerBook {
  const asOf = tashkentDate(now);
  const salesBy = new Map<string, SaleDoc[]>();
  const paysBy = new Map<string, Payment[]>();
  for (const s of sales) if (s.customer_id) salesBy.set(s.customer_id, [...(salesBy.get(s.customer_id) ?? []), s]);
  for (const p of payments) paysBy.set(p.customer_id, [...(paysBy.get(p.customer_id) ?? []), p]);

  let totalDebt = 0n;
  let debtorCount = 0;
  let aged = 0n;
  let agedCount = 0;
  const rows: CustomerListRow[] = customers.map((c) => {
    const s = salesBy.get(c.id) ?? [];
    const p = paysBy.get(c.id) ?? [];
    const entries = customerEntries(c.id, s, p);
    const balance = partnerBalance(entries.map((e) => ({ kind: e.kind === 'payment' ? ('payment' as const) : ('goods' as const), date: e.date, amount: e.amount, cancelled: e.cancelled })));
    const a = agedDebt(entries, asOf, 30);
    if (balance > 0n) {
      totalDebt += balance;
      debtorCount += 1;
    }
    if (a > 0n) {
      aged += a;
      agedCount += 1;
    }
    let last: string | null = null;
    for (const x of s) last = newest(last, x.created_at);
    for (const x of p) last = newest(last, x.created_at);
    return { id: c.id, name: c.name, phone: c.phone, is_active: c.is_active, balance, lastActivity: last, aged: a };
  });

  // Ikkinchi mustaqil yo'l: ledger.ts `computeTotals` (savdolar − to'lovlar, boshqa kod)
  const ids = new Set(customers.map((c) => c.id));
  const other = computeTotals(
    sales.filter((x) => x.customer_id && ids.has(x.customer_id)),
    payments.filter((x) => ids.has(x.customer_id)),
    now,
  );
  try {
    assertTotalsMatch('mijozlar jami qarzi', totalDebt, other.totalDebt);
    assertTotalsMatch('qarzdorlar soni', BigInt(debtorCount), BigInt(other.debtorCount));
  } catch (e) {
    if (e instanceof TotalsMismatchError) return { ok: false, message: `Hisob mos kelmadi (${e.label}): ${e.first} ≠ ${e.second}. Sahifani yangilang.`, rows, card: null };
    throw e;
  }
  return { ok: true, rows, card: { totalDebt, debtorCount, aged, agedCount } };
}
