/**
 * Daftarlar (kirim/chiqim), ta'minotchilar, ombor — faqat KO'RISH (veb yozmaydi).
 * Ma'lumot 006/007 migratsiyalaridan keyin mavjud; ular qo'llanmagan bo'lsa sahifa tushunarli xato ko'rsatadi,
 * ilovaning qolgan qismi ishlayveradi. Pul hisobi faqat @hisobchi/core (partnerStatement, sumAmounts, lineProfit).
 */
import { lineProfit, partnerStatement, stockLevel, sumAmounts, tashkentDate, type Settlement, type StatementEntry, type StockLevel } from '@hisobchi/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toBig } from '../money';
import { fetchAll } from './api';
import type { Payment, SaleDoc, Unit } from './types';

type SB = SupabaseClient;

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PurchaseDoc {
  id: string;
  /** 'opening' = boshlang'ich qarz (ochilish qoldig'i, 009); ustun bo'lmasa undefined = oddiy kirim */
  kind?: 'purchase' | 'opening';
  supplier_id: string;
  doc_date: string;
  status: 'posted' | 'reversed';
  subtotal: bigint;
  created_at: string;
}

export interface PurchaseLine {
  document_id: string;
  line_index: number;
  product_id: string;
  product_name: string;
  qty_milli: bigint;
  unit: string;
  unit_cost: bigint;
  line_total: bigint;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  amount: bigint;
  method: string;
  note: string | null;
  created_at: string;
  voided: boolean;
}

export interface StockItem {
  product_id: string;
  name: string;
  unit: Unit;
  is_active: boolean;
  qty_milli: bigint;
  cost_price: bigint | null;
  sale_price: bigint | null;
}

export interface BooksData {
  suppliers: Supplier[];
  purchases: PurchaseDoc[];
  lines: PurchaseLine[];
  payments: SupplierPayment[];
  stock: StockItem[];
}

/** 009 (purchase_documents.kind) qo'llanganmi; yo'q bo'lsa ilova avvalgidek ishlaydi */
async function hasPurchaseKind(sb: SB, shopId: string): Promise<boolean> {
  const { error } = await sb.from('purchase_documents').select('kind').eq('shop_id', shopId).limit(1);
  return !error;
}

export async function loadBooks(sb: SB, shopId: string): Promise<BooksData> {
  const purchaseCols = (await hasPurchaseKind(sb, shopId)) ? 'id, supplier_id, doc_date, status, kind, subtotal::text, created_at' : 'id, supplier_id, doc_date, status, subtotal::text, created_at';
  const [suppliers, purchases, lines, payments, voids, stockRows, products] = await Promise.all([
    fetchAll<Supplier>((from, to) => sb.from('suppliers').select('id, name, phone, notes, is_active, created_at').eq('shop_id', shopId).order('name').order('id').range(from, to)),
    fetchAll<Omit<PurchaseDoc, 'subtotal'> & { subtotal: string }>((from, to) =>
      sb.from('purchase_documents').select(purchaseCols).eq('shop_id', shopId).in('status', ['posted', 'reversed']).order('doc_date', { ascending: false }).order('id').range(from, to) as never,
    ),
    fetchAll<{ document_id: string; line_index: number; product_id: string; product_name: string; qty_milli: string; unit: string; unit_cost: string; line_total: string }>((from, to) =>
      sb.from('purchase_lines').select('document_id, line_index, product_id, product_name, qty_milli::text, unit, unit_cost::text, line_total::text').eq('shop_id', shopId).order('document_id').order('line_index').range(from, to) as never,
    ),
    fetchAll<{ id: string; supplier_id: string; amount: string; method: string; note: string | null; created_at: string }>((from, to) =>
      sb.from('supplier_payments').select('id, supplier_id, amount::text, method, note, created_at').eq('shop_id', shopId).order('created_at', { ascending: false }).order('id').range(from, to) as never,
    ),
    fetchAll<{ payment_id: string }>((from, to) => sb.from('supplier_payment_voids').select('payment_id').eq('shop_id', shopId).order('id').range(from, to)),
    fetchAll<{ product_id: string; qty_milli: string }>((from, to) => sb.from('product_stock').select('product_id, qty_milli::text').eq('shop_id', shopId).order('product_id').range(from, to) as never),
    fetchAll<{ id: string; name: string; unit: Unit; is_active: boolean; cost_price: string | null; sale_price: string | null }>((from, to) =>
      sb.from('products').select('id, name, unit, is_active, cost_price::text, sale_price::text').eq('shop_id', shopId).order('name').order('id').range(from, to) as never,
    ),
  ]);
  return buildBooks({ suppliers, purchases, lines, payments, voids, stockRows, products });
}

/** Xom server qatorlarini tiplarga o'giradi (sof, testlanadi) */
export function buildBooks(raw: {
  suppliers: Supplier[];
  purchases: { id: string; supplier_id: string; doc_date: string; status: 'posted' | 'reversed'; kind?: 'purchase' | 'opening'; subtotal: string; created_at: string }[];
  lines: { document_id: string; line_index: number; product_id: string; product_name: string; qty_milli: string; unit: string; unit_cost: string; line_total: string }[];
  payments: { id: string; supplier_id: string; amount: string; method: string; note: string | null; created_at: string }[];
  voids: { payment_id: string }[];
  stockRows: { product_id: string; qty_milli: string }[];
  products: { id: string; name: string; unit: Unit; is_active: boolean; cost_price: string | null; sale_price: string | null }[];
}): BooksData {
  const voided = new Set(raw.voids.map((v) => v.payment_id));
  const qty = new Map(raw.stockRows.map((r) => [r.product_id, toBig(r.qty_milli)]));
  return {
    suppliers: raw.suppliers,
    purchases: raw.purchases.map((p) => ({ ...p, subtotal: toBig(p.subtotal) })),
    lines: raw.lines.map((l) => ({ ...l, qty_milli: toBig(l.qty_milli), unit_cost: toBig(l.unit_cost), line_total: toBig(l.line_total) })),
    payments: raw.payments.map((p) => ({ ...p, amount: toBig(p.amount), voided: voided.has(p.id) })),
    stock: raw.products.map((p) => ({
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      is_active: p.is_active,
      qty_milli: qty.get(p.id) ?? 0n,
      cost_price: p.cost_price === null ? null : toBig(p.cost_price),
      sale_price: p.sale_price === null ? null : toBig(p.sale_price),
    })),
  };
}

// ---------------------------------------------------------------------------
// Hisob (core orqali)
// ---------------------------------------------------------------------------

export interface PartnerTotals {
  /** Boshlang'ich qarz (ochilish qoldig'i, 009). Kirim/tovar jamiga KIRMAYDI */
  opening: bigint;
  /** Kirim jami (ochilish qoldig'isiz, bekor qilinmagan) */
  goods: bigint;
  paid: bigint;
  /** opening + goods − paid: musbat = qarz */
  outstanding: bigint;
}

/** Ta'minotchi qarzi: ochilish qoldig'i + kirimlar (bekor qilinmagan) − to'lovlar (bekor qilinmagan) */
export function supplierTotals(data: Pick<BooksData, 'purchases' | 'payments'>): Map<string, PartnerTotals> {
  const goods = new Map<string, bigint[]>();
  const opening = new Map<string, bigint[]>();
  const paid = new Map<string, bigint[]>();
  for (const p of data.purchases) {
    if (p.status !== 'posted') continue;
    const bucket = p.kind === 'opening' ? opening : goods;
    bucket.set(p.supplier_id, [...(bucket.get(p.supplier_id) ?? []), p.subtotal]);
  }
  for (const p of data.payments) if (!p.voided) paid.set(p.supplier_id, [...(paid.get(p.supplier_id) ?? []), p.amount]);
  const out = new Map<string, PartnerTotals>();
  for (const id of new Set([...goods.keys(), ...opening.keys(), ...paid.keys()])) {
    const o = sumAmounts(opening.get(id) ?? []);
    const g = sumAmounts(goods.get(id) ?? []);
    const pd = sumAmounts(paid.get(id) ?? []);
    out.set(id, { opening: o, goods: g, paid: pd, outstanding: o + g - pd });
  }
  return out;
}

const OPEN_FROM = '2000-01-01';
const OPEN_TO = '2999-12-31';

export interface DayRange {
  from: string | null;
  to: string | null;
}

export function supplierStatement(data: Pick<BooksData, 'purchases' | 'payments'>, supplierId: string, range: DayRange): Settlement {
  const entries: StatementEntry[] = [
    ...data.purchases.filter((p) => p.supplier_id === supplierId).map((p) => ({ kind: 'goods' as const, date: p.doc_date, amount: p.subtotal, cancelled: p.status !== 'posted' })),
    ...data.payments.filter((p) => p.supplier_id === supplierId).map((p) => ({ kind: 'payment' as const, date: tashkentDate(p.created_at), amount: p.amount, cancelled: p.voided })),
  ];
  return partnerStatement(entries, range.from ?? OPEN_FROM, range.to ?? OPEN_TO);
}

export function customerStatement(sales: readonly SaleDoc[], payments: readonly Payment[], customerId: string, range: DayRange): Settlement {
  const entries: StatementEntry[] = [
    ...sales.filter((s) => s.customer_id === customerId).map((s) => ({ kind: 'goods' as const, date: tashkentDate(s.created_at), amount: s.subtotal, cancelled: s.status !== 'posted' })),
    ...payments.filter((p) => p.customer_id === customerId).map((p) => ({ kind: 'payment' as const, date: tashkentDate(p.created_at), amount: p.amount, cancelled: p.void !== null })),
  ];
  return partnerStatement(entries, range.from ?? OPEN_FROM, range.to ?? OPEN_TO);
}

export function inDayRange(date: string, r: DayRange): boolean {
  return (!r.from || date >= r.from) && (!r.to || date <= r.to);
}

export function isActiveSettlement(s: Settlement): boolean {
  return s.opening !== 0n || s.goods !== 0n || s.paid !== 0n || s.balance !== 0n;
}

export interface StockView {
  level: StockLevel;
  /** Birlik foydasi (sotuv − tan narx); tan narx yoki sotuv narxi noma'lum bo'lsa null */
  margin: bigint | null;
}

export function stockView(i: StockItem): StockView {
  const margin = i.cost_price === null || i.sale_price === null ? null : lineProfit({ qtyMilli: 1000n, unitPrice: i.sale_price, unitCost: i.cost_price });
  return { level: stockLevel(i.qty_milli), margin };
}

/** Qoralama kartochkasi uchun ta'minotchi nomlari. 006 qo'llanmagan yoki xato bo'lsa bo'sh (kartochka "Ta'minotchi" deydi) */
export async function listSupplierNames(sb: SB, shopId: string): Promise<ReadonlyMap<string, string>> {
  try {
    const rows = await fetchAll<{ id: string; name: string }>((from, to) => sb.from('suppliers').select('id, name').eq('shop_id', shopId).order('id').range(from, to));
    return new Map(rows.map((r) => [r.id, r.name]));
  } catch {
    return new Map();
  }
}
