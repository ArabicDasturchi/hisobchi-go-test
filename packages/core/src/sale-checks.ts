/**
 * @module sale-checks
 * Savdo paytidagi ogohlantirishlar va "ko'p sotilgan" reytingi. Sof funksiyalar, faqat BigInt.
 * Ogohlantirishlar saqlashni to'smaydi: qaror savdogarniki (ombor yozuvi kech kiritilgan bo'lishi mumkin).
 */

/** Sotuvdan keyin shuncha (1 = 1000) yoki kam qolsa "kam" deb ogohlantiriladi */
export const LOW_STOCK_MILLI = 5_000n;

export type StockCheck = 'ok' | 'low' | 'negative';

/** Sotuvdan keyingi qoldiq: manfiy → 'negative', 0..LOW_STOCK_MILLI → 'low', aks holda 'ok' */
export function stockCheck(stockMilli: bigint, saleQtyMilli: bigint): StockCheck {
  const left = stockMilli - saleQtyMilli;
  if (left < 0n) return 'negative';
  if (left <= LOW_STOCK_MILLI) return 'low';
  return 'ok';
}

/** Sotish narxi tan narxdan past (zarar). Tan narx noma'lum (null) bo'lsa taxmin qilinmaydi: false */
export function soldBelowCost(unitPrice: bigint, unitCost: bigint | null): boolean {
  return unitCost !== null && unitPrice < unitCost;
}

export interface TopSellingLine {
  /** Tovarga bog'lanmagan qator (null) reytingga kirmaydi */
  productId: string | null;
  qtyMilli: bigint;
}

export interface TopSelling {
  productId: string;
  /** Nechta savdo qatorida uchragan */
  count: number;
  qtyMilli: bigint;
}

/**
 * Eng ko'p sotilgan tovarlar: avval savdo qatorlari soni, teng bo'lsa jami miqdor, keyin id (barqaror tartib).
 * Turli birliklar (kg, litr) aralash bo'lgani uchun asosiy mezon miqdor emas, takrorlanish.
 */
export function topSellingProducts(lines: readonly TopSellingLine[], limit: number): TopSelling[] {
  const map = new Map<string, TopSelling>();
  for (const l of lines) {
    if (!l.productId) continue;
    const cur = map.get(l.productId) ?? { productId: l.productId, count: 0, qtyMilli: 0n };
    cur.count += 1;
    cur.qtyMilli += l.qtyMilli;
    map.set(l.productId, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || (a.qtyMilli === b.qtyMilli ? 0 : a.qtyMilli > b.qtyMilli ? -1 : 1) || (a.productId < b.productId ? -1 : 1))
    .slice(0, Math.max(0, limit));
}
