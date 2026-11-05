import { describe, expect, it } from 'vitest';
import type { Product, SaleDoc, SaleLineCost } from '@/lib/data/types';
import { applyProduct, findProductByName, qtyToInput, searchProducts, stepQty, topProducts } from '@/lib/productPicker';
import { buildSalePlan, type DraftLine } from '@/lib/saleForm';

const P = (id: string, name: string, unit: Product['unit'], price: number | null, extra: Partial<Product> = {}): Product => ({
  id,
  name,
  unit,
  last_price: price === null ? null : BigInt(price),
  is_active: true,
  source: 'app',
  created_at: '',
  updated_at: '',
  ...extra,
});
const CATALOG = [P('1', 'Guruch', 'kg', 13000), P('2', 'Un', 'kg', 15000), P('3', "Yog'", 'litr', 9000), P('4', 'Oq un', 'kg', 14000), P('5', 'Eski', 'dona', 1, { is_active: false })];
const blank: DraftLine = { key: 'k', productName: '', qty: '', unit: 'dona', price: '' };

describe('searchProducts', () => {
  it('nom boshidan mos kelganlar oldin, keyin ichidan; arxivlangan chiqmaydi', () => {
    expect(searchProducts(CATALOG, 'un').map((p) => p.name)).toEqual(['Un', 'Oq un']);
    expect(searchProducts(CATALOG, 'es')).toEqual([]); // "Eski" arxivda
  });
  it('katta-kichik harf va apostrof turi farq qilmaydi', () => {
    expect(searchProducts(CATALOG, 'YOG`').map((p) => p.name)).toEqual(["Yog'"]);
  });
  it("bo'sh so'rov — faol tovarlar (limit bilan)", () => {
    expect(searchProducts(CATALOG, '', 2)).toHaveLength(2);
  });
  it("60 tovarda ham limitdan ko'p qaytarmaydi", () => {
    const many = Array.from({ length: 60 }, (_, i) => P(`x${i}`, `Tovar ${i}`, 'dona', 1000));
    expect(searchProducts(many, 'tovar', 8)).toHaveLength(8);
  });
  it("aniq nom bo'yicha topadi", () => expect(findProductByName(CATALOG, ' guruch ')?.id).toBe('1'));
  it('arxivlangan tovar aniq nom bilan ham topilmaydi', () => expect(findProductByName(CATALOG, 'Eski')).toBeUndefined());
});

describe('applyProduct', () => {
  it("birlik va sotish narxi avtomatik to'ladi", () => {
    expect(applyProduct(blank, CATALOG[0]!)).toMatchObject({ productName: 'Guruch', unit: 'kg', price: '13 000' });
  });
  it("narxi yo'q tovarda mavjud narx saqlanadi", () => {
    expect(applyProduct({ ...blank, price: '5 000' }, P('9', 'Yangi', 'dona', null)).price).toBe('5 000');
  });
});

describe('stepQty', () => {
  it("bo'shdan qadam qo'shadi", () => expect(stepQty('', 5000n)).toBe('5'));
  it("qo'shadi va ayiradi, o'nlikni saqlaydi", () => {
    expect(stepQty('1,5', 1000n)).toBe('2,5');
    expect(stepQty('5', -1000n)).toBe('4');
  });
  it("0 yoki manfiy bo'lsa maydon bo'shaydi", () => {
    expect(stepQty('1', -1000n)).toBe('');
    expect(stepQty('', -1000n)).toBe('');
  });
  it("noto'g'ri matn 0 deb olinadi", () => expect(stepQty('abc', 10_000n)).toBe('10'));
  it('qtyToInput', () => {
    expect(qtyToInput(250n)).toBe('0,25');
    expect(qtyToInput(20_000n)).toBe('20');
  });
});

describe('topProducts', () => {
  const sale = (id: string, status: SaleDoc['status'] = 'posted'): SaleDoc => ({ id, customer_id: null, status, subtotal: 0n, created_at: '', posted_at: null, created_by: '' });
  const ln = (doc: string, product: string | null): SaleLineCost => ({ document_id: doc, product_id: product, product_name: 'x', qty_milli: 1000n, unit_price: 1n, unit_cost: null });
  it('ko‘p sotilganlar oldinda; bekor qilingan savdo, arxivlangan va tovarsiz qatorlar hisobga kirmaydi', () => {
    const sales = [sale('a'), sale('b'), sale('c', 'reversed')];
    const lines = [ln('a', '2'), ln('b', '2'), ln('a', '1'), ln('c', '3'), ln('c', '3'), ln('c', '3'), ln('a', '5'), ln('a', null)];
    expect(topProducts(CATALOG, sales, lines, 8).map((p) => p.id)).toEqual(['2', '1']);
  });
  it('limitga rioya qiladi', () => {
    const lines = ['1', '2', '3', '4'].map((p) => ln('a', p));
    expect(topProducts(CATALOG, [sale('a')], lines, 3)).toHaveLength(3);
  });
});

describe('namuna: 10×13 000 + 5×15 000 + 20×9 000 = 385 000 (katalogdan tanlab)', () => {
  it("faqat miqdor yozilganda jami to'g'ri", () => {
    const qty = ['10', '5', '20'];
    const lines = ['Guruch', 'Un', "Yog'"].map((n, i) => ({ ...applyProduct({ ...blank, key: n }, findProductByName(CATALOG, n)!), qty: qty[i]! }));
    const r = buildSalePlan({ lines, customerId: null, mode: 'paid', partial: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.total).toBe(385_000n);
  });
});

import { lacksSalePrice } from '@/lib/productPicker';

describe('lacksSalePrice: narxi yo‘q tovar tanlanganda narx qo‘lda kiritiladi', () => {
  const cat = [P('1', 'Guruch', 'kg', 13000), P('2', 'Makaron', 'dona', null)];
  it('narxi yo‘q katalog tovari → true', () => expect(lacksSalePrice(cat, 'makaron')).toBe(true));
  it('narxi bor tovar, katalogda yo‘q nom → false', () => {
    expect(lacksSalePrice(cat, 'Guruch')).toBe(false);
    expect(lacksSalePrice(cat, 'Yangi tovar')).toBe(false);
  });
  it('narxi yo‘q tovar tanlanganda applyProduct mavjud narxni o‘zgartirmaydi (bo‘sh qoladi)', () => {
    expect(applyProduct(blank, cat[1]!).price).toBe('');
  });
});
