/**
 * Katalog/ombor qatorining ko'rinishi (ixcham qator: bir ekranda kamida 8 ta).
 * Pul va foyda hisobi faqat @hisobchi/core orqali; AI/ekran hisoblamaydi.
 */
import { lineProfit, stockLevel, type StockLevel } from '@hisobchi/core';
import type { StockRow } from '../data/purchasing';
import { formatQty, formatSom, groupDigits, UNIT_LABELS } from '../lib/format';

export interface CatalogRowView {
  id: string;
  name: string;
  /** "12 kg" yoki "-2 kg" */
  stockText: string;
  stockLevel: StockLevel;
  /** Sotuv narxi, masalan "13 000" */
  priceText: string;
  /** Tan narx (oxirgi kirim) yoki null */
  costText: string | null;
  /** Birlik foydasi: "+2 000" / "-500"; tan narx noma'lum bo'lsa null (taxmin qilinmaydi) */
  marginText: string | null;
  isActive: boolean;
}

export function catalogRow(r: StockRow): CatalogRowView {
  const unit = UNIT_LABELS[r.unit] ?? r.unit;
  const margin = r.costPrice === null ? null : lineProfit({ qtyMilli: 1000n, unitPrice: r.salePrice, unitCost: r.costPrice });
  return {
    id: r.productId,
    name: r.name,
    stockText: `${formatQty(r.qtyMilli)} ${unit}`,
    stockLevel: stockLevel(r.qtyMilli),
    priceText: groupDigits(r.salePrice),
    costText: r.costPrice === null ? null : groupDigits(r.costPrice),
    marginText: margin === null ? null : `${margin >= 0n ? '+' : ''}${groupDigits(margin)}`,
    isActive: r.isActive,
  };
}

/** Qatorning qisqa o'qiladigan tavsifi (ekran o'quvchi uchun) */
export function catalogRowLabel(r: StockRow): string {
  const v = catalogRow(r);
  return `${v.name}, qoldiq ${v.stockText}, narx ${formatSom(r.salePrice)}`;
}
