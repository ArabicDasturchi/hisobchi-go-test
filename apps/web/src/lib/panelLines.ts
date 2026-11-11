/**
 * Kirim qatorlari (UI'siz, testlanadi): tanlangan tovarlarni qatorga aylantirish. Savdodagi `applySelection` bilan
 * bir xil qoida: bor tovar qayta qo'shilmaydi (soni +1), bo'sh qator birinchi yangi tovar bilan to'ladi.
 */
import type { Product } from './data/types';
import { formatMoneyInput } from './money';
import { stepQty } from './productPicker';
import { sameName } from './productSearch';
import { isBlankPurchaseLine, type PurchaseDraftLine } from './purchaseForm';
import type { DraftLine } from './saleForm';

export const newPurchaseLine = (): PurchaseDraftLine => ({ key: crypto.randomUUID(), productId: null, productName: '', qty: '', unitCost: '' });

/** costOf: tovarning oxirgi kirim narxi (taklif sifatida); bo'lmasa bo'sh */
export function applyPurchaseSelection(
  lines: readonly PurchaseDraftLine[],
  selected: readonly Product[],
  costOf: (productId: string) => bigint | null | undefined = () => null,
  makeKey: () => string = () => crypto.randomUUID(),
): PurchaseDraftLine[] {
  let out = [...lines];
  const seen = new Set<string>();
  for (const p of selected) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const at = out.findIndex((l) => sameName(l.productName, p.name));
    if (at >= 0) {
      out = out.map((l, i) => (i === at ? { ...l, qty: stepQty(l.qty, 1000n) } : l));
      continue;
    }
    const cost = costOf(p.id);
    const fill = (l: PurchaseDraftLine): PurchaseDraftLine => ({ ...l, productId: p.id, productName: p.name, qty: '1', unitCost: cost == null ? '' : formatMoneyInput(cost.toString()) });
    const blankAt = out.findIndex(isBlankPurchaseLine);
    if (blankAt >= 0) out = out.map((l, i) => (i === blankAt ? fill(l) : l));
    else out.push(fill({ key: makeKey(), productId: null, productName: '', qty: '', unitCost: '' }));
  }
  return out;
}

/** Katalogda yo'q nom: yangi tovar qatori (soni 1, narxi bo'sh) */
export function addNewPurchaseLine(lines: readonly PurchaseDraftLine[], name: string, makeKey: () => string = () => crypto.randomUUID()): PurchaseDraftLine[] {
  const n = name.trim();
  if (!n) return [...lines];
  const at = lines.findIndex((l) => sameName(l.productName, n));
  if (at >= 0) return lines.map((l, i) => (i === at ? { ...l, qty: stepQty(l.qty, 1000n) } : l));
  const blankAt = lines.findIndex(isBlankPurchaseLine);
  const filled = (l: PurchaseDraftLine): PurchaseDraftLine => ({ ...l, productId: null, productName: n, qty: '1' });
  if (blankAt >= 0) return lines.map((l, i) => (i === blankAt ? filled(l) : l));
  return [...lines, filled({ key: makeKey(), productId: null, productName: '', qty: '', unitCost: '' })];
}

/** SuggestionPanel "Ro'yxatda: N ta" belgisi uchun kirim qatorlarini savdo qatori shakliga o'tkazish */
export function purchaseAsDraft(lines: readonly PurchaseDraftLine[]): DraftLine[] {
  return lines.map((l) => ({ key: l.key, productName: l.productName, qty: l.qty, unit: 'dona', price: l.unitCost }));
}

/** Sotuvdagi yangi tovar qatori (katalogda yo'q nom): soni 1, narx bo'sh (sariq) */
export function addNewSaleLine(lines: readonly DraftLine[], name: string, makeKey: () => string = () => crypto.randomUUID()): DraftLine[] {
  const n = name.trim();
  if (!n) return [...lines];
  const at = lines.findIndex((l) => sameName(l.productName, n));
  if (at >= 0) return lines.map((l, i) => (i === at ? { ...l, qty: stepQty(l.qty, 1000n) } : l));
  const blankAt = lines.findIndex((l) => !l.productName.trim() && !l.qty.trim() && !l.price.trim());
  // Erkin matnli yangi tovar: aniq tanlov yo'q (productId null), server nom + birlik bo'yicha bog'laydi yoki tovarsiz saqlaydi
  const filled = (l: DraftLine): DraftLine => ({ ...l, productId: null, productName: n, qty: '1' });
  if (blankAt >= 0) return lines.map((l, i) => (i === blankAt ? filled(l) : l));
  return [...lines, filled({ key: makeKey(), productId: null, productName: '', qty: '', unit: 'dona', price: '' })];
}
