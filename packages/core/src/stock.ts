/**
 * @module stock
 * Ombor qoldig'i harakatlardan hisoblanadi (alohida kiritilmaydi): kirim +, savdo -, tuzatish +-,
 * bekor qilish teskari. Manfiy qoldiqqa RUXSAT (kirim hali yozilmagan bo'lishi mumkin), lekin ogohlantiriladi (sariq).
 */
import type { ValidationIssue } from './types.js';

export type StockMovementKind = 'purchase' | 'sale' | 'adjustment' | 'purchase_reversal' | 'sale_reversal';

export interface StockMovement {
  productId: string;
  kind: StockMovementKind;
  /** Asosiy birlikda, 1000 = 1 birlik; ishorasi harakat turiga mos */
  qtyMilli: bigint;
}

/** Tur va ishora mosligi: purchase/sale_reversal musbat, sale/purchase_reversal manfiy, adjustment nolmas */
export function movementError(m: StockMovement): string | null {
  if (m.qtyMilli === 0n) return 'Harakat miqdori nol bo\'lishi mumkin emas';
  const positive = m.kind === 'purchase' || m.kind === 'sale_reversal';
  const negative = m.kind === 'sale' || m.kind === 'purchase_reversal';
  if (positive && m.qtyMilli < 0n) return `${m.kind}: miqdor musbat bo'lishi kerak`;
  if (negative && m.qtyMilli > 0n) return `${m.kind}: miqdor manfiy bo'lishi kerak`;
  return null;
}

/** Tovar bo'yicha qoldiq (harakatlar yig'indisi). Noto'g'ri ishorali harakat xato beradi. */
export function stockBalances(movements: readonly StockMovement[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const m of movements) {
    const err = movementError(m);
    if (err) throw new Error(err);
    out.set(m.productId, (out.get(m.productId) ?? 0n) + m.qtyMilli);
  }
  return out;
}

export type StockLevel = 'negative' | 'zero' | 'positive';

export function stockLevel(qtyMilli: bigint): StockLevel {
  return qtyMilli < 0n ? 'negative' : qtyMilli === 0n ? 'zero' : 'positive';
}

/** Manfiy qoldiq — sariq ogohlantirish (bloklamaydi) */
export function stockWarning(qtyMilli: bigint): ValidationIssue | null {
  return qtyMilli < 0n
    ? { code: 'NEGATIVE_STOCK', message: "Ombor qoldig'i manfiy: kirim yozilmagan bo'lishi mumkin", severity: 'warning' }
    : null;
}

export interface SaleStockLine {
  /** Tovarga bog'lanmagan qator (null) ombor harakati yaratmaydi */
  productId: string | null;
  qtyMilli: bigint;
}

/** Savdo qatorlaridan ombor harakatlari (chiqim, manfiy) */
export function saleMovements(lines: readonly SaleStockLine[]): StockMovement[] {
  return lines.flatMap((l) => (l.productId ? [{ productId: l.productId, kind: 'sale' as const, qtyMilli: -l.qtyMilli }] : []));
}

/** Savdo/kirim harakatlarining teskarisi (bekor qilish) */
export function reversalMovements(movements: readonly StockMovement[]): StockMovement[] {
  const out: StockMovement[] = [];
  for (const m of movements) {
    if (m.kind === 'sale') out.push({ productId: m.productId, kind: 'sale_reversal', qtyMilli: -m.qtyMilli });
    else if (m.kind === 'purchase') out.push({ productId: m.productId, kind: 'purchase_reversal', qtyMilli: -m.qtyMilli });
  }
  return out;
}
