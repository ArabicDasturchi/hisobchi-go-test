/**
 * Savat qatorlari: web ish holati (DraftLine / PurchaseDraftLine) ↔ saqlanadigan JSON (UI'siz, testlanadi).
 * Saqlangan ma'lumot server yoki localStorage dan keladi, shuning uchun o'qishda har maydon tekshiriladi: noto'g'ri
 * element tashlanadi (savat ochilmay qolmasin), hisob yo'q (soni/narx matn holida, odatdagi tekshiruvdan o'tadi).
 */
import { ALLOWED_UNITS } from '@hisobchi/core';
import type { Unit } from './data/types';
import type { LineReview, PastedOrigin, ReviewKind } from './pasteList';
import type { PurchaseDraftLine } from './purchaseForm';
import { isBlank, type DraftLine } from './saleForm';
import { isBlankPurchaseLine } from './purchaseForm';

const isUnit = (v: unknown): v is Unit => typeof v === 'string' && (ALLOWED_UNITS as readonly string[]).includes(v);
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const REVIEW_KINDS: readonly ReviewKind[] = ['xato', 'choose', 'new', 'check'];
const FIELDS = ['name', 'qty', 'price', 'unit'] as const;

function parseReviews(v: unknown): LineReview[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LineReview[] = [];
  for (const r of v.slice(0, 10)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const kind = o.kind as ReviewKind;
    const message = str(o.message, 500);
    if (!REVIEW_KINDS.includes(kind) || message === null) continue;
    const review: LineReview = { kind, message };
    if (Array.isArray(o.candidates)) review.candidates = o.candidates.filter((c): c is string => typeof c === 'string').slice(0, 10);
    if (o.allowNew === true) review.allowNew = true;
    if (typeof o.field === 'string' && (FIELDS as readonly string[]).includes(o.field)) review.field = o.field as LineReview['field'];
    out.push(review);
  }
  return out;
}

function parsePasted(v: unknown): PastedOrigin | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const raw = str(o.raw, 500);
  return typeof o.lineNo === 'number' && Number.isInteger(o.lineNo) && raw !== null ? { lineNo: o.lineNo, raw } : undefined;
}

const newKey = () => crypto.randomUUID();

// ---------- Savdo ----------

export function serializeSaleLines(lines: readonly DraftLine[]): Record<string, unknown>[] {
  return lines
    .filter((l) => !isBlank(l))
    .map((l) => ({
      key: l.key,
      productName: l.productName,
      productId: l.productId ?? null,
      qty: l.qty,
      unit: l.unit,
      price: l.price,
      ...(l.pasted ? { pasted: l.pasted } : {}),
      ...(l.reviews && l.reviews.length > 0 ? { reviews: l.reviews } : {}),
    }));
}

export function parseSaleLines(raw: unknown, makeKey: () => string = newKey): DraftLine[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftLine[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const productName = str(o.productName);
    const qty = str(o.qty, 30);
    const price = str(o.price, 30);
    if (productName === null || qty === null || price === null || !isUnit(o.unit)) continue;
    let key = str(o.key, 100) ?? makeKey();
    if (seen.has(key)) key = makeKey();
    seen.add(key);
    const line: DraftLine = { key, productName, productId: typeof o.productId === 'string' ? o.productId : null, qty, unit: o.unit, price };
    const pasted = parsePasted(o.pasted);
    if (pasted) line.pasted = pasted;
    const reviews = parseReviews(o.reviews);
    if (reviews && reviews.length > 0) line.reviews = reviews;
    out.push(line);
  }
  return out;
}

// ---------- Kirim ----------

export function serializePurchaseLines(lines: readonly PurchaseDraftLine[]): Record<string, unknown>[] {
  return lines
    .filter((l) => !isBlankPurchaseLine(l))
    .map((l) => ({
      key: l.key,
      productName: l.productName,
      productId: l.productId,
      unit: l.unit,
      qty: l.qty,
      unitCost: l.unitCost,
      ...(l.pasted ? { pasted: l.pasted } : {}),
      ...(l.reviews && l.reviews.length > 0 ? { reviews: l.reviews } : {}),
    }));
}

export function parsePurchaseLines(raw: unknown, makeKey: () => string = newKey): PurchaseDraftLine[] {
  if (!Array.isArray(raw)) return [];
  const out: PurchaseDraftLine[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const productName = str(o.productName);
    const qty = str(o.qty, 30);
    const unitCost = str(o.unitCost, 30);
    if (productName === null || qty === null || unitCost === null) continue;
    if (o.unit !== null && o.unit !== undefined && !isUnit(o.unit)) continue;
    let key = str(o.key, 100) ?? makeKey();
    if (seen.has(key)) key = makeKey();
    seen.add(key);
    const line: PurchaseDraftLine = { key, productId: typeof o.productId === 'string' ? o.productId : null, productName, unit: isUnit(o.unit) ? o.unit : null, qty, unitCost };
    const pasted = parsePasted(o.pasted);
    if (pasted) line.pasted = pasted;
    const reviews = parseReviews(o.reviews);
    if (reviews && reviews.length > 0) line.reviews = reviews;
    out.push(line);
  }
  return out;
}

// ---------- B3: AI qoralamasi → savat qatorlari ----------

/** Qoralama qatorlari (server tekshirgan son/narx) savat qatoriga: soni va narx matn holida, hisob yo'q */
export function draftSaleToBasketLines(lines: readonly { product_name: string; qty_milli: bigint; unit: string; unit_price: bigint }[], makeKey: () => string = newKey): DraftLine[] {
  return lines.map((l) => ({
    key: makeKey(),
    productId: null,
    productName: l.product_name,
    qty: qtyText(l.qty_milli),
    unit: isUnit(l.unit) ? l.unit : 'dona',
    price: groupText(l.unit_price),
  }));
}

export function draftPurchaseToBasketLines(lines: readonly { product_id: string; product_name: string; unit: string; qty_milli: bigint; unit_cost: bigint }[], makeKey: () => string = newKey): PurchaseDraftLine[] {
  return lines.map((l) => ({
    key: makeKey(),
    productId: l.product_id,
    productName: l.product_name,
    unit: isUnit(l.unit) ? l.unit : null,
    qty: qtyText(l.qty_milli),
    unitCost: groupText(l.unit_cost),
  }));
}

/** 12500n → "12,5" (kiritish maydoni shakli) */
function qtyText(qtyMilli: bigint): string {
  const whole = qtyMilli / 1000n;
  const frac = qtyMilli % 1000n;
  return frac === 0n ? whole.toString() : `${whole},${frac.toString().padStart(3, '0').replace(/0+$/, '')}`;
}
/** 13000n → "13 000" */
const groupText = (v: bigint) => v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Ikki saqlanadigan holat bir xilmi (keraksiz saqlashni oldini olish uchun) */
export const sameStored = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
