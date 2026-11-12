/**
 * Daftar varag'ining ma'lumot qatlami (mijoz va ta'minotchi uchun bitta shakl).
 * Yangi hisob YO'Q: savdo/kirim/to'lov jurnalidan `LedgerEntry` yig'iladi, qatorlar va ketma-ket qoldiq
 * faqat @hisobchi/core `ledgerRows` da. Ikkinchi yo'l: PostgreSQL `partner_statement` (butun davr) — mos kelmasa varaq to'xtaydi.
 */
import { assertLedgerMatches, ledgerRows, partnerBalance, TotalsMismatchError, tashkentDate, type LedgerEntry, type LedgerRow } from '@hisobchi/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toBig } from '../money';
import type { BooksData } from './books';
import type { Payment, PaymentMethod, SaleDoc } from './types';

export type PartnerKind = 'customer' | 'supplier';

/** Hujjat turi (bekor qilish va havola uchun) */
export type EntryRef = 'sale' | 'customer_payment' | 'purchase' | 'opening' | 'debt' | 'supplier_payment';

export interface SheetEntry extends LedgerEntry {
  ref: EntryRef;
  method?: PaymentMethod | string | null;
  note?: string | null;
  /** Bekor qilingan bo'lsa sababi (bor bo'lsa) */
  cancelReason?: string | null;
}

export type SheetRow = LedgerRow<SheetEntry>;

export function customerEntries(customerId: string, sales: readonly SaleDoc[], payments: readonly Payment[]): SheetEntry[] {
  return [
    ...sales
      .filter((s) => s.customer_id === customerId)
      .map<SheetEntry>((s) => ({ id: s.id, ref: 'sale', kind: 'goods', date: tashkentDate(s.created_at), at: s.created_at, amount: s.subtotal, cancelled: s.status !== 'posted' })),
    ...payments
      .filter((p) => p.customer_id === customerId)
      .map<SheetEntry>((p) => ({
        id: p.id,
        ref: 'customer_payment',
        kind: 'payment',
        date: tashkentDate(p.created_at),
        at: p.created_at,
        amount: p.amount,
        cancelled: p.void !== null,
        method: p.method,
        note: p.note,
        cancelReason: p.void?.reason ?? null,
      })),
  ];
}

export function supplierEntries(supplierId: string, data: Pick<BooksData, 'purchases' | 'payments'>): SheetEntry[] {
  return [
    ...data.purchases
      .filter((p) => p.supplier_id === supplierId)
      .map<SheetEntry>((p) => ({
        id: p.id,
        // 'debt' (013): tovarsiz qarz yozuvi — qarzga «Tovar» kabi qo'shiladi, lekin kirim emas (qatorsiz)
        ref: p.kind === 'opening' ? 'opening' : p.kind === 'debt' ? 'debt' : 'purchase',
        kind: p.kind === 'opening' ? 'opening' : 'goods',
        date: p.doc_date,
        at: p.created_at,
        amount: p.subtotal,
        cancelled: p.status !== 'posted',
      })),
    ...data.payments
      .filter((p) => p.supplier_id === supplierId)
      .map<SheetEntry>((p) => ({
        id: p.id,
        ref: 'supplier_payment',
        kind: 'payment',
        date: tashkentDate(p.created_at),
        at: p.created_at,
        amount: p.amount,
        cancelled: p.voided,
        method: p.method,
        note: p.note,
      })),
  ];
}

export function buildSheet(entries: readonly SheetEntry[]): SheetRow[] {
  return ledgerRows(entries);
}

/** Mustaqil ikkinchi yo'l natijasi: SQL (server) yoki, SQL yetib bo'lmasa, core `partnerBalance` */
export type Verification =
  | { status: 'ok'; source: 'sql' | 'local' }
  | { status: 'mismatch'; ledger: bigint; independent: bigint; source: 'sql' | 'local' };

const FROM = '2000-01-01';
const TO = '2999-12-31';

/** PostgreSQL `partner_statement` (007): butun davr Ostatka'si. Xato bo'lsa null (demo, 007 qo'llanmagan, tarmoq) */
export async function fetchSqlBalance(sb: SupabaseClient, shopId: string, kind: PartnerKind, partnerId: string): Promise<bigint | null> {
  try {
    const { data, error } = await sb.rpc('partner_statement', { p_shop_id: shopId, p_kind: kind, p_partner_id: partnerId, p_from: FROM, p_to: TO });
    if (error || data === null || data === undefined) return null;
    const row = (Array.isArray(data) ? data[0] : data) as { balance?: string | number | null } | undefined;
    if (!row || row.balance === undefined || row.balance === null) return null;
    return toBig(row.balance);
  } catch {
    return null;
  }
}

/**
 * Varaq qoldig'ini tekshiradi. `sqlBalance` bor bo'lsa — SQL bilan; yo'q bo'lsa core `partnerBalance` bilan
 * (kirish jurnali bir xil, lekin hisob yo'li boshqa). Mos kelmasa `mismatch` — UI yozishni to'xtatadi.
 */
export function verifySheet(rows: readonly SheetRow[], entries: readonly SheetEntry[], sqlBalance: bigint | null): Verification {
  const local = partnerBalance(entries.map((e) => ({ kind: e.kind === 'payment' ? ('payment' as const) : ('goods' as const), date: e.date, amount: e.amount, cancelled: e.cancelled })));
  const independent = sqlBalance ?? local;
  const source = sqlBalance === null ? 'local' : 'sql';
  try {
    assertLedgerMatches(rows, independent, 'varaq');
    return { status: 'ok', source };
  } catch (e) {
    if (e instanceof TotalsMismatchError) return { status: 'mismatch', ledger: e.first, independent: e.second, source };
    throw e;
  }
}
