// @vitest-environment jsdom
/**
 * W3: savdo va to'lov BITTA tranzaksiyada (`post_sale` p_paid). W10: mijozsiz (naqd) savdo bir martalik mijoz
 * bilan, to'lov yozuvi bilan (usuli kassa hisobiga ta'sir qiladi). Alohida `record_payment` chaqirilmaydi.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftLine } from '@/lib/saleForm';

const SQL006 = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/006_partners_stock.sql'), 'utf8');

/** post_sale imzosi 006 dan (DEFAULT now() ichidagi qavs tufayli oddiy regex emas) */
function postSaleSignature(): { all: string[]; required: string[] } {
  const start = SQL006.indexOf('CREATE OR REPLACE FUNCTION post_sale(');
  const body = SQL006.slice(start + 'CREATE OR REPLACE FUNCTION post_sale('.length, SQL006.indexOf(') RETURNS uuid', start));
  const params = body.split('\n').map((s) => s.trim().replace(/,$/, '')).filter(Boolean).map((p) => ({ name: p.split(/\s+/)[0]!, hasDefault: /\bDEFAULT\b/i.test(p) }));
  return { all: params.map((p) => p.name), required: params.filter((p) => !p.hasDefault).map((p) => p.name) };
}

// ---------------------------------------------------------------------------
// api.postSale (haqiqiy modul, soxta klient)
// ---------------------------------------------------------------------------
describe('postSale: to‘lov bilan bitta RPC', async () => {
  const { postSale } = await vi.importActual<typeof import('@/lib/data/api')>('@/lib/data/api');

  function fakeClient(rows: { doc?: unknown; pay?: unknown }) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const reads: { table: string; filters: [string, unknown][] }[] = [];
    const builder = (table: string) => {
      const filters: [string, unknown][] = [];
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (k: string, v: unknown) => (filters.push([k, v]), b);
      b.maybeSingle = async () => (reads.push({ table, filters }), { data: table === 'documents' ? rows.doc : table === 'payments' ? rows.pay : null, error: null });
      return b;
    };
    const sb = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: 's1', error: null }), from: builder } as unknown as SupabaseClient;
    return { sb, calls, reads };
  }
  const doc = { id: 's1', status: 'posted', subtotal: '100000', customer_id: 'c1', created_at: '', posted_at: '', created_by: 'u' };
  const base = { shopId: 'shop', saleId: 's1', clientOpId: 'op1', customerId: 'c1', note: null, lines: [{ product_name: 'Un', qty_milli: 10_000n, unit: 'kg' as const, unit_price: 10_000n }], clientTotal: 100_000n };

  it('p_paid va p_payment_method string, 006 imzosiga mos; to‘lov serverdan qayta o‘qiladi', async () => {
    const { sb, calls, reads } = fakeClient({ doc, pay: { amount: '100000' } });
    await postSale(sb, { ...base, paid: 100_000n, method: 'karta' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe('post_sale');
    expect(calls[0]!.args).toMatchObject({ p_paid: '100000', p_payment_method: 'karta', p_client_total: '100000' });
    const sig = postSaleSignature();
    for (const k of Object.keys(calls[0]!.args)) expect(sig.all, `${k} SQL imzosida yo'q`).toContain(k);
    for (const k of sig.required) expect(Object.keys(calls[0]!.args)).toContain(k);
    expect(reads.find((r) => r.table === 'payments')?.filters).toContainEqual(['client_op_id', 'sale-pay:op1']);
  });
  it('to‘lovsiz (qarzga): p_paid yuborilmaydi, to‘lov o‘qilmaydi', async () => {
    const { sb, calls, reads } = fakeClient({ doc });
    await postSale(sb, { ...base, paid: 0n, method: 'naqd' });
    expect(calls[0]!.args).not.toHaveProperty('p_paid');
    expect(calls[0]!.args).not.toHaveProperty('p_payment_method');
    expect(reads.some((r) => r.table === 'payments')).toBe(false);
  });
  it('server to‘lovni boshqa summada qaytarsa yoki topilmasa — xato (jim o‘tmaydi)', async () => {
    await expect(postSale(fakeClient({ doc, pay: { amount: '1' } }).sb, { ...base, paid: 100_000n, method: 'naqd' })).rejects.toThrow(/to'lov serverda kutilgan summada topilmadi/);
    await expect(postSale(fakeClient({ doc, pay: null }).sb, { ...base, paid: 100_000n, method: 'naqd' })).rejects.toThrow(/topilmadi/);
  });
  it('to‘lov bor, usul yo‘q — RPC chaqirilmaydi', async () => {
    const { sb, calls } = fakeClient({ doc });
    await expect(postSale(sb, { ...base, paid: 5n, method: null })).rejects.toThrow(/usulini/);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// saleTarget (sof)
// ---------------------------------------------------------------------------
describe('saleTarget', async () => {
  const { saleTarget } = await import('@/components/sale/useSaleSubmit');
  const plan = { lines: [], total: 100_000n, paidNow: 40_000n, debt: 60_000n };
  it('doimiy mijoz: rejadagi to‘lov (qisman/to‘liq/0)', () => {
    expect(saleTarget(plan, 'c1', 'w')).toEqual({ customerId: 'c1', paid: 40_000n });
    expect(saleTarget({ ...plan, paidNow: 0n }, 'c1', 'w')).toEqual({ customerId: 'c1', paid: 0n });
  });
  it('mijozsiz: bir martalik mijoz, to‘liq to‘langan (server walkin_requires_full_payment)', () => {
    expect(saleTarget({ ...plan, paidNow: 0n, debt: 0n }, null, 'w')).toEqual({ customerId: 'w', paid: 100_000n });
  });
  it('mijozsiz 0 so‘mlik savdo: avvalgidek mijozsiz, to‘lovsiz (server walk-in 0 ni rad etadi)', () => {
    expect(saleTarget({ lines: [], total: 0n, paidNow: 0n, debt: 0n }, null, 'w')).toEqual({ customerId: null, paid: 0n });
  });
});

// ---------------------------------------------------------------------------
// useSaleSubmit (hook): record_payment chaqirilmaydi, bitta postSale
// ---------------------------------------------------------------------------
const api = vi.hoisted(() => ({
  postSale: vi.fn(async (_sb: unknown, a: { saleId: string }) => a.saleId),
  ensureWalkinCustomer: vi.fn(async () => 'walkin-1'),
  recordPayment: vi.fn(async () => 'p'),
}));
const shop = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/lib/data/api', async (orig) => ({ ...(await orig<typeof import('@/lib/data/api')>()), postSale: api.postSale, ensureWalkinCustomer: api.ensureWalkinCustomer, recordPayment: api.recordPayment }));
vi.mock('@/components/ShopDataProvider', () => ({ useShop: () => shop.value }));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({}) }));

const line = (over: Partial<DraftLine> = {}): DraftLine => ({ key: 'k1', productName: 'Un', qty: '10', unit: 'kg', price: '10000', ...over });

beforeEach(() => {
  api.postSale.mockClear();
  api.ensureWalkinCustomer.mockClear();
  api.recordPayment.mockClear();
  shop.value = {
    shopId: 'shop',
    reload: vi.fn(async () => {}),
    balances: new Map(),
    membership: { shop: { id: 'shop', name: 'Do‘kon', created_at: '' }, role: 'owner', user_id: 'u' },
    customerById: new Map([['c1', { id: 'c1', name: 'Ali' }]]),
    data: { walkin: null },
  };
});
afterEach(cleanup);

describe('useSaleSubmit', async () => {
  const { useSaleSubmit } = await import('@/components/sale/useSaleSubmit');
  const run = async (input: Parameters<typeof useSaleSubmit>[0]) => {
    const { result } = renderHook(() => useSaleSubmit(input));
    await act(async () => {
      await result.current.submit();
    });
    return result;
  };

  it('doimiy mijoz, «To‘landi»: bitta postSale (paid = jami, usul), record_payment yo‘q', async () => {
    const r = await run({ lines: [line()], customerId: 'c1', mode: 'paid', partial: '', method: 'karta' });
    expect(api.postSale).toHaveBeenCalledTimes(1);
    expect(api.postSale.mock.calls[0]![1]).toMatchObject({ customerId: 'c1', clientTotal: 100_000n, paid: 100_000n, method: 'karta' });
    expect(api.recordPayment).not.toHaveBeenCalled();
    expect(r.current.phase.kind).toBe('done');
  });
  it('qisman: paid = qisman summa', async () => {
    await run({ lines: [line()], customerId: 'c1', mode: 'partial', partial: '30 000', method: 'naqd' });
    expect(api.postSale.mock.calls[0]![1]).toMatchObject({ customerId: 'c1', paid: 30_000n });
    expect(api.recordPayment).not.toHaveBeenCalled();
  });
  it('qarzga: paid = 0', async () => {
    await run({ lines: [line()], customerId: 'c1', mode: 'debt', partial: '', method: 'naqd' });
    expect(api.postSale.mock.calls[0]![1]).toMatchObject({ customerId: 'c1', paid: 0n });
  });
  it('mijozsiz (W10): bir martalik mijoz olinadi, to‘liq to‘lov tanlangan usul bilan', async () => {
    await run({ lines: [line()], customerId: '', mode: 'paid', partial: '', method: 'karta' });
    expect(api.ensureWalkinCustomer).toHaveBeenCalledTimes(1);
    expect(api.postSale.mock.calls[0]![1]).toMatchObject({ customerId: 'walkin-1', paid: 100_000n, method: 'karta' });
    expect(api.recordPayment).not.toHaveBeenCalled();
  });
  it('mijozsiz: do‘konda bir martalik mijoz yuklangan bo‘lsa RPC chaqirilmaydi', async () => {
    shop.value = { ...shop.value, data: { walkin: { id: 'w-known' } } };
    await run({ lines: [line()], customerId: '', mode: 'paid', partial: '', method: 'naqd' });
    expect(api.ensureWalkinCustomer).not.toHaveBeenCalled();
    expect(api.postSale.mock.calls[0]![1]).toMatchObject({ customerId: 'w-known', paid: 100_000n });
  });
  it('mijozsiz 0 so‘mlik savdo: bir martalik mijoz olinmaydi, customer_id NULL, to‘lovsiz', async () => {
    const r = await run({ lines: [line({ price: '0' })], customerId: '', mode: 'paid', partial: '', method: 'naqd' });
    expect(api.ensureWalkinCustomer).not.toHaveBeenCalled();
    expect(api.postSale.mock.calls[0]![1]).toMatchObject({ customerId: null, clientTotal: 0n, paid: 0n });
    expect(r.current.phase.kind).toBe('done');
  });
  it('mijozsiz, tarmoq xatosidan keyin qayta urinish: bir martalik mijoz bir marta olinadi, kalit va mijoz o‘sha', async () => {
    api.postSale.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { result } = renderHook(() => useSaleSubmit({ lines: [line()], customerId: '', mode: 'paid', partial: '', method: 'naqd' }));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.locked).toBe(true);
    await act(async () => {
      await result.current.submit();
    });
    expect(api.ensureWalkinCustomer).toHaveBeenCalledTimes(1);
    const [a, b] = api.postSale.mock.calls.map((c) => c[1] as unknown as { clientOpId: string; customerId: string });
    expect(b!.clientOpId).toBe(a!.clientOpId);
    expect(b!.customerId).toBe('walkin-1');
    expect(a!.customerId).toBe('walkin-1');
  });
  it('server walkin_requires_full_payment qaytarsa: tushunarli xabar, forma qulflanmaydi', async () => {
    api.postSale.mockRejectedValueOnce({ message: 'walkin_requires_full_payment: total=0', code: '22000' });
    const r = await run({ lines: [line()], customerId: '', mode: 'paid', partial: '', method: 'naqd' });
    expect(r.current.locked).toBe(false);
    expect(r.current.formError).toMatch(/to'liq to'langan/);
  });
  it('tarmoq xatosi: forma qulflanadi, qayta urinish o‘sha kalit bilan (takroriy savdo yo‘q)', async () => {
    api.postSale.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { result } = renderHook(() => useSaleSubmit({ lines: [line()], customerId: 'c1', mode: 'paid', partial: '', method: 'naqd' }));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.locked).toBe(true);
    expect(result.current.phase.kind).toBe('editing');
    await act(async () => {
      await result.current.submit();
    });
    const [a, b] = api.postSale.mock.calls.map((c) => c[1] as { saleId: string; clientOpId: string });
    expect(b!.saleId).toBe(a!.saleId);
    expect(b!.clientOpId).toBe(a!.clientOpId);
    expect(result.current.phase.kind).toBe('done');
  });
});
