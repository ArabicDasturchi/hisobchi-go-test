import { describe, expect, it } from 'vitest';
import { buildSalePlan } from '@/lib/saleForm';
import { parseResale, resaleLines, toResaleDraft } from '@/lib/resale';

const L = (name: string, qty: bigint, price: bigint) => ({ product_name: name, qty_milli: qty, unit: 'dona' as const, unit_price: price });

describe('Qayta yozish (resale)', () => {
  const lines = [L('Joynamoz Turk', 10_000n, 13_000n), L('Tasbeh', 5_000n, 15_000n), L("Ro'mol", 20_000n, 9_000n), L('Un', 1_500n, 15_000n)];

  it('bekor qilingan savdo qatorlari → panel qatorlari (soni, narx matn shaklida)', () => {
    const d = toResaleDraft('c1', '#14', lines);
    expect(d.number).toBe('#14');
    expect(d.lines.map((l) => [l.productName, l.qty, l.price])).toEqual([
      ['Joynamoz Turk', '10', '13 000'],
      ['Tasbeh', '5', '15 000'],
      ["Ro'mol", '20', '9 000'],
      ['Un', '1,5', '15 000'],
    ]);
  });

  it('sessionStorage matnidan qaytadan o‘qiladi va jami kodda o‘sha: 10x13000 + 5x15000 + 20x9000 + 1,5x15000 = 407 500', () => {
    const raw = JSON.stringify(toResaleDraft('c1', '#14', lines));
    const d = parseResale(raw)!;
    const dl = resaleLines(d, (() => { let n = 0; return () => `k${++n}`; })());
    expect(dl.map((l) => l.key)).toEqual(['k1', 'k2', 'k3', 'k4']);
    const plan = buildSalePlan({ lines: dl, customerId: 'c1', mode: 'debt', partial: '' });
    expect(plan.ok && plan.plan.total).toBe(407_500n);
  });

  it('buzilgan yoki bo‘sh ma‘lumot rad etiladi (panel bo‘sh ochiladi)', () => {
    expect(parseResale(null)).toBeNull();
    expect(parseResale('{xato')).toBeNull();
    expect(parseResale(JSON.stringify({ number: '#1', lines: [] }))).toBeNull();
    expect(parseResale(JSON.stringify({ number: '#1', lines: [{ productName: '', qty: '1', unit: 'dona', price: '1' }] }))).toBeNull();
    expect(parseResale(JSON.stringify({ lines: [{ productName: 'Un', qty: '1' }] }))).toBeNull();
  });

  it('mijozsiz savdo: customerId null saqlanadi', () => {
    const d = parseResale(JSON.stringify(toResaleDraft(null, '#2', lines)))!;
    expect(d.customerId).toBeNull();
  });
});
