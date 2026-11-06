/**
 * Ta'minotchilar daftari ro'yxati (UI'siz, testlanadi). Qoldiq `supplierTotals` (sumAmounts), ikkinchi yo'l —
 * har ta'minotchining varaq yozuvlaridan core `partnerBalance`: mos kelmasa to'xtaydi.
 */
import { assertTotalsMatch, partnerBalance, TotalsMismatchError } from '@hisobchi/core';
import { supplierTotals, type BooksData } from './data/books';
import { supplierEntries } from './data/partnerLedger';
import type { PartnerListRow } from './ledgerView';

export interface SupplierDebtCard {
  /** Mening qarzim: ta'minotchilarga jami (faqat musbat qoldiqlar) */
  iOwe: bigint;
  creditorCount: number;
}

export type SupplierBook = { ok: true; rows: PartnerListRow[]; card: SupplierDebtCard } | { ok: false; message: string; rows: PartnerListRow[]; card: null };

const newest = (a: string | null, b: string) => (a === null || new Date(b).getTime() > new Date(a).getTime() ? b : a);

export function buildSupplierBook(data: Pick<BooksData, 'suppliers' | 'purchases' | 'payments'>): SupplierBook {
  const totals = supplierTotals(data);
  let iOwe = 0n;
  let creditorCount = 0;
  const rows: PartnerListRow[] = data.suppliers.map((s) => {
    const balance = totals.get(s.id)?.outstanding ?? 0n;
    const entries = supplierEntries(s.id, data);
    const second = partnerBalance(entries.map((e) => ({ kind: e.kind === 'payment' ? ('payment' as const) : ('goods' as const), date: e.date, amount: e.amount, cancelled: e.cancelled })));
    assertTotalsMatch(`ta'minotchi qarzi: ${s.name}`, balance, second);
    if (balance > 0n) {
      iOwe += balance;
      creditorCount += 1;
    }
    let last: string | null = null;
    for (const p of data.purchases) if (p.supplier_id === s.id) last = newest(last, p.created_at);
    for (const p of data.payments) if (p.supplier_id === s.id) last = newest(last, p.created_at);
    return { id: s.id, name: s.name, phone: s.phone, is_active: s.is_active, balance, lastActivity: last };
  });
  return { ok: true, rows, card: { iOwe, creditorCount } };
}

/** Mismatch'ni xabarga o'giradi (sahifa qulamasin): ro'yxat bo'sh, karta o'rniga xato */
export function safeSupplierBook(data: Pick<BooksData, 'suppliers' | 'purchases' | 'payments'>): SupplierBook {
  try {
    return buildSupplierBook(data);
  } catch (e) {
    if (e instanceof TotalsMismatchError) return { ok: false, message: `Hisob mos kelmadi (${e.label}): ${e.first} ≠ ${e.second}. Sahifani yangilang.`, rows: [], card: null };
    throw e;
  }
}
