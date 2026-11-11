/**
 * Yagona oyna uchun tovar qidiruvi va ko'p tanlash (UI'siz, testlanadi).
 * Hisob yo'q: narx/miqdor mavjud `applyProduct`/`stepQty` orqali, tartib `topProducts` (core `topSellingProducts`) dan.
 */
import type { Product } from './data/types';
import { looseKey } from './translit';
import { applyProduct, stepQty } from './productPicker';
import { isBlank, type DraftLine } from './saleForm';

/** Ro'yxat xavfsiz yuqori chegarasi (ommaviy ro'yxat DOM'ni bo'g'masligi uchun) */
export const SEARCH_ALL_LIMIT = 50;
const EMPTY_QUERY_LIMIT = 8;

/** Alifbo tartibi qidiruv kaliti bo'yicha: brauzer/ICU locale'iga bog'liq emas (deterministik) */
const byAlpha = (a: Product, b: Product) => {
  const ka = looseKey(a.name);
  const kb = looseKey(b.name);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/**
 * Mos kelgan HAMMA faol tovar (chegara {@link SEARCH_ALL_LIMIT}).
 * Tartib: nom boshidan → so'z boshidan → ichidan; har guruhda ko'p sotilgani (`popular` tartibi) yuqorida, keyin alifbo.
 * Kirill/Lotin, katta-kichik harf va apostrof farqi hisobga olinmaydi. Bo'sh so'rov: ko'p sotilganlar, so'ng oxirgi qo'shilganlar (8 ta).
 */
export function searchProductsAll(products: readonly Product[], query: string, popular: readonly Product[] = []): Product[] {
  const active = products.filter((p) => p.is_active);
  const rank = new Map<string, number>(popular.map((p, i) => [p.id, i]));
  const order = (a: Product, b: Product) => {
    const ra = rank.get(a.id) ?? Infinity;
    const rb = rank.get(b.id) ?? Infinity;
    if (ra !== rb) return ra < rb ? -1 : 1;
    return byAlpha(a, b);
  };
  const q = looseKey(query);
  if (!q) {
    // Bo'sh so'rov: avval ko'p sotilganlar, so'ng oxirgi qo'shilganlar (kamida 8 ta, katalog yetsa)
    const ranked = active.filter((p) => rank.has(p.id)).sort(order);
    const newest = active.filter((p) => !rank.has(p.id)).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : byAlpha(a, b)));
    return [...ranked, ...newest].slice(0, EMPTY_QUERY_LIMIT);
  }
  const starts: Product[] = [];
  const wordStarts: Product[] = [];
  const inside: Product[] = [];
  for (const p of active) {
    const n = looseKey(p.name);
    if (n.startsWith(q)) starts.push(p);
    else if (n.split(' ').some((w) => w.startsWith(q))) wordStarts.push(p);
    else if (n.includes(q)) inside.push(p);
  }
  return [starts.sort(order), wordStarts.sort(order), inside.sort(order)].flat().slice(0, SEARCH_ALL_LIMIT);
}

/** Ikki nom bir xilmi (Kirill/Lotin, harf registri, apostrof farqisiz) */
export function sameName(a: string, b: string): boolean {
  const ka = looseKey(a);
  return ka !== '' && ka === looseKey(b);
}

/** Belgini almashtiradi (qayta bosish = bekor qilish); tanlash tartibi saqlanadi */
export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/**
 * Ro'yxatda tovar nechanchi qatorda turibdi; yo'q bo'lsa -1.
 * Qatorda tanlangan tovar (`productId`) bo'lsa faqat id bo'yicha: bir xil nomli boshqa tovar shu qatorga qo'shilmaydi (W4).
 * Tanlovsiz (erkin matn yoki kirim qatori) qator — nom bo'yicha, avvalgidek.
 */
export function lineIndexOf(lines: readonly DraftLine[], p: Product): number {
  return lines.findIndex((l) => (l.productId ? l.productId === p.id : sameName(l.productName, p.name)));
}

/** Panelda "Ro'yxatda: 10 ta" uchun: tovarning qatordagi soni (matn) yoki null */
export function listedQty(lines: readonly DraftLine[], p: Product): string | null {
  const i = lineIndexOf(lines, p);
  return i < 0 ? null : lines[i]!.qty.trim() || '0';
}

const defaultKey = () => crypto.randomUUID();

/**
 * Tanlanganlarni qatorlarga qo'shadi (soni boshida 1).
 * Ro'yxatda bor tovar qayta qo'shilmaydi: soni +1. Bo'sh qator bo'lsa birinchi YANGI tovar shuni to'ldiradi.
 */
export function applySelection(lines: readonly DraftLine[], selected: readonly Product[], makeKey: () => string = defaultKey): DraftLine[] {
  let out = [...lines];
  const seen = new Set<string>();
  for (const p of selected) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const at = lineIndexOf(out, p);
    if (at >= 0) {
      out = out.map((l, i) => (i === at ? { ...l, qty: stepQty(l.qty, 1000n) } : l));
      continue;
    }
    const filled = (l: DraftLine): DraftLine => ({ ...applyProduct(l, p), qty: '1' });
    const blankAt = out.findIndex(isBlank);
    if (blankAt >= 0) out = out.map((l, i) => (i === blankAt ? filled(l) : l));
    else out.push(filled({ key: makeKey(), productId: null, productName: '', qty: '', unit: 'dona', price: '' }));
  }
  return out;
}
