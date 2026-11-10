/**
 * Mahsulotlar sahifasining sof mantig'i (UI'siz, testlanadi): filtr, tartib, tahrir maydonlari.
 * Tan narx va foyda bu yerda umuman yo'q (savdogar mijoz ko'rib turganda ro'yxat yozishi mumkin).
 */
import type { Product, Unit } from './data/types';
import { formatMoneyInput, parseMoneyInput } from './money';
import type { FieldDef, RowValues } from './rowEdit';
import { looseKey } from './translit';
import { firstError, productNameSchema } from './validation';
import { uz } from '@/i18n/uz';

export type ProductFilter = 'active' | 'archived' | 'noprice';

/**
 * Filtr + qidiruv (Kirill/Lotin/apostrof farqsiz). Tartib: narxi yo'qlar (sariq) yuqorida, so'ng alifbo bo'yicha.
 * "noprice": faol tovarlar ichida sotuv narxi yo'qlar. Chala tovarlar yashirilmaydi.
 */
export function filterProducts(products: readonly Product[], o: { query: string; filter: ProductFilter }): Product[] {
  const k = looseKey(o.query);
  const out = products.filter((p) => {
    if (o.filter === 'active' && !p.is_active) return false;
    if (o.filter === 'archived' && p.is_active) return false;
    if (o.filter === 'noprice' && !(p.is_active && p.last_price === null)) return false;
    return !k || looseKey(p.name).includes(k);
  });
  const name = (p: Product) => looseKey(p.name);
  return out.sort((a, b) => {
    const pa = a.last_price === null ? 0 : 1;
    const pb = b.last_price === null ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0;
  });
}

export function productFields(units: readonly Unit[]): FieldDef[] {
  return [
    { key: 'name', label: 'Nomi', kind: 'text', required: true, maxLength: 120, check: (v) => firstError(productNameSchema.safeParse(v)) },
    { key: 'unit', label: 'Birlik', kind: 'select', required: true, options: units.map((u) => ({ value: u, label: uz.units[u] })) },
    // Narx ixtiyoriy: bo'sh = "narx kiriting" (sariq), keyin ham kiritiladi
    { key: 'price', label: 'Sotuv narxi', kind: 'money', optional: true },
  ];
}

export function productInitial(p: Product): RowValues {
  return { name: p.name, unit: p.unit, price: p.last_price === null ? '' : formatMoneyInput(p.last_price.toString()) };
}

/** Tahrir qiymatlari → `updateProduct`/`createProduct` kirishi (narx BigInt, bo'sh = null) */
export function valuesToInput(v: RowValues, isActive: boolean): { name: string; unit: Unit; last_price: bigint | null; is_active: boolean } {
  const price = (v.price ?? '').trim();
  const parsed = price ? parseMoneyInput(price) : null;
  return { name: (v.name ?? '').trim(), unit: (v.unit ?? 'dona') as Unit, last_price: parsed?.ok ? parsed.value : null, is_active: isActive };
}
