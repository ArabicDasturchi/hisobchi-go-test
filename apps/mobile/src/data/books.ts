/**
 * Daftarning "hamkor bo'yicha" ko'rinishi: har hamkor uchun Eski / Tovar / Jami / Berildi / Ostatka.
 * Hisob core `partnerStatement` orqali (purchasing.supplierStatement / customerStatement), bekor qilinganlar hisobga olinmaydi.
 */
import type { Settlement } from '@hisobchi/core';
import type { DateRange } from '../features/books';
import type { Ledger } from './ledger';
import type { Purchasing } from './purchasing';

export interface PartnerBookRow {
  partnerId: string;
  name: string;
  settlement: Settlement;
}

export type BookKind = 'in' | 'out';

const OPEN_FROM = '2000-01-01';
const OPEN_TO = '2999-12-31';

export async function partnerBook(
  kind: BookKind,
  range: DateRange,
  search: string,
  deps: { ledger: Ledger; purchasing: Purchasing },
): Promise<PartnerBookRow[]> {
  const from = range.from ?? OPEN_FROM;
  const to = range.to ?? OPEN_TO;
  const out: PartnerBookRow[] = [];
  if (kind === 'in') {
    const q = search.trim().toLowerCase();
    for (const s of await deps.purchasing.listSuppliers({ includeArchived: true })) {
      if (q && !s.name.toLowerCase().includes(q)) continue;
      out.push({ partnerId: s.id, name: s.name, settlement: await deps.purchasing.supplierStatement(s.id, from, to) });
    }
  } else {
    for (const c of await deps.ledger.listCustomers(search)) {
      out.push({ partnerId: c.id, name: c.name, settlement: await deps.purchasing.customerStatement(c.id, from, to) });
    }
  }
  // Davrda harakati ham, eski qoldig'i ham yo'q hamkorlar ro'yxatni to'ldirmasin
  return out.filter((r) => r.settlement.opening !== 0n || r.settlement.goods !== 0n || r.settlement.paid !== 0n || r.settlement.balance !== 0n);
}
