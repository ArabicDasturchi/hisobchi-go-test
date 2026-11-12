/**
 * W4 regressiya: katalogdan tanlangan tovar savdo rejasiga va post_sale ga aniq product_id bilan tushadi.
 * Bu fayl faqat avvaldan bor API'larni ishlatadi: eski kodda tasdiqlar (assertion) bilan yiqiladi.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { postSale } from '@/lib/data/api';
import type { Product } from '@/lib/data/types';
import { addNewSaleLine } from '@/lib/panelLines';
import { applySelection, listedQty } from '@/lib/productSearch';
import { parseResale, resaleLines, toResaleDraft } from '@/lib/resale';
import { buildSalePlan } from '@/lib/saleForm';
import { saleInsights } from '@/lib/saleInsights';

const A_ID = '11111111-1111-4111-8111-111111111111';
const B_ID = '22222222-2222-4222-8222-222222222222';

const P = (id: string, name: string, o: Partial<Product> = {}): Product => ({
  id,
  name,
  unit: 'kg',
  last_price: 12_000n,
  cost_price: null,
  is_active: true,
  source: 'app',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...o,
});

/** Ikki bir xil nomli "Shakar" (kg): A eskiroq (server nom bo'yicha shuni oladi), B keyin qo'shilgan */
const A = P(A_ID, 'Shakar', { created_at: '2026-01-01T00:00:00Z', cost_price: 10_000n });
const B = P(B_ID, 'Shakar', { created_at: '2026-03-01T00:00:00Z', last_price: 14_000n, cost_price: 13_000n });
const CAT = [A, B];

let n = 0;
const key = () => `k${++n}`;

describe('W4: tanlangan tovar product_id bilan rejaga tushadi', () => {
  it('katalogdan B tanlansa reja qatorida B ning id si bor (A emas)', () => {
    const lines = applySelection([], [B], key);
    expect(lines[0]!.productId).toBe(B_ID);
    const r = buildSalePlan({ lines, customerId: null, mode: 'paid', partial: '' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.lines[0]!.product_id).toBe(B_ID);
    // Hisob o'zgarmagan: 1 × 14 000
    expect(r.plan.total).toBe(14_000n);
  });

  it('A va B ketma-ket tanlansa — ikki alohida qator (B A ning sonini oshirmaydi)', () => {
    const lines = applySelection(applySelection([], [A], key), [B], key);
    expect(lines.map((l) => [l.productId, l.qty])).toEqual([
      [A_ID, '1'],
      [B_ID, '1'],
    ]);
    // Qayta A tanlansa — A qatori +1
    const again = applySelection(lines, [A], key);
    expect(again.map((l) => l.qty)).toEqual(['2', '1']);
    expect(listedQty(again, B)).toBe('1');
  });

  it('postSale p_lines ga product_id ketadi; id yo‘q yoki noto‘g‘ri bo‘lsa yuborilmaydi', async () => {
    const calls: Record<string, unknown>[] = [];
    const sb = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        calls.push(args);
        return { data: 's1', error: null };
      },
      from: () => {
        const b: Record<string, unknown> = {};
        for (const k of ['select', 'eq']) b[k] = () => b;
        b.maybeSingle = async () => ({ data: { id: 's1', status: 'posted', subtotal: '36000' }, error: null });
        return b;
      },
    } as unknown as SupabaseClient;
    await postSale(sb, {
      shopId: 'shop',
      saleId: 's1',
      clientOpId: 'op',
      customerId: null,
      note: null,
      clientTotal: 36_000n,
      lines: [
        { product_name: 'Shakar', qty_milli: 1000n, unit: 'kg', unit_price: 14_000n, product_id: B_ID },
        { product_name: 'Shakar', qty_milli: 1000n, unit: 'kg', unit_price: 12_000n, product_id: null },
        { product_name: 'Un', qty_milli: 1000n, unit: 'kg', unit_price: 10_000n, product_id: 'not-a-uuid' },
      ],
    });
    const sent = calls[0]!.p_lines as Record<string, unknown>[];
    expect(sent[0]!.product_id).toBe(B_ID);
    expect('product_id' in sent[1]!).toBe(false);
    expect('product_id' in sent[2]!).toBe(false);
  });

  it('qayta yozish: asl qatordagi document_lines.product_id saqlanadi va rejaga tushadi', () => {
    const d = toResaleDraft(null, '#7', [{ product_name: 'Shakar', product_id: B_ID, qty_milli: 2000n, unit: 'kg', unit_price: 14_000n }]);
    const back = parseResale(JSON.stringify(d))!;
    const lines = resaleLines(back, key);
    expect(lines[0]!.productId).toBe(B_ID);
    const r = buildSalePlan({ lines, customerId: null, mode: 'paid', partial: '' });
    expect(r.ok && r.plan.lines[0]!.product_id).toBe(B_ID);
    // Buzilgan id sessionStorage dan o'tmaydi
    const bad = parseResale(JSON.stringify({ ...d, lines: [{ ...d.lines[0], productId: 'x' }] }))!;
    expect(bad.lines[0]!.productId).toBeNull();
  });

  it('erkin matnli yangi qator productId = null (server nom bo‘yicha bog‘laydi)', () => {
    const lines = addNewSaleLine([], 'Yangi tovar', key);
    expect(lines[0]!.productId).toBeNull();
    const r = buildSalePlan({ lines: [{ ...lines[0]!, price: '1 000' }], customerId: null, mode: 'paid', partial: '' });
    expect(r.ok && 'product_id' in r.plan.lines[0]!).toBe(false);
  });

  it('B tanlangan qator B ning tan narxi va qoldig‘ini oladi', () => {
    const lines = applySelection([], [B], key).map((l) => ({ ...l, price: '12 000' }));
    const stock = new Map([
      [A_ID, 100_000n],
      [B_ID, 500n],
    ]);
    const ins = saleInsights(lines, CAT, stock).perLine.get(lines[0]!.key)!;
    expect(ins.unitCost).toBe(13_000n);
    expect(ins.belowCost).toBe(true);
    expect(ins.stockMilli).toBe(500n);
    expect(ins.stock).toBe('negative');
  });
});
