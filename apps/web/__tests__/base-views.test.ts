import { describe, expect, it } from 'vitest';
import type { StockItem } from '@/lib/data/books';
import type { Product } from '@/lib/data/types';
import { priceInName } from '@/lib/productNameIssues';
import { filterProducts, productFields, productInitial, valuesToInput } from '@/lib/productsView';
import { validateRow } from '@/lib/rowEdit';
import { adjustDiffText, filterStock, isLow, LOW_STOCK_MILLI, parseActualQty, stockCounts, stockFields } from '@/lib/stockView';

const P = (id: string, name: string, price: number | null, extra: Partial<Product> = {}): Product => ({
  id, name, unit: 'dona', last_price: price === null ? null : BigInt(price), is_active: true, source: 'app', created_at: '', updated_at: '', ...extra,
});
const S = (id: string, name: string, qty: number, extra: Partial<StockItem> = {}): StockItem => ({
  product_id: id, name, unit: 'dona', is_active: true, qty_milli: BigInt(qty * 1000), cost_price: 111n, sale_price: 9000n, ...extra,
});

describe('Mahsulotlar: filtr va tartib', () => {
  const list = [P('1', 'Un', 15000), P('2', 'Atir', null), P('3', 'Eski', 1000, { is_active: false }), P('4', 'Bog', null), P('5', 'Shakar', 12000)];
  it('Faol: narxi yoqlar sariq, yuqorida; keyin alifbo; arxiv chiqmaydi', () => {
    expect(filterProducts(list, { query: '', filter: 'active' }).map((p) => p.name)).toEqual(['Atir', 'Bog', 'Shakar', 'Un']);
  });
  it('Arxiv va "Sotuv narxi yoq" filtrlari', () => {
    expect(filterProducts(list, { query: '', filter: 'archived' }).map((p) => p.name)).toEqual(['Eski']);
    expect(filterProducts(list, { query: '', filter: 'noprice' }).map((p) => p.name)).toEqual(['Atir', 'Bog']);
  });
  it('qidiruv Kirill va Lotin farqsiz', () => {
    expect(filterProducts(list, { query: 'шакар', filter: 'active' }).map((p) => p.name)).toEqual(['Shakar']);
  });
  it('tan narx va foyda tahrir maydonlarida yoq', () => {
    const keys = productFields(['dona', 'kg']).map((f) => f.key);
    expect(keys).toEqual(['name', 'unit', 'price']);
  });
  it('tahrir: nom bosh bolsa va narx notogri bolsa xato; narx bosh = null', () => {
    const f = productFields(['dona']);
    expect(validateRow(f, { name: '', unit: 'dona', price: '' }).name).toBeTruthy();
    expect(validateRow(f, { name: 'Un', unit: 'dona', price: 'abc' }).price).toBeTruthy();
    expect(validateRow(f, { name: 'Un', unit: 'dona', price: '' })).toEqual({});
    expect(valuesToInput({ name: ' Un ', unit: 'dona', price: '15 000' }, true)).toEqual({ name: 'Un', unit: 'dona', last_price: 15000n, is_active: true });
    expect(valuesToInput({ name: 'Un', unit: 'dona', price: '' }, true).last_price).toBeNull();
    expect(productInitial(P('1', 'Un', 15000))).toEqual({ name: 'Un', unit: 'dona', price: '15 000' });
  });
});

describe('Ombor: qoldiq', () => {
  const items = [S('a', 'Bir', 1), S('b', 'Ikki', 15), S('c', 'Uch', -2), S('d', 'Tort', 3), S('e', 'Besh', 4), S('f', 'Arxiv', 1, { is_active: false })];
  it('kam qolgan chegarasi 3 (3 ham kam, 4 emas, manfiy alohida)', () => {
    expect(LOW_STOCK_MILLI).toBe(3000n);
    expect(isLow(items[3]!)).toBe(true);
    expect(isLow(items[4]!)).toBe(false);
    expect(isLow(items[2]!)).toBe(false);
    expect(stockCounts(items)).toEqual({ low: 2, negative: 1 });
  });
  it('filtr: kam qolgan va manfiy; tartib manfiy, kam, qolgani', () => {
    expect(filterStock(items, { query: '', filter: 'all' }).map((i) => i.name)).toEqual(['Uch', 'Bir', 'Tort', 'Besh', 'Ikki']);
    expect(filterStock(items, { query: '', filter: 'low' }).map((i) => i.name)).toEqual(['Bir', 'Tort']);
    expect(filterStock(items, { query: '', filter: 'negative' }).map((i) => i.name)).toEqual(['Uch']);
  });
  it('farq matni: 12 -> 10 farq -2; ozgarishsiz', () => {
    expect(adjustDiffText(12000n, '10')).toBe('12 → 10 (farq −2)');
    expect(adjustDiffText(9000n, '12')).toBe('9 → 12 (farq +3)');
    expect(adjustDiffText(9000n, '9')).toContain('o');
    expect(adjustDiffText(9000n, 'abc')).toBeNull();
  });
  it('haqiqiy qoldiq 0 mumkin; sabab majburiy (3 belgi)', () => {
    expect(parseActualQty('0')).toEqual({ ok: true, value: 0n });
    expect(parseActualQty('1,5')).toEqual({ ok: true, value: 1500n });
    const f = stockFields();
    expect(validateRow(f, { qty: '8', reason: 'ab' }).reason).toBeTruthy();
    expect(validateRow(f, { qty: 'x', reason: 'Inventarizatsiya' }).qty).toBeTruthy();
    expect(validateRow(f, { qty: '8', reason: 'Inventarizatsiya' })).toEqual({});
  });
});

describe('Tovar nomi: narx nomga yozilgan (faqat aniqlash, ozgartirilmaydi)', () => {
  it('"Атиргул 7 500", "Хермес 59 000", "Лен 5 500" aniqlanadi', () => {
    expect(priceInName('Атиргул 7 500')).toBe(true);
    expect(priceInName('Хермес 59 000')).toBe(true);
    expect(priceInName('Лен 5 500')).toBe(true);
    expect(priceInName('Shakar 1 kg')).toBe(false);
    expect(priceInName('2ли дарахт')).toBe(false);
  });
});
