/**
 * Ta'minotchiga to'lov va teskari yozuvlar (007 RPC) — daftar varag'idan. Hammasi append-only:
 * to'lov `void_supplier_payment` bilan, kirim/boshlang'ich qarz `reverse_purchase` bilan bekor qilinadi (o'chirilmaydi).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, isRpcMissing, toAppError } from '../errors';
import { toBig } from '../money';
import type { PaymentMethod } from './types';

type SB = SupabaseClient;

function check<T>(res: { data: T | null; error: unknown }): T | null {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

export interface SupplierPaymentArgs {
  shopId: string;
  paymentId: string;
  clientOpId: string;
  supplierId: string;
  amount: bigint;
  method: PaymentMethod;
  note: string | null;
  /** To'lov sanasi (ISO vaqt); null = hozir (server) */
  createdAt?: string | null;
}

/** record_supplier_payment: server qarzdan oshmasligini tekshiradi, client_op_id bo'yicha idempotent */
export async function recordSupplierPayment(sb: SB, a: SupplierPaymentArgs): Promise<string> {
  const args: Record<string, unknown> = {
    p_shop_id: a.shopId,
    p_payment_id: a.paymentId,
    p_client_op_id: a.clientOpId,
    p_supplier_id: a.supplierId,
    p_amount: a.amount.toString(),
    p_method: a.method,
    p_note: a.note,
  };
  if (a.createdAt) args.p_created_at = a.createdAt;
  const id = check(await sb.rpc('record_supplier_payment', args)) as string | null;
  if (!id) throw new AppError('unknown', "Server to'lov identifikatorini qaytarmadi.");
  const row = check(await sb.from('supplier_payments').select('id, amount::text').eq('shop_id', a.shopId).eq('id', id).maybeSingle()) as { id: string; amount: string } | null;
  if (!row) throw new AppError('unknown', "To'lov serverda topilmadi. Ta'minotchi daftarini tekshiring.");
  if (toBig(row.amount) !== a.amount) throw new AppError('conflict', "Server allaqachon boshqa summadagi to'lovni qaytardi. Daftarni tekshiring.");
  return id;
}

/** Ta'minotchi to'lovini bekor qilish: teskari yozuv (supplier_payment_voids), to'lov o'chirilmaydi */
export async function voidSupplierPayment(sb: SB, shopId: string, paymentId: string, reason: string): Promise<void> {
  check(await sb.rpc('void_supplier_payment', { p_shop_id: shopId, p_payment_id: paymentId, p_reason: reason.trim() }));
  const row = check(await sb.from('supplier_payment_voids').select('id').eq('shop_id', shopId).eq('payment_id', paymentId).maybeSingle());
  if (!row) throw new AppError('unknown', "Server to'lov bekor qilinishini tasdiqlamadi.");
}

/** Kirimni (yoki boshlang'ich qarzni) bekor qilish: teskari yozuv, ombor harakati ham teskarilanadi */
/**
 * Kirimni bekor qilish (F3, 016): kirim va U BILAN BERILGAN to'lov bitta tranzaksiyada bekor qilinadi
 * (`reverse_purchase_with_payments`), ta'minotchiga ortiqcha to'lov qolmaydi. 016 qo'llanmagan serverda avvalgi
 * `reverse_purchase` (to'lov qoladi) — natija `'legacy'`, chaqiruvchi savdogarga aytadi (jim emas).
 */
export async function reversePurchase(sb: SB, shopId: string, documentId: string, clientOpId: string, reason: string): Promise<'with_payment' | 'legacy'> {
  const args = { p_shop_id: shopId, p_document_id: documentId, p_client_op_id: clientOpId, p_reason: reason.trim() };
  let mode: 'with_payment' | 'legacy' = 'with_payment';
  const res = await sb.rpc('reverse_purchase_with_payments', { ...args, p_void_payment: true });
  if (res.error && isRpcMissing(res.error, 'reverse_purchase_with_payments')) {
    mode = 'legacy';
    check(await sb.rpc('reverse_purchase', args));
  } else check(res);
  const doc = check(await sb.from('purchase_documents').select('status').eq('shop_id', shopId).eq('id', documentId).maybeSingle()) as { status: string } | null;
  if (doc?.status !== 'reversed') throw new AppError('unknown', 'Server kirim bekor qilinishini tasdiqlamadi.');
  return mode;
}
