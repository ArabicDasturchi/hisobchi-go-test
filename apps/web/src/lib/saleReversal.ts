/**
 * Savdoni bekor qilishda shu savdo bilan kelgan to'lovlarni topish (sof funksiya, testlanadi). W1.
 *
 * Muammo: doimiy mijozning to'langan savdosi bekor qilinsa, to'lov joyida qolardi: mijoz qarzi manfiy bo'lib,
 * kassa pulni saqlab turardi; "Qayta yozish" yangi to'lov yozsa, kassa ikki marta sanalardi.
 * Yechim: bekor qilish oynasi shu savdoning to'lovlarini ko'rsatadi va ular savdo bilan BITTA tranzaksiyada
 * bekor qilinadi (`reverse_sale_with_payments`, 013). Bog'lanish faqat aniq belgilar bo'yicha (taxmin yo'q):
 *  1. `post_sale(p_paid)` to'lovi: `payments.client_op_id = 'sale-pay:' || documents.client_op_id`;
 *  2. veb savdo oqimi `useSaleSubmit` (savdo + alohida `record_payment`, W3 gacha amalda): izoh aynan
 *     `Savdo #XXXXXXXX uchun`, mijoz bir xil.
 * Bir martalik (`one_time`) mijoz to'lovini server o'zi bekor qiladi, bu yerda qaytarilmaydi.
 */
import { shortNumber } from './dates';
import { RpcMissingError } from './errors';
import type { Payment, SaleDoc } from './data/types';

/** Veb savdo oqimi (`useSaleSubmit`, savdo + alohida to'lov) to'lovga shu izohni yozadi */
export const legacySalePaymentNote = (saleId: string) => `Savdo ${shortNumber(saleId)} uchun`;

/**
 * Bekor qilish xatosidan keyin «to'lovni ham bekor qilish» tanlovi qanday bo'ladi (sof, testlanadi).
 * Server 013 ni bilmasa (`RpcMissingError`) hech narsa yozilmagan: tanlov qulfdan chiqariladi va olib tashlanadi,
 * savdogar savdoni to'lovsiz bekor qilishni yana tasdiqlaydi (jim emas: xabar ko'rsatiladi). Boshqa xatoda tanlov
 * qulflangan qoladi (o'sha client_op_id bilan boshqa tanlov yuborilmasin).
 */
export function refundAfterError(e: unknown): { attempted: boolean; refund: boolean } | null {
  return e instanceof RpcMissingError ? { attempted: false, refund: false } : null;
}

export function salePayments(
  sale: Pick<SaleDoc, 'id' | 'customer_id' | 'subtotal'> & { client_op_id?: string | null },
  payments: readonly (Pick<Payment, 'id' | 'customer_id' | 'amount' | 'note' | 'void'> & { client_op_id?: string | null })[],
  opts: { walkin?: boolean } = {},
): { ids: string[]; total: bigint } {
  if (!sale.customer_id || opts.walkin) return { ids: [], total: 0n };
  const opKey = sale.client_op_id ? `sale-pay:${sale.client_op_id}` : null;
  const note = legacySalePaymentNote(sale.id);
  const linked = payments.filter(
    (p) => !p.void && p.customer_id === sale.customer_id && ((opKey !== null && p.client_op_id === opKey) || p.note === note),
  );
  const total = linked.reduce((s, p) => s + p.amount, 0n);
  // Server summani savdodan oshirmaydi; bunday holat bo'lsa (qo'lda izoh takrori) hech narsa taklif qilinmaydi
  if (total > sale.subtotal) return { ids: [], total: 0n };
  return { ids: linked.map((p) => p.id), total };
}
