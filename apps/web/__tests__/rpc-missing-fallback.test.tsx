// @vitest-environment jsdom
/**
 * 013 migratsiyasi (PR #43) serverda hali bo'lmasa, web `main` dan yomonlashmasligi kerak:
 * - W2: ta'minotchi «Daftarga yozish» avvalgi yo'l (ochilish qoldig'i) bilan yoziladi — birinchi yozuv avvalgidek ishlaydi;
 * - W1: to'lovli bekor qilish jim fallback qilmaydi (to'lov qolib, kassa noto'g'ri bo'lardi), aniq ko'rsatma beradi.
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRpcMissing, RpcMissingError } from '@/lib/errors';

const PGRST202 = { code: 'PGRST202', message: 'Could not find the function public.post_supplier_debt(...) in the schema cache', details: null, hint: null };

function fakeSb(rpcError: unknown) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.in = () => (reads.push('in'), Promise.resolve({ data: [], error: null }));
  b.maybeSingle = async () => (reads.push('maybeSingle'), { data: null, error: null });
  const sb = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: null, error: rpcError }), from: () => b } as unknown as SupabaseClient;
  return { sb, calls, reads };
}

describe('isRpcMissing', () => {
  it('faqat "funksiya topilmadi" holatlari', () => {
    expect(isRpcMissing(PGRST202)).toBe(true);
    expect(isRpcMissing({ code: '42883', message: 'function x does not exist' })).toBe(true);
    // mavjud funksiya ichidagi turi mos kelmagan operator — RPC yo'qligi emas
    expect(isRpcMissing({ code: '42883', message: 'operator does not exist: uuid = text' })).toBe(false);
    expect(isRpcMissing({ code: 'PGRST203', message: 'Could not choose the best candidate function' })).toBe(false);
    expect(isRpcMissing({ code: '08006', message: 'Failed to fetch' })).toBe(false);
    expect(isRpcMissing({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isRpcMissing({ code: '23505', message: 'opening_balance_exists' })).toBe(false);
    expect(isRpcMissing(null)).toBe(false);
  });
});

describe('api: 013 yo‘q server', async () => {
  const { postSupplierDebt } = await vi.importActual<typeof import('@/lib/data/purchases')>('@/lib/data/purchases');
  const { reverseSale } = await vi.importActual<typeof import('@/lib/data/api')>('@/lib/data/api');

  it('postSupplierDebt: RpcMissingError, hech narsa o‘qilmaydi', async () => {
    const { sb, reads } = fakeSb(PGRST202);
    await expect(postSupplierDebt(sb, { shopId: 's', documentId: 'd', clientOpId: 'o', supplierId: 'x', amount: 5n })).rejects.toBeInstanceOf(RpcMissingError);
    expect(reads).toEqual([]);
  });
  it('postSupplierDebt: boshqa server xatosi RpcMissingError emas', async () => {
    const { sb } = fakeSb({ code: '42501', message: 'supplier_not_in_shop' });
    const p = postSupplierDebt(sb, { shopId: 's', documentId: 'd', clientOpId: 'o', supplierId: 'x', amount: 5n });
    await expect(p).rejects.not.toBeInstanceOf(RpcMissingError);
  });
  it('reverseSale (to‘lov bilan): aniq ko‘rsatma, avtomatik reverse_sale chaqirilmaydi', async () => {
    const { sb, calls } = fakeSb({ ...PGRST202, message: 'Could not find the function public.reverse_sale_with_payments' });
    await expect(reverseSale(sb, 's', 'doc', 'op', 'narx xato', ['p1'])).rejects.toThrow(/belgisi olib tashlandi/);
    expect(calls.map((c) => c.fn)).toEqual(['reverse_sale_with_payments']);
  });
});

describe('refundAfterError: 013 yo‘q bo‘lsa tanlov ochiladi va olib tashlanadi', async () => {
  const { refundAfterError } = await import('@/lib/saleReversal');
  it('RpcMissingError: qulf ochiladi, belgi olinadi (savdogar yana tasdiqlaydi)', () => {
    expect(refundAfterError(new RpcMissingError('reverse_sale_with_payments'))).toEqual({ attempted: false, refund: false });
  });
  it('boshqa xato (tarmoq, server rad etdi): tanlov qulflangan qoladi', () => {
    expect(refundAfterError(new Error('Failed to fetch'))).toBeNull();
    expect(refundAfterError({ code: '42501', message: 'forbidden' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hook: ta'minotchi daftar yozuvi 013 siz
// ---------------------------------------------------------------------------
const rpc = vi.hoisted(() => ({ debt: vi.fn<(sb: unknown, a: Record<string, unknown>) => Promise<string>>(), opening: vi.fn<(sb: unknown, a: Record<string, unknown>) => Promise<string>>(async () => 'o1') }));
vi.mock('@/lib/data/purchases', async (orig) => ({ ...(await orig<typeof import('@/lib/data/purchases')>()), postSupplierDebt: rpc.debt, postSupplierOpeningBalance: rpc.opening }));
vi.mock('@/components/ShopDataProvider', () => ({ useShop: () => ({ shopId: 'shop', reload: async () => {} }) }));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({}) }));

beforeEach(() => {
  rpc.debt.mockReset();
  rpc.opening.mockClear();
});
afterEach(cleanup);

describe('useLedgerNoteSubmit: 013 yo‘q', async () => {
  const { useLedgerNoteSubmit } = await import('@/components/panel/usePanelActions');
  const run = async () => {
    const { result } = renderHook(() => useLedgerNoteSubmit({ kind: 'supplier', partnerId: 's1', text: 'kirim 1 000 000', balance: 0n, reloadBooks: async () => {} }));
    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });
    return { ok, result };
  };

  it('RPC yo‘q: avvalgi yo‘l (ochilish qoldig‘i) o‘sha kalitlar bilan, yozuv saqlanadi', async () => {
    rpc.debt.mockRejectedValueOnce(new RpcMissingError('post_supplier_debt'));
    const { ok } = await run();
    expect(ok).toBe(true);
    expect(rpc.opening).toHaveBeenCalledTimes(1);
    expect(rpc.opening.mock.calls[0]![1]).toEqual(rpc.debt.mock.calls[0]![1]);
    expect(rpc.opening.mock.calls[0]![1]).toMatchObject({ supplierId: 's1', amount: 1_000_000n });
  });
  it('RPC bor (013 qo‘llangan): faqat post_supplier_debt, ochilish qoldig‘i chaqirilmaydi', async () => {
    rpc.debt.mockResolvedValueOnce('d1');
    const { ok } = await run();
    expect(ok).toBe(true);
    expect(rpc.opening).not.toHaveBeenCalled();
  });
  it('boshqa xato: fallback yo‘q, xato ko‘rsatiladi', async () => {
    rpc.debt.mockRejectedValueOnce(Object.assign(new Error('supplier_not_in_shop'), { code: '42501' }));
    const { ok, result } = await run();
    expect(ok).toBe(false);
    expect(rpc.opening).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });
});
