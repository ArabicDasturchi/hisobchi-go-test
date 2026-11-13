/**
 * Kirim formasining sof mantig'i (UI'siz, testlanadi). Hisob faqat @hisobchi/core'da (`calculatePurchase`,
 * `settlePurchase`, BigInt); PostgreSQL `post_purchase` ikkinchi mustaqil yo'l: jami mos kelmasa hech narsa saqlanmaydi.
 * Ostatka = Eski + Tovar − Berildi.
 */
import { ALLOWED_UNITS, calculatePurchase, normalizeProductName, settlePurchase } from '@hisobchi/core';
import type { PaymentMethod, Product, Unit } from './data/types';
import { parseMoneyInput, parseQtyInput } from './money';
import type { LineReview, PastedOrigin } from './pasteList';
import { firstError, productNameSchema } from './validation';

export interface PurchaseDraftLine {
  key: string;
  /** Tanlangan tovar id'si (bo'lmasa nom bo'yicha katalogdan topiladi) */
  productId: string | null;
  productName: string;
  /**
   * O'lchov birligi. Katalog tovarida tovarning birligi (faqat ko'rsatiladi; rejada doim tovarnikidan olinadi).
   * Katalogda yo'q yangi nomda savdogar tanlaydi: yangi tovar shu birlik bilan yaratiladi. null: tanlanmagan.
   */
  unit: Unit | null;
  qty: string;
  unitCost: string;
  /** F1: ro'yxatdan joylangan qator (asl matn) */
  pasted?: PastedOrigin;
  /** F1: hal qilinmagan savollar. Bo'sh emas — sariq, kirim tasdiqlanmaydi */
  reviews?: LineReview[];
}

export interface PostPurchaseLine {
  product_id: string;
  qty_milli: bigint;
  unit_cost: bigint;
}

export interface PurchaseLineErrors {
  product?: string;
  unit?: string;
  qty?: string;
  cost?: string;
}

/** Rejadagi hali yaratilmagan yangi tovar (katalogda yo'q nom). Faqat reja to'liq OK bo'lsa yaratiladi */
export interface PendingNewProduct {
  /** Nom (katalog normalizatsiyasi) + birlik: bitta kirimda bir xil yangi tovar bir marta yaratiladi */
  key: string;
  name: string;
  unit: Unit;
}

export interface PurchasePlan {
  /**
   * Server qatorlari. Yangi tovar qatorida `product_id` vaqtinchalik (`pendingProductId(key)`): yuborishdan oldin
   * `bindNewProducts` bilan yaratilgan tovar id siga almashtiriladi.
   */
  lines: PostPurchaseLine[];
  /** Yaratilishi kerak bo'lgan yangi tovarlar (faqat `allowNew` bilan; aks holda doim bo'sh) */
  newProducts: PendingNewProduct[];
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

const PENDING_PREFIX = 'yangi:';
/** Yangi (hali yaratilmagan) tovar uchun rejadagi vaqtinchalik id */
export const pendingProductId = (key: string) => PENDING_PREFIX + key;
/** Yangi tovar kaliti: nom (katalog normalizatsiyasi) + birlik */
export const newProductKey = (name: string, unit: Unit) => `${normalizeProductName(name)}|${unit}`;
const isUnit = (v: unknown): v is Unit => typeof v === 'string' && (ALLOWED_UNITS as readonly string[]).includes(v);

/**
 * Rejadagi vaqtinchalik id larni yaratilgan tovarlar id siga almashtiradi (kalit → id). Biror yangi tovar
 * yaratilmagan bo'lsa xato: yarim kirim serverga ketmasin.
 */
export function bindNewProducts(lines: readonly PostPurchaseLine[], createdIds: ReadonlyMap<string, string>): PostPurchaseLine[] {
  return lines.map((l) => {
    if (!l.product_id.startsWith(PENDING_PREFIX)) return l;
    const id = createdIds.get(l.product_id.slice(PENDING_PREFIX.length));
    if (!id) throw new Error(`Yangi tovar yaratilmagan: ${l.product_id}`);
    return { ...l, product_id: id };
  });
}

/** Qatorda ko'rsatiladigan birlik: katalog tovarida tovarniki, yangi nomda tanlangani */
export function lineUnit(products: readonly Product[], l: Pick<PurchaseDraftLine, 'productId' | 'productName' | 'unit'>): Unit | null {
  return resolveProduct(products, l)?.unit ?? l.unit;
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
  /**
   * true: katalogda yo'q nom xato emas, "kutilayotgan yangi tovar" sifatida to'liq tekshiriladi (nom, birlik, miqdor,
   * tan narx, to'lov) va `plan.newProducts` ga tushadi. Yaratish chaqiruvchida, faqat reja OK bo'lgandan keyin.
   */
  allowNew?: boolean;
}): PurchasePlanResult {
  const lineErrors = new Map<string, PurchaseLineErrors>();
  const out: PostPurchaseLine[] = [];
  const pending = new Map<string, PendingNewProduct>();
  /** Yangi nom (normalizatsiya) → shu kirimda tanlangan birlik */
  const newUnits = new Map<string, Unit>();
  for (const l of input.lines) {
    if (isBlankPurchaseLine(l)) continue;
    const errs: PurchaseLineErrors = {};
    const name = l.productName.trim();
    const p = resolveProduct(input.products, l);
    let fresh: PendingNewProduct | null = null;
    const review = l.reviews?.[0];
    if (review) errs.product = review.message;
    else if (!name) errs.product = 'Tovarni tanlang';
    else if (p) {
      // Qo'lda yozilgan nom katalogdagi faol tovar bilan bir xil: birlik ham mos bo'lsa o'sha tovar, aks holda xato
      // (takror tovar yaratilmaydi, kg tovar dona bo'lib qolmaydi). Katalogdan tanlangan qatorda birlik tovarniki.
      if (l.productId === null && l.unit !== null && l.unit !== p.unit) errs.unit = `«${p.name}» katalogda ${p.unit} birlikda bor`;
    } else if (!input.allowNew) errs.product = "Katalogdan tanlang (yangi tovar avval «Mahsulotlar» da qo'shiladi)";
    else {
      const nameErr = firstError(productNameSchema.safeParse(name));
      if (nameErr) errs.product = nameErr;
      const seenUnit = newUnits.get(normalizeProductName(name));
      if (!isUnit(l.unit)) errs.unit = 'Yangi tovar uchun birlikni tanlang';
      // Bir nom bitta kirimda ikki xil birlikda: ikkita bir xil nomli tovar yaratilmasin
      else if (seenUnit && seenUnit !== l.unit) errs.unit = `«${name}» bu kirimda ${seenUnit} birlikda ham yozilgan`;
      else if (!nameErr) {
        newUnits.set(normalizeProductName(name), l.unit);
        fresh = { key: newProductKey(name, l.unit), name, unit: l.unit };
      }
    }
    const qty = parseQtyInput(l.qty);
    if (!qty.ok) errs.qty = qty.message;
    const cost = parseMoneyInput(l.unitCost, { allowZero: true });
    if (!cost.ok) errs.cost = cost.message;
    const productId = p?.id ?? (fresh ? pendingProductId(fresh.key) : null);
    if (Object.keys(errs).length > 0 || !productId || !qty.ok || !cost.ok) {
      lineErrors.set(l.key, errs);
      continue;
    }
    if (fresh && !pending.has(fresh.key)) pending.set(fresh.key, fresh);
    out.push({ product_id: productId, qty_milli: qty.value, unit_cost: cost.value });
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
    plan: { lines: out, newProducts: [...pending.values()], subtotal, paid, method: paid > 0n ? input.method : null, balanceBefore: input.balanceBefore, balanceAfter: check.settlement.balance },
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
