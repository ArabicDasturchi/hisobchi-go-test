/**
 * F1: ko'p qatorli ro'yxatni joylab savdo/kirim qatorlariga aylantirish (UI'siz, testlanadi). AI yo'q.
 *
 * 1. Matn → qatorlar: `@hisobchi/core` `parsePastedList` (deterministik; qator holati aniq / noaniq / xato).
 * 2. Har qator nomi katalog bilan alohida solishtiriladi (`matchCatalog`): katta-kichik harf, ortiqcha bo'shliq,
 *    apostrof turi va Kirill/Lotin farqi hisobga olinmaydi (`looseKey`).
 *    - bitta mos tovar → aniq (tovar id, katalog nomi va birligi, narx ro'yxatdan yoki katalogdan);
 *    - bir nechta mos (egizak nomlar yoki o'xshash nomlar) → variantlar bilan sariq ("choose");
 *    - mos tovar yo'q → "yangi tovar" taklifi bilan sariq ("new").
 * 3. Hal qilinmagan qator (`reviews` bo'sh emas) "Tasdiqlash" ni yopadi: `lineStatus` / `buildSalePlan` /
 *    `buildPurchasePlan` uni to'liq emas deb hisoblaydi.
 *
 * Hisob yo'q: summa mavjud yo'ldan (core `calculateLineTotal` → `buildSalePlan`), server `post_sale` /
 * `post_purchase` qayta hisoblab `p_client_total` bilan solishtiradi (ikkinchi mustaqil yo'l).
 */
import { parsePastedList, type PastedListRow } from '@hisobchi/core';
import { uz } from '@/i18n/uz';
import type { Product, Unit } from './data/types';
import { formatMoneyInput } from './money';
import { qtyToInput } from './productPicker';
import { searchProductsAll } from './productSearch';
import type { PurchaseDraftLine } from './purchaseForm';
import type { DraftLine } from './saleForm';
import { looseKey } from './translit';

/** Qatorni hal qilish uchun savdogardan kerak bo'lgan amal */
export type ReviewKind = 'xato' | 'choose' | 'new' | 'check';

export interface LineReview {
  kind: ReviewKind;
  message: string;
  /** "choose": tanlash uchun katalog tovarlari id'lari */
  candidates?: string[];
  /** "choose": variantlar o'rniga yangi tovar sifatida qoldirish mumkinmi (o'xshash, lekin aynan emas) */
  allowNew?: boolean;
  /** "check": qaysi maydonga tegishli. Faqat shu maydon tahrirlansa yechiladi (boshqa maydon tahriri uni yopmaydi) */
  field?: ReviewField;
}

export type ReviewField = 'name' | 'qty' | 'price' | 'unit';

const FIELD_OF: Record<string, ReviewField> = { productName: 'name', qtyMilli: 'qty', unitPrice: 'price', unit: 'unit' };

/** Joylangan qatorning kelib chiqishi (asl matn ko'rsatiladi) */
export interface PastedOrigin {
  lineNo: number;
  raw: string;
}

export type PasteStatus = 'aniq' | 'noaniq' | 'xato';

const MAX_CANDIDATES = 5;

export type CatalogMatch =
  | { kind: 'exact'; product: Product }
  | { kind: 'twins'; candidates: Product[] }
  | { kind: 'similar'; candidates: Product[] }
  | { kind: 'none' };

/**
 * Bitta nomni faol katalog bilan solishtiradi. `unit` (ro'yxatda yozilgan birlik) bir xil nomli tovarlarni ajratadi.
 * Aynan moslik: `looseKey` teng (registr, bo'shliq, apostrof, Kirill/Lotin farqisiz).
 * O'xshash: nom so'rov bilan boshlanadi/ichida bor (`searchProductsAll`) yoki so'rov katalog nomi bilan boshlanadi.
 */
export function matchCatalog(products: readonly Product[], name: string, unit?: Unit): CatalogMatch {
  const key = looseKey(name);
  if (!key) return { kind: 'none' };
  const active = products.filter((p) => p.is_active);
  const equal = active.filter((p) => looseKey(p.name) === key);
  if (unit) {
    const sameUnit = equal.filter((p) => p.unit === unit);
    if (sameUnit.length === 1) return { kind: 'exact', product: sameUnit[0]! };
  }
  if (equal.length === 1) return { kind: 'exact', product: equal[0]! };
  if (equal.length > 1) return { kind: 'twins', candidates: equal.slice(0, MAX_CANDIDATES) };
  const similar = new Map<string, Product>();
  for (const p of searchProductsAll(products, name)) similar.set(p.id, p);
  // "Joynamoz Turk katta" → katalogdagi "Joynamoz Turk" (so'rov katalog nomidan uzunroq)
  for (const p of active) {
    const k = looseKey(p.name);
    if (k && key.startsWith(`${k} `)) similar.set(p.id, p);
  }
  const candidates = [...similar.values()].slice(0, MAX_CANDIDATES);
  return candidates.length > 0 ? { kind: 'similar', candidates } : { kind: 'none' };
}

const priceText = (v: bigint | null | undefined) => (v === null || v === undefined ? '' : formatMoneyInput(v.toString()));

/** Tahlilchi ogohlantirishlari → "check" (soni/narx yo'qligi maydonning o'zida sariq bo'ladi, takrorlanmaydi) */
export function parserChecks(row: PastedListRow): LineReview[] {
  return row.issues
    .filter((i) => i.severity === 'warning' && i.code !== 'MISSING_QTY' && i.code !== 'MISSING_PRICE')
    .map((i) => ({ kind: 'check' as const, message: i.message, field: i.field ? FIELD_OF[i.field] : undefined }));
}

export function parserError(row: PastedListRow): LineReview {
  if (!row.productName) return { kind: 'xato', message: "Tovar nomi topilmadi: qatorni o'chirib, tovarni qo'lda qo'shing" };
  const first = row.issues.find((i) => i.severity === 'error');
  return { kind: 'xato', message: `Tushunilmadi: ${first?.message ?? "qator formati noto'g'ri"}. Soni va narxini qo'lda kiriting` };
}

export function matchReviews(match: CatalogMatch, name: string, rowUnit: Unit | undefined): LineReview[] {
  if (match.kind === 'exact') {
    const p = match.product;
    return rowUnit && rowUnit !== p.unit
      ? [{ kind: 'check', message: `Birlik: ro'yxatda ${uz.units[rowUnit]}, katalogda «${p.name}» ${uz.units[p.unit]}. Soni katalog birligida hisoblanadi`, field: 'qty' }]
      : [];
  }
  if (match.kind === 'twins') {
    return [{ kind: 'choose', message: `Katalogda bir nechta «${name}» bor: qaysi biri?`, candidates: match.candidates.map((p) => p.id) }];
  }
  if (match.kind === 'similar') {
    return [{ kind: 'choose', message: `«${name}» katalogda aynan yo'q: o'xshashini tanlang yoki yangi tovar qiling`, candidates: match.candidates.map((p) => p.id), allowNew: true }];
  }
  return [{ kind: 'new', message: `«${name}» katalogda yo'q: yangi tovar sifatida qo'shilsinmi?` }];
}

/**
 * Qator savollari navbati: tushunilmagan bo'lsa avval "xato" (soni/narxini tuzatish), keyin katalog savoli
 * (variant / yangi tovar), keyin tahlilchi ogohlantirishlari. Nomsiz qatorda katalog savoli yo'q.
 */
function rowReviews(row: PastedListRow, products: readonly Product[]): LineReview[] {
  const head = row.status === 'xato' ? [parserError(row)] : [];
  if (!row.productName) return head;
  const match = matchCatalog(products, row.productName, row.unit);
  return [...head, ...matchReviews(match, row.productName, row.unit), ...(row.status === 'xato' ? [] : parserChecks(row))];
}

const defaultKey = () => crypto.randomUUID();

/** Joylangan matn → savdo qatorlari (hech narsa saqlanmaydi, tasdiq odatdagidek) */
export function pastedSaleLines(text: string, products: readonly Product[], makeKey: () => string = defaultKey): DraftLine[] {
  return parsePastedList(text, { kind: 'sale' }).map((row) => {
    const base: DraftLine = {
      key: makeKey(),
      productId: null,
      productName: row.productName,
      qty: row.qtyMilli === undefined ? '' : qtyToInput(row.qtyMilli),
      unit: row.unit ?? 'dona',
      price: priceText(row.unitPrice),
      pasted: { lineNo: row.lineNo, raw: row.rawText },
    };
    const reviews = rowReviews(row, products);
    const match = row.productName ? matchCatalog(products, row.productName, row.unit) : null;
    if (match?.kind !== 'exact') return { ...base, reviews };
    const p = match.product;
    // Ro'yxatda yozilgan narx ustun; yozilmagan bo'lsa katalog narxi ("Chirmoq 13")
    return { ...base, productId: p.id, productName: p.name, unit: p.unit, price: base.price || priceText(p.last_price), reviews };
  });
}

/** Joylangan matn → kirim qatorlari. `costOf`: oxirgi kirim narxi (ro'yxatda narx yo'q bo'lsa taklif) */
export function pastedPurchaseLines(
  text: string,
  products: readonly Product[],
  opts: { costOf?: (productId: string) => bigint | null | undefined; newUnit?: Unit | null; makeKey?: () => string } = {},
): PurchaseDraftLine[] {
  const makeKey = opts.makeKey ?? defaultKey;
  return parsePastedList(text, { kind: 'purchase' }).map((row) => {
    const base: PurchaseDraftLine = {
      key: makeKey(),
      productId: null,
      productName: row.productName,
      unit: row.unit ?? opts.newUnit ?? null,
      qty: row.qtyMilli === undefined ? '' : qtyToInput(row.qtyMilli),
      unitCost: priceText(row.unitPrice),
      pasted: { lineNo: row.lineNo, raw: row.rawText },
    };
    const reviews = rowReviews(row, products);
    const match = row.productName ? matchCatalog(products, row.productName, row.unit) : null;
    if (match?.kind !== 'exact') return { ...base, reviews };
    const p = match.product;
    return { ...base, productId: p.id, productName: p.name, unit: p.unit, unitCost: base.unitCost || priceText(opts.costOf?.(p.id)), reviews };
  });
}

type Reviewable = { reviews?: LineReview[] };

/** Birinchi hal qilinmagan savol (yo'q bo'lsa null) */
export const currentReview = (l: Reviewable): LineReview | null => l.reviews?.[0] ?? null;

/** Tanlash/yangi tovar savolini olib tashlaydi (qolgan "check" savollari navbatda qoladi) */
const dropMatch = (rs: readonly LineReview[] = []) => rs.filter((r) => r.kind !== 'choose' && r.kind !== 'new');

/** Savdo qatori: variantdan tovar tanlandi. Ro'yxatda yozilgan narx saqlanadi, bo'lmasa katalog narxi */
export function chooseSaleProduct(line: DraftLine, p: Product): DraftLine {
  return { ...line, productId: p.id, productName: p.name, unit: p.unit, price: line.price.trim() ? line.price : priceText(p.last_price), reviews: dropMatch(line.reviews) };
}

/** Kirim qatori: variantdan tovar tanlandi */
export function choosePurchaseProduct(line: PurchaseDraftLine, p: Product, cost?: bigint | null): PurchaseDraftLine {
  return { ...line, productId: p.id, productName: p.name, unit: p.unit, unitCost: line.unitCost.trim() ? line.unitCost : priceText(cost), reviews: dropMatch(line.reviews) };
}

/** "Yangi tovar sifatida qoldirish": tovar id'siz (server/kirim yangi tovar yaratadi) */
export function keepAsNew<T extends Reviewable & { productId?: string | null }>(line: T): T {
  return { ...line, productId: null, reviews: dropMatch(line.reviews) };
}

/** "To'g'ri" (tekshirish savoli tasdiqlandi): faqat birinchi "check" olib tashlanadi */
export function acceptCheck<T extends Reviewable>(line: T): T {
  const rs = line.reviews ?? [];
  const at = rs.findIndex((r) => r.kind === 'check');
  return at < 0 ? line : { ...line, reviews: rs.filter((_, i) => i !== at) };
}

/**
 * Savdogar qatorni qo'lda tahrirladi: nom o'zgarsa hamma savol yechiladi (endi bu boshqa qator, odatdagi qoidalar);
 * soni/narxi/birligi o'zgarsa "xato" va SHU maydonga tegishli "check" yechiladi, tanlash savoli qoladi.
 */
export function reviewsAfterEdit(reviews: readonly LineReview[] | undefined, patch: { productName?: string; qty?: string; price?: string; unitCost?: string; unit?: unknown }): LineReview[] | undefined {
  if (!reviews || reviews.length === 0) return reviews as LineReview[] | undefined;
  if (patch.productName !== undefined) return [];
  const edited = new Set<ReviewField>();
  if (patch.qty !== undefined) edited.add('qty');
  if (patch.price !== undefined || patch.unitCost !== undefined) edited.add('price');
  if (patch.unit !== undefined) edited.add('unit');
  if (edited.size === 0) return [...reviews];
  // "xato": savdogar qiymatni o'zi qo'ya boshladi. "check": faqat tahrirlangan maydonniki (maydonsizi — har qanday tahrirda)
  return reviews.filter((r) => r.kind !== 'xato' && !(r.kind === 'check' && (r.field === undefined || edited.has(r.field))));
}

/** Joylangan qatorning ko'rinadigan holati: xato (tushunilmadi) / noaniq (sariq) / aniq */
export function pasteStatus(l: Reviewable, yellow: boolean): PasteStatus {
  if (currentReview(l)?.kind === 'xato') return 'xato';
  return yellow ? 'noaniq' : 'aniq';
}

export interface PasteSummary {
  total: number;
  aniq: number;
  noaniq: number;
  xato: number;
}

/** Toast uchun qisqa hisobot (yangi qatorlar bo'yicha) */
export function summarizePaste(statuses: readonly PasteStatus[]): PasteSummary {
  return {
    total: statuses.length,
    aniq: statuses.filter((s) => s === 'aniq').length,
    noaniq: statuses.filter((s) => s === 'noaniq').length,
    xato: statuses.filter((s) => s === 'xato').length,
  };
}

export function pasteSummaryText(s: PasteSummary): string {
  const parts = [`${s.aniq} ta aniq`];
  if (s.noaniq > 0) parts.push(`${s.noaniq} ta tekshirish kerak`);
  if (s.xato > 0) parts.push(`${s.xato} ta tushunilmadi`);
  return `Ro'yxatdan ${s.total} ta qator qo'shildi: ${parts.join(', ')}.`;
}
