/**
 * Ta'minotchi, kirim va ombor tuzatishi — yozish qatlami (veb). Barcha moliyaviy yozuvlar faqat RPC orqali
 * (007: post_purchase; 009: post_supplier_opening_balance; 006: adjust_stock). Jadvallarga to'g'ridan-to'g'ri
 * yozilmaydi (faqat `suppliers` kartochkasi: nom, telefon, izoh, arxiv holati — RLS ruxsat beradi).
 * RPC muvaffaqiyatidan keyin natija serverdan qayta o'qib tekshiriladi (savdo bilan bir xil uslub).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, toAppError } from '../errors';
import { toBig } from '../money';
import type { PostPurchaseLine } from '../purchaseForm';
import type { PaymentMethod } from './types';
import type { Supplier } from './books';

type SB = SupabaseClient;

function check<T>(res: { data: T | null; error: unknown }): T | null {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

const newId = () => crypto.randomUUID();
const SUPPLIER_COLS = 'id, name, phone, notes, is_active, created_at';

export interface SupplierInput {
  name: string;
  phone: string | null;
  notes: string | null;
}

export async function createSupplier(sb: SB, shopId: string, input: SupplierInput): Promise<Supplier> {
  const row = check(await sb.from('suppliers').insert({ id: newId(), shop_id: shopId, ...input }).select(SUPPLIER_COLS).single()) as Supplier | null;
  if (!row) throw new AppError('unknown', "Ta'minotchi saqlanmadi.");
  return row;
}

export async function updateSupplier(sb: SB, shopId: string, id: string, input: SupplierInput): Promise<Supplier> {
  const rows = check(await sb.from('suppliers').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).eq('shop_id', shopId).select(SUPPLIER_COLS)) as Supplier[] | null;
  const row = rows?.[0];
  if (!row) throw new AppError('not_found', "Ta'minotchi topilmadi yoki ruxsat yo'q.");
  return row;
}

/** Arxivlash/qaytarish: o'chirilmaydi (kirim va to'lov tarixi saqlanadi) */
export async function setSupplierActive(sb: SB, shopId: string, id: string, active: boolean): Promise<void> {
  const rows = check(await sb.from('suppliers').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id).eq('shop_id', shopId).select('id')) as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new AppError('not_found', "Ta'minotchi topilmadi yoki ruxsat yo'q.");
}

export interface OpeningBalanceArgs {
  shopId: string;
  documentId: string;
  clientOpId: string;
  supplierId: string;
  /** "Hozirgi qarzim", butun so'm */
  amount: bigint;
}

/** Boshlang'ich qarz: alohida "ochilish qoldig'i" yozuvi (009 migratsiyasi). Qayta yuborish takroriy yozuv yaratmaydi */
export async function postSupplierOpeningBalance(sb: SB, a: OpeningBalanceArgs): Promise<string> {
  const id = check(
    await sb.rpc('post_supplier_opening_balance', {
      p_shop_id: a.shopId,
      p_document_id: a.documentId,
      p_client_op_id: a.clientOpId,
      p_supplier_id: a.supplierId,
      p_amount: a.amount.toString(),
    }),
  ) as string | null;
  if (!id) throw new AppError('unknown', "Server boshlang'ich qarz identifikatorini qaytarmadi.");
  const doc = check(await sb.from('purchase_documents').select('subtotal::text, status').eq('shop_id', a.shopId).eq('id', id).maybeSingle()) as { subtotal: string; status: string } | null;
  if (!doc || doc.status !== 'posted' || toBig(doc.subtotal) !== a.amount) {
    throw new AppError('conflict', "Server boshqa summadagi boshlang'ich qarzni qaytardi. Ta'minotchi qarzini tekshiring.");
  }
  return id;
}

export interface SupplierDebtArgs {
  shopId: string;
  documentId: string;
  clientOpId: string;
  supplierId: string;
  /** Tovarsiz qarz summasi, butun so'm */
  amount: bigint;
}

/**
 * Ta'minotchiga tovarsiz qarz yozuvi (013 post_supplier_debt, W2): `purchase_documents.kind = 'debt'`, qatorsiz,
 * ombor harakati yo'q, bir ta'minotchiga bir nechta. Ochilish qoldig'idan farqli: ikkinchi yozuv rad etilmaydi.
 * Qayta yuborish takroriy yozuv yaratmaydi. 013 qo'llanmagan bo'lsa aniq xato (jim fallback yo'q).
 */
export async function postSupplierDebt(sb: SB, a: SupplierDebtArgs): Promise<string> {
  const id = check(
    await sb.rpc('post_supplier_debt', {
      p_shop_id: a.shopId,
      p_document_id: a.documentId,
      p_client_op_id: a.clientOpId,
      p_supplier_id: a.supplierId,
      p_amount: a.amount.toString(),
    }),
  ) as string | null;
  if (!id) throw new AppError('unknown', "Server qarz yozuvi identifikatorini qaytarmadi.");
  const doc = check(await sb.from('purchase_documents').select('subtotal::text, status, kind').eq('shop_id', a.shopId).eq('id', id).maybeSingle()) as { subtotal: string; status: string; kind: string } | null;
  if (!doc || doc.status !== 'posted' || doc.kind !== 'debt' || toBig(doc.subtotal) !== a.amount) {
    throw new AppError('conflict', "Server boshqa qarz yozuvini qaytardi. Ta'minotchi daftarini tekshiring.");
  }
  return id;
}

export interface PostPurchaseArgs {
  shopId: string;
  purchaseId: string;
  clientOpId: string;
  supplierId: string;
  /** "YYYY-MM-DD"; null = bugun (server Toshkent sanasi) */
  docDate: string | null;
  lines: PostPurchaseLine[];
  clientTotal: bigint;
  paid: bigint;
  method: PaymentMethod | null;
}

/**
 * post_purchase RPC. Server jamini qayta hisoblaydi (calc_mismatch bo'lsa hech narsa saqlanmaydi), to'lov qarzdan
 * oshmasligini tekshiradi, ombor qoldig'ini oshiradi va tan narxni yangilaydi. client_op_id bo'yicha idempotent.
 */
export async function postPurchase(sb: SB, a: PostPurchaseArgs): Promise<string> {
  const id = check(
    await sb.rpc('post_purchase', {
      p_shop_id: a.shopId,
      p_purchase_id: a.purchaseId,
      p_client_op_id: a.clientOpId,
      p_supplier_id: a.supplierId,
      p_doc_date: a.docDate,
      p_lines: a.lines.map((l) => ({ product_id: l.product_id, qty_milli: l.qty_milli.toString(), unit_cost: l.unit_cost.toString() })),
      p_client_total: a.clientTotal.toString(),
      p_payment_method: a.paid > 0n ? a.method : null,
      p_paid: a.paid > 0n ? a.paid.toString() : null,
    }),
  ) as string | null;
  if (!id) throw new AppError('unknown', "Server kirim identifikatorini qaytarmadi — kirim saqlanmagan bo'lishi mumkin.");
  const doc = check(await sb.from('purchase_documents').select('subtotal::text, status').eq('shop_id', a.shopId).eq('id', id).maybeSingle()) as { subtotal: string; status: string } | null;
  if (!doc) throw new AppError('unknown', "Kirim serverda topilmadi. Kirim daftarini tekshiring.");
  if (doc.status !== 'posted') throw new AppError('unknown', 'Kirim serverda tasdiqlanmagan holatda.');
  if (toBig(doc.subtotal) !== a.clientTotal) {
    throw new AppError('conflict', "Server allaqachon boshqa summadagi kirimni qaytardi. Kirim daftarini tekshiring.");
  }
  return id;
}

export interface AdjustStockArgs {
  shopId: string;
  productId: string;
  clientOpId: string;
  /** Qo'shiladigan (+) yoki ayriladigan (−) miqdor, qty_milli */
  deltaMilli: bigint;
  reason: string;
}

/** Inventarizatsiya tuzatishi (006 adjust_stock): qoldiqni teskari/to'ldiruvchi harakat bilan o'zgartiradi */
export async function adjustStock(sb: SB, a: AdjustStockArgs): Promise<void> {
  const id = check(
    await sb.rpc('adjust_stock', {
      p_shop_id: a.shopId,
      p_product_id: a.productId,
      p_client_op_id: a.clientOpId,
      p_qty_milli: a.deltaMilli.toString(),
      p_reason: a.reason.trim(),
    }),
  ) as string | null;
  if (!id) throw new AppError('unknown', 'Server tuzatish identifikatorini qaytarmadi.');
}
