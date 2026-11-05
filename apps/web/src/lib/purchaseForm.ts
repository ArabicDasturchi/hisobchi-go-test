/**
 * Kirim formasining sof mantig'i (UI'siz, testlanadi). Hisob faqat @hisobchi/core'da (`calculatePurchase`,
 * `settlePurchase`, BigInt); PostgreSQL `post_purchase` ikkinchi mustaqil yo'l: jami mos kelmasa hech narsa saqlanmaydi.
 * Ostatka = Eski + Tovar − Berildi.
 */
import { calculatePurchase, normalizeProductName, settlePurchase } from '@hisobchi/core';
import type { PaymentMethod, Product } from './data/types';
import { parseMoneyInput, parseQtyInput } from './money';

export interface PurchaseDraftLine {
  key: string;
  /** Tanlangan tovar id'si (bo'lmasa nom bo'yicha katalogdan topiladi) */
  productId: string | null;
  productName: string;
  qty: string;
  unitCost: string;
}

export interface PostPurchaseLine {
  product_id: string;
  qty_milli: bigint;
  unit_cost: bigint;
}

export interface PurchaseLineErrors {
  product?: string;
  qty?: string;
  cost?: string;
}

export interface PurchasePlan {
  lines: PostPurchaseLine[];
  /** Tovar jami (core, qatorlar yig'indisi) */
  subtotal: bigint;
  /** Shu kirim bilan berilgan summa (0 = hammasi qarzga) */
  paid: bigint;
  method: PaymentMethod | null;
  /** Ta'minotchiga oldingi qarz (Eski) */
  balanceBefore: bigint;
  /** Ostatka = Eski + Tovar − Berildi */
  balanceAfter: bigint;
}

export type PurchasePlanResult =
  | { ok: true; plan: PurchasePlan }
  | { ok: false; message: string; lineErrors: Map<string, PurchaseLineErrors>; paidError?: string };

/** Aniq nom bo'yicha faol tovar (katta-kichik harf, apostrof turi va ortiqcha bo'shliq farq qilmaydi) */
export function findActiveProduct(products: readonly Product[], name: string): Product | undefined {
  const q = normalizeProductName(name);
  if (!q) return undefined;
  return products.find((p) => p.is_active && normalizeProductName(p.name) === q);
}

/** Tovar qidiruvi: nom boshidan mos kelganlar oldin, keyin ichidan */
export function searchCatalog(products: readonly Product[], query: string, limit = 8): Product[] {
  const q = normalizeProductName(query);
  const active = products.filter((p) => p.is_active);
  if (!q) return active.slice(0, limit);
  const starts: Product[] = [];
  const inside: Product[] = [];
  for (const p of active) {
    const n = normalizeProductName(p.name);
    if (n.startsWith(q)) starts.push(p);
    else if (n.includes(q)) inside.push(p);
  }
  return [...starts, ...inside].slice(0, limit);
}

export const isBlankPurchaseLine = (l: PurchaseDraftLine) => !l.productName.trim() && !l.qty.trim() && !l.unitCost.trim();

/** Qatorning tovari: tanlangan id yoki aniq nom bo'yicha faol tovar */
export function resolveProduct(products: readonly Product[], l: Pick<PurchaseDraftLine, 'productId' | 'productName'>): Product | undefined {
  if (l.productId) {
    const byId = products.find((p) => p.id === l.productId && p.is_active);
    if (byId && byId.name === l.productName) return byId;
  }
  return findActiveProduct(products, l.productName);
}

export function buildPurchasePlan(input: {
  lines: readonly PurchaseDraftLine[];
  products: readonly Product[];
  /** Hozirgi ostatka (ta'minotchiga qarz); yangi ta'minotchi uchun 0 */
  balanceBefore: bigint;
  paid: string;
  method: PaymentMethod;
}): PurchasePlanResult {
  const lineErrors = new Map<string, PurchaseLineErrors>();
  const out: PostPurchaseLine[] = [];
  for (const l of input.lines) {
    if (isBlankPurchaseLine(l)) continue;
    const errs: PurchaseLineErrors = {};
    const p = resolveProduct(input.products, l);
    if (!l.productName.trim()) errs.product = 'Tovarni tanlang';
    else if (!p) errs.product = "Katalogdan tanlang (yangi tovar avval «Mahsulotlar» da qo'shiladi)";
    const qty = parseQtyInput(l.qty);
    if (!qty.ok) errs.qty = qty.message;
    const cost = parseMoneyInput(l.unitCost, { allowZero: true });
    if (!cost.ok) errs.cost = cost.message;
    if (Object.keys(errs).length > 0 || !p || !qty.ok || !cost.ok) {
      lineErrors.set(l.key, errs);
      continue;
    }
    out.push({ product_id: p.id, qty_milli: qty.value, unit_cost: cost.value });
  }
  if (lineErrors.size > 0) return { ok: false, message: 'Qatorlardagi xatolarni tuzating.', lineErrors };
  if (out.length === 0) return { ok: false, message: "Kamida bitta tovar qo'shing.", lineErrors };
  if (out.length > 200) return { ok: false, message: "Bitta kirimda ko'pi bilan 200 qator.", lineErrors };

  const paidRaw = input.paid.trim();
  let paid = 0n;
  if (paidRaw !== '') {
    const p = parseMoneyInput(paidRaw, { allowZero: true });
    if (!p.ok) return { ok: false, message: p.message, lineErrors, paidError: p.message };
    paid = p.value;
  }

  const coreLines = out.map((l) => ({ qtyMilli: l.qty_milli, unitCost: l.unit_cost }));
  const check = settlePurchase(input.balanceBefore, coreLines, paid);
  if (!check.ok) {
    const msg = "Berilgan summa jami qarzdan (oldingi qarz + shu kirim) ko'p bo'lishi mumkin emas.";
    return { ok: false, message: msg, lineErrors, paidError: msg };
  }
  const subtotal = calculatePurchase(coreLines).subtotal;
  return {
    ok: true,
    plan: { lines: out, subtotal, paid, method: paid > 0n ? input.method : null, balanceBefore: input.balanceBefore, balanceAfter: check.settlement.balance },
  };
}

export interface PurchaseEffect {
  /** Omborga qo'shiladigan miqdor (bir tovar bir necha qatorda bo'lsa yig'iladi) */
  addedQtyMilli: bigint;
  /** Yangi tan narx: serverda oxirgi kirim qatori narxi (qatorlar tartibi bilan) */
  newCost: bigint;
}

/** Kirim saqlanganda ombor qoldig'i va tan narx qanday yangilanishi (server tartibi bilan bir xil) */
export function purchaseEffects(lines: readonly PostPurchaseLine[]): Map<string, PurchaseEffect> {
  const m = new Map<string, PurchaseEffect>();
  for (const l of lines) {
    const cur = m.get(l.product_id);
    m.set(l.product_id, { addedQtyMilli: (cur?.addedQtyMilli ?? 0n) + l.qty_milli, newCost: l.unit_cost });
  }
  return m;
}
