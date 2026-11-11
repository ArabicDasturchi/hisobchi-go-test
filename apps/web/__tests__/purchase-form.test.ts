import { describe, expect, it } from 'vitest';
import type { Product, Unit } from '@/lib/data/types';
import { addNewPurchaseLine, applyPurchaseSelection, defaultNewUnit, purchaseAsDraft } from '@/lib/panelLines';
import { bindNewProducts, buildPurchasePlan, lineUnit, newProductKey, pendingProductId, purchaseEffects, resolveProduct, type PurchaseDraftLine } from '@/lib/purchaseForm';

const P = (id: string, name: string, active = true, unit: Unit = 'dona'): Product => ({ id, name, unit, last_price: null, is_active: active, source: 'app', created_at: '', updated_at: '' });
const CAT = [P('chirmoq', 'Chirmoq'), P('yurak', 'Yurak'), P('eski', 'Eski', false)];
const L = (key: string, name: string, qty: string, unitCost: string, productId: string | null = null, unit: Unit | null = null): PurchaseDraftLine => ({ key, productId, productName: name, unit, qty, unitCost });

describe('buildPurchasePlan: namuna 100×9 000 + 50×11 000 = 1 450 000', () => {
  const lines = [L('a', 'Chirmoq', '100', '9 000'), L('b', 'Yurak', '50', '11 000')];

  it("jami 1 450 000, berildi 1 000 000 → ostatka 450 000 (yangi ta'minotchi)", () => {
    const r = buildPurchasePlan({ lines, products: CAT, balanceBefore: 0n, paid: '1 000 000', method: 'naqd' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.subtotal).toBe(1_450_000n);
    expect(r.plan.paid).toBe(1_000_000n);
    expect(r.plan.balanceBefore).toBe(0n);
    expect(r.plan.balanceAfter).toBe(450_000n);
    expect(r.plan.method).toBe('naqd');
    expect(r.plan.lines).toEqual([
      { product_id: 'chirmoq', qty_milli: 100_000n, unit_cost: 9_000n },
      { product_id: 'yurak', qty_milli: 50_000n, unit_cost: 11_000n },
    ]);
  });

  it('Ostatka = Eski + Tovar − Berildi (boshlang‘ich qarz bilan)', () => {
    const r = buildPurchasePlan({ lines, products: CAT, balanceBefore: 500_000n, paid: '1 000 000', method: 'karta' });
    expect(r.ok && r.plan.balanceAfter).toBe(950_000n);
  });

  it("to'lov kiritilmasa hammasi qarzga; usul yo'q", () => {
    const r = buildPurchasePlan({ lines, products: CAT, balanceBefore: 0n, paid: '', method: 'naqd' });
    expect(r.ok && r.plan.balanceAfter).toBe(1_450_000n);
    expect(r.ok && r.plan.method).toBeNull();
  });

  it("jami qarzdan (Eski + Tovar) ko'p to'lov rad etiladi", () => {
    const r = buildPurchasePlan({ lines, products: CAT, balanceBefore: 0n, paid: '1 450 001', method: 'naqd' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.paidError).toMatch(/ko'p bo'lishi mumkin emas/);
    // aynan jamiga teng — mumkin
    expect(buildPurchasePlan({ lines, products: CAT, balanceBefore: 0n, paid: '1 450 000', method: 'naqd' }).ok).toBe(true);
    // Eski qarz bo'lsa ko'proq to'lash mumkin
    expect(buildPurchasePlan({ lines, products: CAT, balanceBefore: 100_000n, paid: '1 550 000', method: 'naqd' }).ok).toBe(true);
  });
});

describe('buildPurchasePlan: tekshiruvlar', () => {
  it("katalogda yo'q va arxivlangan tovar rad etiladi", () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Noma’lum', '1', '1000'), L('b', 'Eski', '1', '1000')], products: CAT, balanceBefore: 0n, paid: '', method: 'naqd' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.lineErrors.get('a')?.product).toBeTruthy();
      expect(r.lineErrors.get('b')?.product).toBeTruthy();
    }
  });
  it("noto'g'ri miqdor/narx qator xatosi; bo'sh qator e'tiborga olinmaydi", () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Chirmoq', '0', 'x'), L('e', '', '', '')], products: CAT, balanceBefore: 0n, paid: '', method: 'naqd' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.lineErrors.get('a')?.qty).toBeTruthy();
      expect(r.lineErrors.get('a')?.cost).toBeTruthy();
      expect(r.lineErrors.has('e')).toBe(false);
    }
  });
  it('qator yo‘q → xato', () => {
    const r = buildPurchasePlan({ lines: [L('e', '', '', '')], products: CAT, balanceBefore: 0n, paid: '', method: 'naqd' });
    expect(r.ok).toBe(false);
  });
  it('kasr miqdor (1,5 × 3 333) core formulasi bilan yaxlitlanadi', () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Chirmoq', '1,5', '3 333')], products: CAT, balanceBefore: 0n, paid: '', method: 'naqd' });
    expect(r.ok && r.plan.subtotal).toBe(5_000n); // (1500 × 3333 + 500) / 1000
  });
  it("tanlangan id nom bilan mos bo'lmasa (nom o'zgartirilgan) nom bo'yicha qayta qidiriladi", () => {
    expect(resolveProduct(CAT, { productId: 'chirmoq', productName: 'Yurak' })?.id).toBe('yurak');
    expect(resolveProduct(CAT, { productId: 'chirmoq', productName: 'Chirmoq' })?.id).toBe('chirmoq');
  });
});

describe('purchaseEffects: qoldiq va tan narx yangilanishi', () => {
  it("miqdor qo'shiladi, tan narx oxirgi qator narxiga o'tadi", () => {
    const fx = purchaseEffects([
      { product_id: 'chirmoq', qty_milli: 100_000n, unit_cost: 9_000n },
      { product_id: 'yurak', qty_milli: 50_000n, unit_cost: 11_000n },
      { product_id: 'chirmoq', qty_milli: 20_000n, unit_cost: 9_500n },
    ]);
    expect(fx.get('chirmoq')).toEqual({ addedQtyMilli: 120_000n, newCost: 9_500n });
    expect(fx.get('yurak')).toEqual({ addedQtyMilli: 50_000n, newCost: 11_000n });
  });
});

import { searchCatalog } from '@/lib/purchaseForm';

describe('searchCatalog', () => {
  it('boshidan mos kelganlar oldin, arxivlangan chiqmaydi, limit ishlaydi', () => {
    const cat = [P('1', 'Oq un'), P('2', 'Un'), P('3', 'Un (eski)', false), ...Array.from({ length: 20 }, (_, i) => P(`x${i}`, `Tovar ${i}`))];
    expect(searchCatalog(cat, 'un').map((p) => p.id)).toEqual(['2', '1']);
    expect(searchCatalog(cat, '', 5)).toHaveLength(5);
  });
});

import { parseActualQty } from '@/lib/stockView';
import { toAppError } from '@/lib/errors';

describe('parseActualQty (inventarizatsiya)', () => {
  it('0 mumkin, o‘nlik va butun qabul qilinadi, noto‘g‘ri rad etiladi', () => {
    expect(parseActualQty('0')).toEqual({ ok: true, value: 0n });
    expect(parseActualQty('0,0')).toEqual({ ok: true, value: 0n });
    expect(parseActualQty('12')).toEqual({ ok: true, value: 12_000n });
    expect(parseActualQty('1,5')).toEqual({ ok: true, value: 1_500n });
    expect(parseActualQty('').ok).toBe(false);
    expect(parseActualQty('abc').ok).toBe(false);
    expect(parseActualQty('-3').ok).toBe(false);
  });
});

describe('server xatolari (009 va kirim) o‘zbekcha xabarga o‘giriladi', () => {
  it.each([
    ['opening_balance_exists', 'conflict'],
    ['supplier_not_in_shop', 'not_found'],
    ['invalid_method', 'validation'],
    ['product_not_found', 'not_found'],
    ['Could not find the function public.post_supplier_opening_balance', 'unknown'],
  ])('%s', (raw, kind) => {
    const e = toAppError({ message: raw });
    expect(e.kind).toBe(kind);
    expect(e.message).not.toMatch(/opening_balance|supplier_not|invalid_method|product_not_found/);
  });
});

describe('W5: kirimda birlik va yangi tovar (allowNew)', () => {
  const UN = P('un', 'Un', true, 'kg');
  const cat = [UN, P('chirmoq', 'Chirmoq')];

  it("yangi nom to'liq tekshiriladi va kutilayotgan tovar sifatida rejaga tushadi (hech narsa yaratilmagan)", () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Shakar', '10', '12 000', null, 'kg'), L('b', 'Un', '5', '8 000', 'un', 'kg')], products: cat, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.newProducts).toEqual([{ key: newProductKey('Shakar', 'kg'), name: 'Shakar', unit: 'kg' }]);
    expect(r.plan.lines[0]!.product_id).toBe(pendingProductId(newProductKey('Shakar', 'kg')));
    expect(r.plan.subtotal).toBe(160_000n);
  });

  it('allowNew siz katalogda yo‘q nom avvalgidek rad etiladi (eski /purchases/new sahifasi)', () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Shakar', '10', '12 000', null, 'kg')], products: cat, balanceBefore: 0n, paid: '', method: 'naqd' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.lineErrors.get('a')?.product).toMatch(/Katalogdan tanlang/);
  });

  it('yangi nomda birlik tanlanmagan bo‘lsa qator xatosi', () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Shakar', '10', '12 000', null, null)], products: cat, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.lineErrors.get('a')?.unit).toMatch(/birlikni tanlang/);
  });

  it('yangi nomda ham to‘lov tekshiruvi ishlaydi (jamidan ko‘p to‘lov rad)', () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Shakar', '10', '12 000', null, 'kg')], products: cat, balanceBefore: 0n, paid: '120 001', method: 'naqd', allowNew: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.paidError).toBeTruthy();
  });

  it('katalogdagi nom boshqa birlikda yozilsa xato: «Un» katalogda kg birlikda bor', () => {
    const r = buildPurchasePlan({ lines: [L('a', ' un ', '10', '8 000', null, 'dona')], products: cat, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.lineErrors.get('a')?.unit).toBe('«Un» katalogda kg birlikda bor');
  });

  it('katalogdagi nom bir xil birlikda yozilsa mavjud tovar ishlatiladi, yangi tovar yo‘q', () => {
    const r = buildPurchasePlan({ lines: [L('a', 'UN', '10', '8 000', null, 'kg')], products: cat, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(r.ok && r.plan.lines[0]!.product_id).toBe('un');
    expect(r.ok && r.plan.newProducts).toEqual([]);
  });

  it('katalogdan tanlangan qatorda birlik tovarniki (qatordagi qiymat e‘tiborga olinmaydi)', () => {
    const r = buildPurchasePlan({ lines: [L('a', 'Un', '10', '8 000', 'un', 'dona')], products: cat, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(r.ok).toBe(true);
    expect(lineUnit(cat, L('a', 'Un', '1', '1', 'un', 'dona'))).toBe('kg');
    expect(lineUnit(cat, L('a', 'Shakar', '1', '1', null, 'qop'))).toBe('qop');
  });

  it('bir yangi nom ikki qatorda: bitta tovar; ikki xil birlikda: xato', () => {
    const same = buildPurchasePlan({ lines: [L('a', 'Shakar', '1', '1 000', null, 'kg'), L('b', 'shakar', '2', '1 000', null, 'kg')], products: cat, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(same.ok && same.plan.newProducts).toHaveLength(1);
    const diff = buildPurchasePlan({ lines: [L('a', 'Shakar', '1', '1 000', null, 'kg'), L('b', 'shakar', '2', '1 000', null, 'qop')], products: cat, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });
    expect(diff.ok).toBe(false);
    if (!diff.ok) expect(diff.lineErrors.get('b')?.unit).toMatch(/kg birlikda ham yozilgan/);
  });

  it('bindNewProducts: vaqtinchalik id almashtiriladi; yaratilmagan tovar bo‘lsa xato', () => {
    const k = newProductKey('Shakar', 'kg');
    const lines = [
      { product_id: pendingProductId(k), qty_milli: 1000n, unit_cost: 5n },
      { product_id: 'un', qty_milli: 1000n, unit_cost: 5n },
    ];
    expect(bindNewProducts(lines, new Map([[k, 'p1']])).map((l) => l.product_id)).toEqual(['p1', 'un']);
    expect(() => bindNewProducts(lines, new Map())).toThrow();
  });
});

describe('W5: kirim qatorlari birligi (panelLines)', () => {
  it('katalog tovari tanlanganda birlik tovardan o‘tadi', () => {
    const l = applyPurchaseSelection([], [P('un', 'Un', true, 'kg')], () => null, () => 'k1');
    expect(l[0]).toMatchObject({ productId: 'un', unit: 'kg' });
    expect(purchaseAsDraft(l)[0]!.unit).toBe('kg');
  });
  it('yangi nom qatori berilgan birlik bilan; standart: bitta birlik yoqilgan bo‘lsa o‘sha, aks holda tanlanmagan', () => {
    expect(addNewPurchaseLine([], 'Shakar', () => 'k1', 'kg')[0]).toMatchObject({ productId: null, productName: 'Shakar', unit: 'kg' });
    expect(addNewPurchaseLine([], 'Shakar', () => 'k1')[0]!.unit).toBeNull();
    expect(defaultNewUnit(['kg'])).toBe('kg');
    expect(defaultNewUnit(['dona', 'pachka'])).toBeNull();
  });
});
