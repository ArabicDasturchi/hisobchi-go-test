/**
 * Kirim formasi modeli: ta'minotchi + tovar qatorlari (miqdor, tan narx) + berildi.
 * Ko'rinish: Eski + Tovar = Jami, Berildi, Ostatka (core settle/settlePurchase).
 */
import { calculatePurchase, parseQtyMilli, parseUnitPriceText, settlePurchase, type AllowedUnit, type Settlement } from '@hisobchi/core';
import type { PurchaseLineInput, StockRow } from '../data/purchasing';

export interface PurchaseFormLine {
  productId: string;
  name: string;
  unit: AllowedUnit;
  qtyText: string;
  costText: string;
}

/** Tovarni qo'shish: tan narx oxirgi kirimdan oldindan to'ldiriladi (tahrirlanadi) */
export function addPurchaseLine(lines: readonly PurchaseFormLine[], p: StockRow): PurchaseFormLine[] {
  if (lines.some((l) => l.productId === p.productId)) return [...lines];
  return [...lines, { productId: p.productId, name: p.name, unit: p.unit as AllowedUnit, qtyText: '1', costText: p.costPrice === null ? '' : p.costPrice.toString() }];
}

export function updatePurchaseLine(lines: readonly PurchaseFormLine[], productId: string, patch: Partial<Pick<PurchaseFormLine, 'qtyText' | 'costText'>>): PurchaseFormLine[] {
  return lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l));
}

export function removePurchaseLine(lines: readonly PurchaseFormLine[], productId: string): PurchaseFormLine[] {
  return lines.filter((l) => l.productId !== productId);
}

export interface PurchaseFormEval {
  lines: PurchaseLineInput[];
  /** Qator bo'yicha xatolar (indeks -> matn) */
  lineErrors: Map<number, string>;
  goods: bigint;
  settlement: Settlement | null;
  /** Saqlashga to'sqinlik */
  blocker: string | null;
}

export function evaluatePurchase(
  formLines: readonly PurchaseFormLine[],
  opening: bigint,
  paidText: string,
): PurchaseFormEval {
  const lineErrors = new Map<number, string>();
  const lines: PurchaseLineInput[] = [];
  formLines.forEach((l, i) => {
    const q = parseQtyMilli(l.qtyText);
    const c = parseUnitPriceText(l.costText);
    if (!q.ok) lineErrors.set(i, q.message);
    else if (q.qtyMilli <= 0n) lineErrors.set(i, 'Miqdor nol bo\'lishi mumkin emas');
    else if (!c.ok) lineErrors.set(i, c.message);
    else lines.push({ productId: l.productId, qtyMilli: q.qtyMilli, unitCost: c.unitPrice });
  });
  const goods = calculatePurchase(lines).subtotal;
  let blocker: string | null = null;
  let paid = 0n;
  if (formLines.length === 0) blocker = 'Tovar tanlang';
  else if (lineErrors.size > 0) blocker = [...lineErrors.values()][0];
  if (!blocker && paidText.trim() !== '') {
    const p = parseUnitPriceText(paidText);
    if (!p.ok) blocker = p.message;
    else paid = p.unitPrice;
  }
  let settlement: Settlement | null = null;
  if (!blocker) {
    const s = settlePurchase(opening, lines, paid);
    if (s.ok) settlement = s.settlement;
    else blocker = s.message;
  }
  return { lines, lineErrors, goods, settlement, blocker };
}
