/**
 * @module profit
 * Foyda faqat kodda hisoblanadi: qator foydasi = qator summasi - tan narx summasi,
 * ikkalasi ham (qty_milli * narx + 500) / 1000 bilan alohida yaxlitlanadi (SQL bilan bir xil).
 * Tan narxi noma'lum (null) qator foydaga kirmaydi va alohida sanaladi — taxmin qilinmaydi.
 */
import { calculateLineTotal } from './calculation.js';

export interface ProfitLineInput {
  qtyMilli: bigint;
  unitPrice: bigint;
  /** Savdo paytidagi tan narx snapshot'i; null = noma'lum */
  unitCost: bigint | null;
}

export function lineProfit(l: ProfitLineInput): bigint | null {
  if (l.unitCost === null) return null;
  return calculateLineTotal(l.qtyMilli, l.unitPrice) - calculateLineTotal(l.qtyMilli, l.unitCost);
}

export interface SaleProfit {
  /** Tan narxi ma'lum qatorlar foydasi */
  profit: bigint;
  /** Tan narxi ma'lum qatorlar tushumi */
  revenue: bigint;
  /** Tan narxi noma'lum qatorlar indekslari (0 dan) */
  unknownCostLines: number[];
}

export function saleProfit(lines: readonly ProfitLineInput[]): SaleProfit {
  let profit = 0n;
  let revenue = 0n;
  const unknown: number[] = [];
  lines.forEach((l, i) => {
    const p = lineProfit(l);
    if (p === null) {
      unknown.push(i);
    } else {
      profit += p;
      revenue += calculateLineTotal(l.qtyMilli, l.unitPrice);
    }
  });
  return { profit, revenue, unknownCostLines: unknown };
}
