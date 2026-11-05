/**
 * @module payment-rules
 * Savdo to'lovi qoidalari. Bir martalik mijoz qarzga olmaydi: savdo to'liq to'lanadi.
 * PostgreSQL `post_sale` shu qoidani takrorlaydi (walkin_requires_full_payment, payment_exceeds_debt).
 */
export type CustomerKind = 'regular' | 'one_time';

export type SalePaymentCheck =
  | { ok: true; /** Savdodan keyin shu savdo bo'yicha qolgan qarz */ debt: bigint }
  | { ok: false; code: 'WALKIN_REQUIRES_FULL_PAYMENT' | 'PAID_EXCEEDS_TOTAL' | 'NEGATIVE_PAID'; message: string };

export function checkSalePayment(input: { kind: CustomerKind; total: bigint; paid: bigint | null }): SalePaymentCheck {
  const paid = input.paid ?? 0n;
  if (paid < 0n) return { ok: false, code: 'NEGATIVE_PAID', message: "To'lov manfiy bo'lishi mumkin emas" };
  if (paid > input.total) return { ok: false, code: 'PAID_EXCEEDS_TOTAL', message: "To'lov savdo jamidan katta" };
  if (input.kind === 'one_time' && (input.total <= 0n || paid !== input.total)) {
    return { ok: false, code: 'WALKIN_REQUIRES_FULL_PAYMENT', message: "Bir martalik mijoz qarzga olmaydi: savdo to'liq to'lanishi kerak" };
  }
  return { ok: true, debt: input.total - paid };
}
