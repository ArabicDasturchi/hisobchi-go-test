/**
 * Tovar tanlash mantig'i (UI'siz, testlanadi): qidiruv, "ko'p sotilgan", tanlanganda qatorni to'ldirish, miqdor qadami.
 * Hisob yo'q: "ko'p sotilgan" tartibi @hisobchi/core `topSellingProducts` dan, summa core formulasidan.
 */
import { normalizeProductName, topSellingProducts } from '@hisobchi/core';
import type { Product, SaleDoc, SaleLineCost } from './data/types';
import { formatMoneyInput, parseQtyInput } from './money';
import type { DraftLine } from './saleForm';

/** Nomi bo'yicha qidiruv: avval nom boshidan mos kelganlar, keyin ichidan; katta-kichik harf va apostrof farqi hisobga olinmaydi */
export function searchProducts(products: readonly Product[], query: string, limit = 8): Product[] {
  const q = normalizeProductName(query);
  const active = products.filter((p) => p.is_active);
  if (!q) return active.slice(0, limit);
  const starts: Product[] = [];
  const inside: Product[] = [];
  for (const p of active) {
    const n = normalizeProductName(p.name);
    if (n.startsWith(q)) starts.push(p);
    else if (n.split(' ').some((w) => w.startsWith(q)) || n.includes(q)) inside.push(p);
  }
  return [...starts, ...inside].slice(0, limit);
}

/** Katalogda shu nomli (aynan) faol tovar bormi */
export function findProductByName(products: readonly Product[], name: string): Product | undefined {
  const q = normalizeProductName(name);
  if (!q) return undefined;
  return products.find((p) => p.is_active && normalizeProductName(p.name) === q);
}

/** Oxirgi 30 kun (qatorlar yuklangan oyna) savdolaridan eng ko'p sotilgan faol tovarlar */
export function topProducts(products: readonly Product[], sales: readonly SaleDoc[], lines: readonly SaleLineCost[], limit = 8): Product[] {
  const posted = new Set(sales.filter((s) => s.status === 'posted').map((s) => s.id));
  const top = topSellingProducts(
    lines.filter((l) => posted.has(l.document_id)).map((l) => ({ productId: l.product_id, qtyMilli: l.qty_milli })),
    limit * 2,
  );
  const byId = new Map(products.filter((p) => p.is_active).map((p) => [p.id, p]));
  return top.flatMap((t) => byId.get(t.productId) ?? []).slice(0, limit);
}

/** Katalogdagi tovar tanlangan, lekin sotuv narxi yo'q: narx qo'lda kiritilishi kerak (maydon ajratib ko'rsatiladi) */
export function lacksSalePrice(products: readonly Product[], productName: string): boolean {
  const p = findProductByName(products, productName);
  return p !== undefined && p.last_price === null;
}

/** Tovar tanlanganda: nom, birlik va sotish narxi avtomatik to'ladi (narxi yo'q tovarda narx o'zgarmaydi) */
export function applyProduct(line: DraftLine, p: Product): DraftLine {
  return { ...line, productName: p.name, unit: p.unit, price: p.last_price !== null ? formatMoneyInput(p.last_price.toString()) : line.price };
}

/** qty_milli → kiritish maydoni matni: 5000n → "5", 1500n → "1,5" */
export function qtyToInput(qtyMilli: bigint): string {
  const whole = qtyMilli / 1000n;
  const frac = qtyMilli % 1000n;
  if (frac === 0n) return whole.toString();
  return `${whole},${frac.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

/**
 * Miqdorga qadam qo'shadi/ayiradi. Maydon bo'sh yoki noto'g'ri bo'lsa 0 deb olinadi.
 * Natija 0 yoki manfiy bo'lsa maydon bo'shatiladi (miqdor 0 dan katta bo'lishi shart).
 */
export function stepQty(raw: string, deltaMilli: bigint): string {
  const cur = parseQtyInput(raw);
  const next = (cur.ok ? cur.value : 0n) + deltaMilli;
  return next <= 0n ? '' : qtyToInput(next);
}
