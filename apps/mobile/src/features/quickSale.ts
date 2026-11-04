/**
 * Tezkor savdo modeli: katalogdan tovar tanlash -> to'lov usuli -> "Sotish".
 * Bir martalik mijoz (standart) 2 ta bosish: tovarga bosish, "Sotish".
 * Hisob faqat core: calculateDocument (qatorlar), checkSalePayment (qoida), saleProfit (foyda), stockWarning.
 */
import { calculateDocument, checkSalePayment, parseQtyMilli, saleProfit, type AllowedUnit, type CustomerKind, type SaleProfit } from '@hisobchi/core';
import type { SaleLineInput } from '../data/ledger';
import type { StockRow } from '../data/purchasing';

export interface QuickLine {
  productId: string;
  name: string;
  unit: AllowedUnit;
  qtyMilli: bigint;
  unitPrice: bigint;
  /** Savdo paytidagi tan narx snapshot'i (oxirgi kirim); null = noma'lum */
  unitCost: bigint | null;
  /** Savdodan oldingi ombor qoldig'i (manfiy bo'lishi mumkin) */
  stockMilli: bigint;
}

export const ONE = 1000n;

export function addProduct(lines: readonly QuickLine[], p: StockRow): QuickLine[] {
  const i = lines.findIndex((l) => l.productId === p.productId);
  if (i >= 0) return lines.map((l, k) => (k === i ? { ...l, qtyMilli: l.qtyMilli + ONE } : l));
  return [
    ...lines,
    {
      productId: p.productId,
      name: p.name,
      unit: p.unit as AllowedUnit,
      qtyMilli: ONE,
      unitPrice: p.salePrice,
      unitCost: p.costPrice,
      stockMilli: p.qtyMilli,
    },
  ];
}

/** Miqdorni o'zgartirish; 0 yoki kamroq bo'lsa qator olib tashlanadi */
export function setQty(lines: readonly QuickLine[], productId: string, qtyMilli: bigint): QuickLine[] {
  if (qtyMilli <= 0n) return lines.filter((l) => l.productId !== productId);
  return lines.map((l) => (l.productId === productId ? { ...l, qtyMilli } : l));
}

export function stepQty(lines: readonly QuickLine[], productId: string, deltaMilli: bigint): QuickLine[] {
  const l = lines.find((x) => x.productId === productId);
  return l ? setQty(lines, productId, l.qtyMilli + deltaMilli) : [...lines];
}

/** Matn bilan miqdor kiritish ("2", "1,5"); noto'g'ri bo'lsa xato matni */
export function setQtyText(lines: readonly QuickLine[], productId: string, text: string): { lines: QuickLine[]; error: string | null } {
  const r = parseQtyMilli(text);
  if (!r.ok) return { lines: [...lines], error: r.message };
  return { lines: setQty(lines, productId, r.qtyMilli), error: null };
}

export interface QuickSaleEval {
  total: bigint;
  lineTotals: bigint[];
  /** Sotishga to'sqinlik (qizil): bo'sh savdo, qoida buzilishi */
  blocker: string | null;
  /** Sariq ogohlantirishlar (bloklamaydi): manfiy qoldiq, tan narx noma'lum */
  warnings: string[];
  profit: SaleProfit;
  /** Savdodan keyin qarz (doimiy mijoz uchun) */
  debt: bigint;
  /** Haqiqiy to'lov summasi (bir martalik: jami) */
  paid: bigint;
}

/**
 * paid: null — standart. Bir martalik mijoz: jami to'liq to'lanadi. Doimiy mijoz: null = hammasi qarzga.
 */
export function evaluateQuickSale(lines: readonly QuickLine[], kind: CustomerKind, paid: bigint | null): QuickSaleEval {
  const doc = calculateDocument(lines.map((l) => ({ qtyMilli: l.qtyMilli, unitPrice: l.unitPrice })));
  const total = doc.subtotal;
  const effectivePaid = kind === 'one_time' ? total : (paid ?? 0n);
  const warnings: string[] = [];
  for (const l of lines) {
    const after = l.stockMilli - l.qtyMilli;
    if (after < 0n) warnings.push(`${l.name}: ombor qoldig'i manfiy bo'ladi`);
    if (l.unitCost === null) warnings.push(`${l.name}: tan narx noma'lum (foydaga kirmaydi)`);
  }
  let blocker: string | null = null;
  if (lines.length === 0) blocker = 'Tovar tanlang';
  else {
    const rule = checkSalePayment({ kind, total, paid: effectivePaid });
    if (!rule.ok) blocker = rule.message;
  }
  const debt = blocker ? 0n : total - effectivePaid;
  return {
    total,
    lineTotals: doc.lines.map((l) => l.lineTotal),
    blocker,
    warnings,
    profit: saleProfit(lines.map((l) => ({ qtyMilli: l.qtyMilli, unitPrice: l.unitPrice, unitCost: l.unitCost }))),
    debt,
    paid: effectivePaid,
  };
}

export function toSaleLines(lines: readonly QuickLine[]): SaleLineInput[] {
  return lines.map((l) => ({
    productName: l.name,
    qtyMilli: l.qtyMilli,
    unit: l.unit,
    unitPrice: l.unitPrice,
    rawText: null,
    productId: l.productId,
    unitCost: l.unitCost,
  }));
}
