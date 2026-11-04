/**
 * @module purchase
 * Kirim (ta'minotchidan tovar) hisobi. Formula savdo bilan bir xil: har qator alohida yaxlitlanadi,
 * keyin yig'iladi — (qty_milli * unit_cost + 500) / 1000. Faqat BigInt.
 *
 * Ostatka = Eski + Tovar - Berildi. PostgreSQL `post_purchase` shu hisobni mustaqil takrorlaydi;
 * mos kelmasa saqlanmaydi (assertTotalsMatch).
 */
import { calculateLineTotal } from './calculation.js';

export interface PurchaseLineInput {
  /** Miqdor, mingdan bir aniqlikda (1000 = 1 birlik) */
  qtyMilli: bigint;
  /** Birlik tan narxi, butun so'm */
  unitCost: bigint;
}

export interface PurchaseLineResult extends PurchaseLineInput {
  lineTotal: bigint;
}

export interface PurchaseResult {
  lines: PurchaseLineResult[];
  /** Tovar jami (qatorlar yig'indisi) */
  subtotal: bigint;
}

export function calculatePurchase(lines: readonly PurchaseLineInput[]): PurchaseResult {
  const results = lines.map((l) => ({ ...l, lineTotal: calculateLineTotal(l.qtyMilli, l.unitCost) }));
  return { lines: results, subtotal: results.reduce((s, l) => s + l.lineTotal, 0n) };
}

/** Oldi-berdi ko'rinishi: Eski, Tovar, Jami, Berildi, Ostatka */
export interface Settlement {
  /** Eski: oldingi qoldiq */
  opening: bigint;
  /** Tovar: shu hujjat/davr tovari */
  goods: bigint;
  /** Jami = Eski + Tovar */
  total: bigint;
  /** Berildi */
  paid: bigint;
  /** Ostatka = Jami - Berildi */
  balance: bigint;
}

export function settle(opening: bigint, goods: bigint, paid: bigint): Settlement {
  if (goods < 0n) throw new Error(`Manfiy tovar summasi: ${goods}`);
  if (paid < 0n) throw new Error(`Manfiy to'lov: ${paid}`);
  const total = opening + goods;
  return { opening, goods, total, paid, balance: total - paid };
}

export type PurchasePaymentCheck = { ok: true; settlement: Settlement } | { ok: false; code: 'PAID_EXCEEDS_TOTAL'; message: string };

/**
 * Kirim hujjati va berilgan to'lov: berildi Jami (Eski + Tovar) dan oshmasligi kerak
 * (server: payment_exceeds_debt). Oshsa — rad etiladi, jimgina yaxlitlanmaydi.
 */
export function settlePurchase(opening: bigint, lines: readonly PurchaseLineInput[], paid: bigint): PurchasePaymentCheck {
  const goods = calculatePurchase(lines).subtotal;
  const s = settle(opening, goods, paid);
  if (s.balance < 0n) {
    return { ok: false, code: 'PAID_EXCEEDS_TOTAL', message: `Berilgan to'lov jamidan katta (jami ${s.total}, berildi ${paid})` };
  }
  return { ok: true, settlement: s };
}

/** Summalar yig'indisi (kun/davr jami). Manfiy summa mumkin emas — jimgina qabul qilinmaydi. */
export function sumAmounts(values: readonly bigint[]): bigint {
  let sum = 0n;
  for (const v of values) {
    if (v < 0n) throw new Error(`Manfiy summa: ${v}`);
    sum += v;
  }
  return sum;
}
