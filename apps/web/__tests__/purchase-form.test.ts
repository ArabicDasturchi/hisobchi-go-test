import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/data/types';
import { buildPurchasePlan, purchaseEffects, resolveProduct, type PurchaseDraftLine } from '@/lib/purchaseForm';

const P = (id: string, name: string, active = true): Product => ({ id, name, unit: 'dona', last_price: null, is_active: active, source: 'app', created_at: '', updated_at: '' });
const CAT = [P('chirmoq', 'Chirmoq'), P('yurak', 'Yurak'), P('eski', 'Eski', false)];
const L = (key: string, name: string, qty: string, unitCost: string, productId: string | null = null): PurchaseDraftLine => ({ key, productId, productName: name, qty, unitCost });

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
