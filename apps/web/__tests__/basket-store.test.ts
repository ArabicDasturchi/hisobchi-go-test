/**
 * F2 Savat: qatorlarni saqlash/o'qish, mahalliy va server ombori, versiya to'qnashuvi, idempotentlik, 015 yo'q serverda
 * mahalliy rejimga o'tish. Kutilgan qiymatlar qo'lda yozilgan.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  draftPurchaseToBasketLines,
  draftSaleToBasketLines,
  parsePurchaseLines,
  parseSaleLines,
  serializePurchaseLines,
  serializeSaleLines,
} from '@/lib/basketLines';
import { createLocalStore, createServerStore, resolveBasketStore, type KeyValueStorage } from '@/lib/basketStore';
import { BasketConflictError, isBasketServerUnavailable } from '@/lib/data/baskets';
import type { DraftLine } from '@/lib/saleForm';

const mem = (): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
let n = 0;
const key = () => `k${++n}`;

const SALE: DraftLine[] = [
  { key: 'a', productId: 'c1', productName: 'Chirmoq', qty: '10', unit: 'dona', price: '13 000' },
  { key: 'b', productId: null, productName: 'Atir', qty: '4', unit: 'dona', price: '20 000', pasted: { lineNo: 7, raw: 'Atir 4x20000' }, reviews: [{ kind: 'new', message: 'yangi?' }] },
  { key: 'c', productName: '', qty: '', unit: 'dona', price: '' }, // bo'sh — saqlanmaydi
];

describe('basketLines', () => {
  it('savdo: saqlash → o‘qish aynan qaytaradi (bo‘sh qator tashlanadi, savollar saqlanadi)', () => {
    const stored = serializeSaleLines(SALE);
    expect(stored).toHaveLength(2);
    expect(parseSaleLines(JSON.parse(JSON.stringify(stored)))).toEqual([
      { key: 'a', productId: 'c1', productName: 'Chirmoq', qty: '10', unit: 'dona', price: '13 000' },
      { key: 'b', productId: null, productName: 'Atir', qty: '4', unit: 'dona', price: '20 000', pasted: { lineNo: 7, raw: 'Atir 4x20000' }, reviews: [{ kind: 'new', message: 'yangi?' }] },
    ]);
  });

  it('buzilgan ma’lumot: noto‘g‘ri elementlar tashlanadi, savat baribir ochiladi', () => {
    const raw = [null, 5, { productName: 'X' }, { key: 'a', productName: 'Non', qty: '1', unit: 'gektar', price: '1' }, { key: 'd', productName: 'Non', qty: '1', unit: 'dona', price: '4 000', reviews: [{ kind: 'boshqa', message: 'x' }, { kind: 'check', message: 'ok', field: 'qty' }] }, { key: 'd', productName: 'Sut', qty: '2', unit: 'litr', price: '' }];
    const lines = parseSaleLines(raw, key);
    expect(lines.map((l) => l.productName)).toEqual(['Non', 'Sut']);
    expect(lines[0]!.reviews).toEqual([{ kind: 'check', message: 'ok', field: 'qty' }]);
    // takror kalit yangilanadi (React kaliti to'qnashmasin)
    expect(lines[1]!.key).not.toBe('d');
    expect(parseSaleLines('emas')).toEqual([]);
  });

  it('kirim: saqlash → o‘qish', () => {
    const lines = [{ key: 'p', productId: null, productName: 'Atir', unit: null, qty: '4', unitCost: '15 000' }];
    expect(parsePurchaseLines(serializePurchaseLines(lines))).toEqual(lines);
  });

  it('AI qoralamasi → savat qatorlari (son/narx matn, hisob yo‘q)', () => {
    expect(draftSaleToBasketLines([{ product_name: 'chirmoq', qty_milli: 12500n, unit: 'kg', unit_price: 1300000n }], key)[0]).toMatchObject({ productName: 'chirmoq', qty: '12,5', unit: 'kg', price: '1 300 000', productId: null });
    expect(draftPurchaseToBasketLines([{ product_id: 'u1', product_name: 'Un', unit: 'qop', qty_milli: 2000n, unit_cost: 400000n }], key)[0]).toMatchObject({ productId: 'u1', productName: 'Un', unit: 'qop', qty: '2', unitCost: '400 000' });
  });
});

describe('mahalliy ombor (015 yo‘q / demo)', () => {
  it('yaratish, versiya, takror op idempotent, to‘qnashuv, yopish', async () => {
    const st = mem();
    const s = createLocalStore(st, 'shop1', () => '2026-11-12T10:00:00Z');
    expect(await s.save({ id: 'b1', kind: 'sale', partnerId: 'c1', lines: [{ x: 1 }], expectedVersion: null, clientOpId: 'o1' })).toEqual({ version: 1 });
    expect(await s.save({ id: 'b1', kind: 'sale', partnerId: 'c1', lines: [], expectedVersion: null, clientOpId: 'o1' })).toEqual({ version: 1 });
    expect(await s.save({ id: 'b1', kind: 'sale', partnerId: 'c1', lines: [{ x: 2 }], expectedVersion: 1, clientOpId: 'o2' })).toEqual({ version: 2 });
    // boshqa tab eski versiya bilan
    await expect(s.save({ id: 'b1', kind: 'sale', partnerId: null, lines: [], expectedVersion: 1, clientOpId: 'o3' })).rejects.toBeInstanceOf(BasketConflictError);
    // sahifa yangilansa (yangi ombor, o'sha xotira) — saqlangan
    const again = createLocalStore(st, 'shop1');
    expect(await again.list()).toEqual([{ id: 'b1', kind: 'sale', partnerId: 'c1', lines: [{ x: 2 }], version: 2, updatedAt: '2026-11-12T10:00:00Z', sourceDraftId: null }]);
    // boshqa do'kon ko'rmaydi
    expect(await createLocalStore(st, 'shop2').list()).toEqual([]);
    await expect(again.close('b1', 'discarded', null, 1)).rejects.toBeInstanceOf(BasketConflictError);
    await again.close('b1', 'done', 'doc1');
    expect(await again.list()).toEqual([]);
    await again.close('b1', 'done', 'doc1'); // idempotent
  });

  it('localStorage ishlamasa xotirada ishlaydi', async () => {
    const broken: KeyValueStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    const s = createLocalStore(broken, 'shop1');
    await s.save({ id: 'b1', kind: 'purchase', partnerId: null, lines: [{}], expectedVersion: null, clientOpId: 'o' });
    expect((await s.list()).map((b) => b.id)).toEqual(['b1']);
  });
});

type Call = { fn: string; args: Record<string, unknown> };
function fakeSb(opts: { rpcError?: unknown; selectError?: unknown; rows?: unknown[]; rpcData?: unknown } = {}) {
  const calls: Call[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) q[m] = () => q;
  q.limit = async () => ({ data: opts.selectError ? null : (opts.rows ?? []), error: opts.selectError ?? null });
  const sb = {
    from: () => q,
    rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: opts.rpcError ? null : (opts.rpcData ?? [{ basket_id: 'b1', version: 3 }]), error: opts.rpcError ?? null }),
  } as unknown as SupabaseClient;
  return { sb, calls };
}

describe('server ombori (015)', () => {
  it('basket_save parametrlari va natija', async () => {
    const { sb, calls } = fakeSb();
    const s = createServerStore(sb, 'shop1');
    expect(await s.save({ id: 'b1', kind: 'sale', partnerId: 'c1', lines: [{ a: 1 }], expectedVersion: 2, clientOpId: 'op' })).toEqual({ version: 3 });
    expect(calls[0]).toEqual({ fn: 'basket_save', args: { p_shop_id: 'shop1', p_basket_id: 'b1', p_kind: 'sale', p_partner_id: 'c1', p_lines: [{ a: 1 }], p_expected_version: 2, p_client_op_id: 'op' } });
  });

  it('version_conflict → BasketConflictError (server versiyasi DETAIL dan)', async () => {
    const { sb } = fakeSb({ rpcError: { code: '40001', message: 'version_conflict', details: '7' } });
    const err = await createServerStore(sb, 'shop1').save({ id: 'b1', kind: 'sale', partnerId: null, lines: [], expectedVersion: 2, clientOpId: 'op' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BasketConflictError);
    expect((err as BasketConflictError).serverVersion).toBe(7);
  });

  it('ro‘yxat: hamkor turiga qarab (sale → customer, purchase → supplier)', async () => {
    const { sb } = fakeSb({ rows: [
      { id: 's', kind: 'sale', status: 'open', customer_id: 'c1', supplier_id: null, lines: [{}], version: 2, updated_at: 't', source_draft_id: null },
      { id: 'p', kind: 'purchase', status: 'open', customer_id: null, supplier_id: 'sp', lines: 'buzuq', version: 1, updated_at: 't', source_draft_id: 'd1' },
    ] });
    expect(await createServerStore(sb, 'shop1').list()).toEqual([
      { id: 's', kind: 'sale', partnerId: 'c1', lines: [{}], version: 2, updatedAt: 't', sourceDraftId: null },
      { id: 'p', kind: 'purchase', partnerId: 'sp', lines: [], version: 1, updatedAt: 't', sourceDraftId: 'd1' },
    ]);
  });

  it('015 yo‘q (jadval/RPC topilmadi) yoki demo → mahalliy; tarmoq xatosi → xato (jim o‘tilmaydi)', async () => {
    for (const e of [{ code: '42P01', message: 'relation "baskets" does not exist' }, { code: 'PGRST205', message: "Could not find the table 'public.baskets'" }, { code: 'DEMO', message: 'demo_read_only' }]) {
      expect(isBasketServerUnavailable(e)).toBe(true);
      const { sb } = fakeSb({ selectError: e });
      expect((await resolveBasketStore(sb, 'shop1', mem())).store.mode).toBe('local');
    }
    const net = { message: 'Failed to fetch' };
    expect(isBasketServerUnavailable(net)).toBe(false);
    await expect(resolveBasketStore(fakeSb({ selectError: net }).sb, 'shop1', mem())).rejects.toEqual(net);
    expect((await resolveBasketStore(fakeSb().sb, 'shop1', mem())).store.mode).toBe('server');
  });
});
