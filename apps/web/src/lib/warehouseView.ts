/**
 * Ombor ko'rinishlari (Qoldiq · Kirim · Chiqim) uchun sof mantiq (UI'siz, testlanadi). Pul faqat core `sumAmounts`;
 * miqdor yig'indilari BigInt. Eski Kirim/Chiqim daftari mantig'i ko'chirildi (qayta yozilmadi): davr tanlash,
 * kun bo'yicha guruhlash, bekor qilinganlar jamiga kirmaydi.
 */
import { sumAmounts, tashkentDate } from '@hisobchi/core';
import { inDayRange, type DayRange, type PurchaseDoc, type PurchaseLine } from './data/books';
import type { StockMovementRow } from './data/movements';

export type WarehouseTab = 'stock' | 'in' | 'out';

export function parseTab(raw: string | null | undefined): WarehouseTab {
  return raw === 'in' || raw === 'out' ? raw : 'stock';
}

export type Preset = 'today' | 'week' | 'month' | 'all' | 'custom';

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function presetRange(p: Exclude<Preset, 'custom'>, today: string): DayRange {
  if (p === 'today') return { from: today, to: today };
  if (p === 'week') return { from: addDays(today, -6), to: today };
  if (p === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: null, to: null };
}

export const todayTashkent = (now: Date = new Date()) => tashkentDate(now);

// ---------------------------------------------------------------------------
// Kirim
// ---------------------------------------------------------------------------

export interface ReceiptItem {
  id: string;
  date: string;
  supplierId: string;
  supplierName: string;
  amount: bigint;
  reversed: boolean;
  lines: PurchaseLine[];
}

export interface ReceiptDay {
  date: string;
  /** Kun jami: bekor qilinmagan kirimlar (boshlang'ich qarz kirim emas, kirmaydi) */
  total: bigint;
  items: ReceiptItem[];
}

/**
 * Kirimlar ro'yxati kun bo'yicha (yangisi birinchi). Boshlang'ich qarz (`kind = 'opening'`) KIRIM EMAS: bu yerga kirmaydi
 * (u ta'minotchi varag'ida alohida qator). Bekor qilingan kirim qatorda qoladi, jamiga kirmaydi.
 */
export function receiptDays(
  purchases: readonly PurchaseDoc[],
  lines: readonly PurchaseLine[],
  supplierName: ReadonlyMap<string, string>,
  o: { range: DayRange; supplierId?: string; query?: string },
): { days: ReceiptDay[]; total: bigint; count: number } {
  const q = (o.query ?? '').toLocaleLowerCase('uz').trim();
  const byDoc = new Map<string, PurchaseLine[]>();
  for (const l of lines) byDoc.set(l.document_id, [...(byDoc.get(l.document_id) ?? []), l]);
  const items: ReceiptItem[] = purchases
    .filter((p) => p.kind !== 'opening' && inDayRange(p.doc_date, o.range) && (!o.supplierId || p.supplier_id === o.supplierId))
    .map((p) => ({
      id: p.id,
      date: p.doc_date,
      supplierId: p.supplier_id,
      supplierName: supplierName.get(p.supplier_id) ?? "Ta'minotchi",
      amount: p.subtotal,
      reversed: p.status !== 'posted',
      lines: byDoc.get(p.id) ?? [],
    }))
    .filter((x) => !q || x.supplierName.toLocaleLowerCase('uz').includes(q) || x.lines.some((l) => l.product_name.toLocaleLowerCase('uz').includes(q)));
  const map = new Map<string, ReceiptItem[]>();
  for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
  const days = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({ date, items: list, total: sumAmounts(list.filter((x) => !x.reversed).map((x) => x.amount)) }));
  return { days, total: sumAmounts(days.map((d) => d.total)), count: items.filter((x) => !x.reversed).length };
}

// ---------------------------------------------------------------------------
// Chiqim
// ---------------------------------------------------------------------------

export type OutflowType = 'sale' | 'sale_reversal' | 'loss' | 'gain';

export interface OutflowItem {
  id: string;
  date: string;
  productId: string;
  productName: string;
  /** Ishorali miqdor: − chiqdi, + qaytdi */
  qtyMilli: bigint;
  type: OutflowType;
  documentId: string | null;
  note: string | null;
}

/** Tuzatish: kamaytirgan → yo'qotish, ko'paytirgan → ortiqcha (inventarizatsiya) */
export function outflowType(m: Pick<StockMovementRow, 'kind' | 'qty_milli'>): OutflowType {
  if (m.kind === 'sale') return 'sale';
  if (m.kind === 'sale_reversal') return 'sale_reversal';
  return m.qty_milli < 0n ? 'loss' : 'gain';
}

export function outflowItems(movements: readonly StockMovementRow[], productName: ReadonlyMap<string, string>, o: { range: DayRange; query?: string; type?: OutflowType | 'all' }): OutflowItem[] {
  const q = (o.query ?? '').toLocaleLowerCase('uz').trim();
  return movements
    .filter((m) => m.kind === 'sale' || m.kind === 'sale_reversal' || m.kind === 'adjustment')
    .map<OutflowItem>((m) => ({
      id: m.id,
      date: tashkentDate(m.created_at),
      productId: m.product_id,
      productName: productName.get(m.product_id) ?? 'Tovar',
      qtyMilli: m.qty_milli,
      type: outflowType(m),
      documentId: m.document_id,
      note: m.note,
    }))
    .filter((x) => inDayRange(x.date, o.range) && (!o.type || o.type === 'all' || x.type === o.type) && (!q || x.productName.toLocaleLowerCase('uz').includes(q)));
}

export interface OutflowTotal {
  productId: string;
  productName: string;
  /** Sotilgan (savdo − bekor qilingan savdo), musbat = chiqdi */
  sold: bigint;
  /** Tuzatish bilan yo'qotilgan (musbat) */
  lost: bigint;
  /** Tuzatish bilan topilgan (musbat) */
  found: bigint;
}

/** Tovar bo'yicha yig'indi (birliklar har xil bo'lgani uchun tovarlar orasida qo'shilmaydi) */
export function outflowTotals(items: readonly OutflowItem[]): OutflowTotal[] {
  const m = new Map<string, OutflowTotal>();
  for (const it of items) {
    const t = m.get(it.productId) ?? { productId: it.productId, productName: it.productName, sold: 0n, lost: 0n, found: 0n };
    if (it.type === 'sale') t.sold += -it.qtyMilli;
    else if (it.type === 'sale_reversal') t.sold -= it.qtyMilli;
    else if (it.type === 'loss') t.lost += -it.qtyMilli;
    else t.found += it.qtyMilli;
    m.set(it.productId, t);
  }
  return [...m.values()].sort((a, b) => (a.sold === b.sold ? a.productName.localeCompare(b.productName, 'uz') : a.sold > b.sold ? -1 : 1));
}
