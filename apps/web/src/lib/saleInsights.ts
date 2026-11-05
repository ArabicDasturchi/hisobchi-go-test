/**
 * Savdo ichidagi foyda va ogohlantirishlar (UI'siz, testlanadi). Hisob core'da:
 * `lineProfit`/`saleProfit` (foyda), `soldBelowCost`, `stockCheck`. Bu fayl faqat qatorlarni bog'laydi.
 * Ogohlantirishlar saqlashni to'smaydi.
 */
import { lineProfit, saleProfit, soldBelowCost, stockCheck, type StockCheck } from '@hisobchi/core';
import type { Product } from './data/types';
import { parseMoneyInput, parseQtyInput } from './money';
import { findProductByName } from './productPicker';
import { isBlank, type DraftLine } from './saleForm';

export interface LineInsight {
  /** Qator foydasi; tan narx noma'lum bo'lsa null */
  profit: bigint | null;
  costKnown: boolean;
  unitCost: bigint | null;
  belowCost: boolean;
  /** Ombor holati; tovar katalogda yo'q yoki qoldig'i kuzatilmasa null */
  stock: StockCheck | null;
  stockMilli: bigint | null;
}

export interface SaleInsights {
  perLine: Map<string, LineInsight>;
  /** Tan narxi ma'lum qatorlar foydasi */
  profit: bigint;
  /** Tan narxi noma'lum (foydaga kirmagan) qatorlar soni */
  unknownCostLines: number;
}

/** Faqat to'g'ri to'ldirilgan qatorlar tahlil qilinadi (xatoli qator ogohlantirish bermaydi) */
export function saleInsights(lines: readonly DraftLine[], products: readonly Product[], stock: ReadonlyMap<string, bigint> | null): SaleInsights {
  const perLine = new Map<string, LineInsight>();
  const valid: { key: string; product: Product | undefined; qty: bigint; price: bigint }[] = [];
  for (const l of lines) {
    if (isBlank(l)) continue;
    const qty = parseQtyInput(l.qty);
    const price = parseMoneyInput(l.price, { allowZero: true });
    if (!qty.ok || !price.ok || !l.productName.trim()) continue;
    valid.push({ key: l.key, product: findProductByName(products, l.productName), qty: qty.value, price: price.value });
  }

  // Bir tovar bir necha qatorda bo'lsa qoldiq birgalikda tekshiriladi
  const qtyByProduct = new Map<string, bigint>();
  for (const v of valid) if (v.product) qtyByProduct.set(v.product.id, (qtyByProduct.get(v.product.id) ?? 0n) + v.qty);

  for (const v of valid) {
    const unitCost = v.product?.cost_price ?? null;
    const have = v.product && stock ? stock.get(v.product.id) : undefined;
    perLine.set(v.key, {
      profit: lineProfit({ qtyMilli: v.qty, unitPrice: v.price, unitCost }),
      costKnown: unitCost !== null,
      unitCost,
      belowCost: soldBelowCost(v.price, unitCost),
      stock: v.product && have !== undefined ? stockCheck(have, qtyByProduct.get(v.product.id) ?? v.qty) : null,
      stockMilli: have ?? null,
    });
  }

  const sp = saleProfit(valid.map((v) => ({ qtyMilli: v.qty, unitPrice: v.price, unitCost: v.product?.cost_price ?? null })));
  return { perLine, profit: sp.profit, unknownCostLines: sp.unknownCostLines.length };
}
