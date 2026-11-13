/**
 * Narx qoidalari (sof funksiyalar, BigInt): optom narx tanlash va ustamadan sotuv narxi taklifi.
 * SQL ikkinchi yo'li: supabase/migrations/014_ombor_narxlar.sql (`resolve_unit_price`, `suggest_sale_price`).
 * Ikkalasi bir xil kirishlarda bir xil natija beradi (core testi va supabase/tests/95_ombor_narxlar.test.sql).
 * AI bu yerda hech narsa hisoblamaydi.
 */

export interface UnitPriceInput {
  /** Sotuv (dona) narxi, so'm. Tovarda narx yo'q bo'lsa null */
  salePrice: bigint | null;
  /** Optom narx, so'm; yo'q bo'lsa null */
  wholesalePrice: bigint | null;
  /** Optom boshlanadigan miqdor (1000 = 1 birlik); yo'q bo'lsa null */
  wholesaleMinQtyMilli: bigint | null;
  /** Savdo qatoridagi miqdor (1000 = 1 birlik) */
  qtyMilli: bigint;
}

/**
 * Qator miqdoriga qarab birlik narxi: `qty >= wholesaleMinQtyMilli` bo'lsa optom narx (chegarada ham), aks holda sotuv narxi.
 * Optom narx yoki chegara yo'q (null) bo'lsa, yoki chegara 0 dan kichik/teng bo'lsa — har doim sotuv narxi.
 * Foydalanuvchi qo'lda yozgan narxni bu funksiya o'zgartirmaydi: chaqiruvchi uni faqat narx qo'lda yozilmagan bo'lsa ishlatadi.
 */
export function resolveUnitPrice(i: UnitPriceInput): bigint | null {
  const { wholesalePrice: wp, wholesaleMinQtyMilli: min } = i;
  if (wp !== null && min !== null && min > 0n && i.qtyMilli >= min) return wp;
  return i.salePrice;
}

/** Optom narx ishlatilyaptimi (UI belgisi "Optom narx" uchun): resolveUnitPrice optom narxni tanlagan bo'lsa true */
export function isWholesaleApplied(i: UnitPriceInput): boolean {
  return i.wholesalePrice !== null && i.wholesaleMinQtyMilli !== null && i.wholesaleMinQtyMilli > 0n && i.qtyMilli >= i.wholesaleMinQtyMilli;
}

/** Ustama foizi: butun son 0..1000 */
export const MAX_MARKUP_PERCENT = 1000;

export const isValidMarkupPercent = (pct: number): boolean => Number.isInteger(pct) && pct >= 0 && pct <= MAX_MARKUP_PERCENT;

/**
 * Tan narxdan sotuv narxi taklifi: round(cost × (100 + pct) / 100), so'mga yarimidan yuqoriga yaxlitlanadi (half-up).
 * Butun arifmetika: (cost × (100 + pct) + 50) / 100. Manfiy tan narx yoki noto'g'ri foiz uchun null.
 * Bu faqat TAKLIF: qo'lda kiritilgan sotuv narxini jimgina o'zgartirish uchun ishlatilmaydi.
 */
export function suggestSalePrice(cost: bigint, markupPct: number): bigint | null {
  if (cost < 0n || !isValidMarkupPercent(markupPct)) return null;
  return (cost * (100n + BigInt(markupPct)) + 50n) / 100n;
}
