/**
 * Ombor / Qoldiq sahifasining sof mantig'i (UI'siz, testlanadi). Tan narx va foyda bu yerda yo'q.
 * Qoldiq tahriri ustiga yozmaydi: farq (±) tuzatish yozuvi bo'lib jurnalga qo'shiladi (`adjust_stock`).
 */
import type { StockItem } from './data/books';
import { formatQty, parseQtyInput } from './money';
import type { FieldDef } from './rowEdit';
import { looseKey } from './translit';

/** "Kam qolgan" chegarasi: qoldiq shu miqdordan ko'p emas (3 birlik), manfiy emas. QARORLAR.md da yozilgan default */
export const LOW_STOCK_MILLI = 3000n;

export type StockFilter = 'all' | 'low' | 'negative';

/** Sabablar (tanlanadi; sabab majburiy, kamida 3 belgi) */
export const STOCK_REASONS = ['Inventarizatsiya (sanoq)', "Sanoqda xato chiqdi", "Yo'qotish (buzildi, yo'qoldi)", 'Hisobdagi xato'] as const;

/** Haqiqiy qoldiq: 0 mumkin (miqdor maydonidan farqli, u 0 ni rad etadi) */
export function parseActualQty(raw: string): { ok: true; value: bigint } | { ok: false; message: string } {
  const s = raw.trim();
  if (s !== '' && /^0+([.,]0*)?$/.test(s)) return { ok: true, value: 0n };
  return parseQtyInput(s);
}

export const isLow = (i: Pick<StockItem, 'qty_milli'>) => i.qty_milli >= 0n && i.qty_milli <= LOW_STOCK_MILLI;
export const isNegative = (i: Pick<StockItem, 'qty_milli'>) => i.qty_milli < 0n;

export function stockCounts(items: readonly StockItem[]): { low: number; negative: number } {
  const active = items.filter((i) => i.is_active);
  return { low: active.filter(isLow).length, negative: active.filter(isNegative).length };
}

/** Filtr + qidiruv (Kirill/Lotin farqsiz). Faol tovarlar; tartib: manfiy, kam qolgan, so'ng alifbo */
export function filterStock(items: readonly StockItem[], o: { query: string; filter: StockFilter }): StockItem[] {
  const k = looseKey(o.query);
  const rank = (i: StockItem) => (isNegative(i) ? 0 : isLow(i) ? 1 : 2);
  return items
    .filter((i) => i.is_active)
    .filter((i) => (o.filter === 'low' ? isLow(i) : o.filter === 'negative' ? isNegative(i) : true))
    .filter((i) => !k || looseKey(i.name).includes(k))
    .sort((a, b) => rank(a) - rank(b) || (looseKey(a.name) < looseKey(b.name) ? -1 : looseKey(a.name) > looseKey(b.name) ? 1 : 0));
}

/** "9 → 8 (farq −1)" yoki xato/o'zgarishsiz holatda null */
export function adjustDiffText(current: bigint, raw: string): string | null {
  const a = parseActualQty(raw);
  if (!a.ok) return null;
  const d = a.value - current;
  if (d === 0n) return `${formatQty(current)} (o'zgarmaydi)`;
  return `${formatQty(current)} → ${formatQty(a.value)} (farq ${d > 0n ? '+' : '−'}${formatQty(d > 0n ? d : -d)})`;
}

export function stockFields(): FieldDef[] {
  return [
    {
      key: 'qty',
      label: 'Qoldiq',
      kind: 'text',
      required: true,
      check: (v) => {
        const a = parseActualQty(v);
        return a.ok ? null : a.message;
      },
    },
    { key: 'reason', label: 'Sabab', kind: 'text', required: true, check: (v) => (v.trim().length < 3 ? 'Sababni yozing (kamida 3 belgi)' : null) },
  ];
}
