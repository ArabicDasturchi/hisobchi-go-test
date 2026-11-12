// @vitest-environment jsdom
/**
 * W2: ta'minotchiga «Daftarga yozish» (tovarsiz qarz) ikkinchi marta ham ishlaydi.
 * Avval ochilish qoldig'i RPC'si chaqirilardi (bir ta'minotchiga bitta yozuv) — 2-yozuv `opening_balance_exists`.
 * Endi `post_supplier_debt` (013, kind='debt', bir nechta). Qarz ikkala hisob yo'lida o'qiladi, kirim ro'yxatiga kirmaydi.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseDoc } from '@/lib/data/books';

const SQL_FILE = path.resolve(__dirname, '../../../supabase/migrations/013_bekor_tolov_va_qarz_yozuvi.sql');
const HAS_SQL = existsSync(SQL_FILE);
/** 013 dagi imzo (SQL PR #43 bilan bir xil); fayl main'ga tushgach pastdagi test solishtiradi */
const EXPECTED = { all: ['p_shop_id', 'p_document_id', 'p_client_op_id', 'p_supplier_id', 'p_amount', 'p_doc_date'], required: ['p_shop_id', 'p_document_id', 'p_client_op_id', 'p_supplier_id', 'p_amount'] };
function signature(): { all: string[]; required: string[] } {
  if (!HAS_SQL) return EXPECTED;
  const m = /CREATE OR REPLACE FUNCTION post_supplier_debt\(([^)]*)\)/i.exec(readFileSync(SQL_FILE, 'utf8'));
  const params = m![1]!.split(',').map((s) => s.trim()).filter(Boolean).map((p) => ({ name: p.split(/\s+/)[0]!, hasDefault: /\bDEFAULT\b/i.test(p) }));
  return { all: params.map((p) => p.name), required: params.filter((p) => !p.hasDefault).map((p) => p.name) };
}

// ---------------------------------------------------------------------------
// api: postSupplierDebt
// ---------------------------------------------------------------------------
describe('postSupplierDebt', async () => {
  const { postSupplierDebt } = await vi.importActual<typeof import('@/lib/data/purchases')>('@/lib/data/purchases');
  const fake = (doc: unknown) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => ({ data: doc, error: null });
    const sb = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: args.p_document_id, error: null }), from: () => b } as unknown as SupabaseClient;
    return { sb, calls };
  };
  const args = { shopId: 'shop', documentId: 'd1', clientOpId: 'op1', supplierId: 's1', amount: 1_000_000n };

  it.skipIf(!HAS_SQL)('testdagi kutilgan imzo 013 bilan bir xil', () => expect(signature()).toEqual(EXPECTED));
  it('post_supplier_debt chaqiriladi, argumentlar SQL imzosiga mos, summa string', async () => {
    const { sb, calls } = fake({ subtotal: '1000000', status: 'posted', kind: 'debt' });
    await postSupplierDebt(sb, args);
    expect(calls.map((c) => c.fn)).toEqual(['post_supplier_debt']);
    const sig = signature();
    for (const k of Object.keys(calls[0]!.args)) expect(sig.all).toContain(k);
    for (const k of sig.required) expect(Object.keys(calls[0]!.args)).toContain(k);
    expect(calls[0]!.args.p_amount).toBe('1000000');
  });
  it('server boshqa tur/summa qaytarsa xato (jim o‘tmaydi)', async () => {
    await expect(postSupplierDebt(fake({ subtotal: '1000000', status: 'posted', kind: 'opening' }).sb, args)).rejects.toThrow();
    await expect(postSupplierDebt(fake({ subtotal: '5', status: 'posted', kind: 'debt' }).sb, args)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Hisob va ko'rinish: 'debt' qarzga qo'shiladi, kirim emas
// ---------------------------------------------------------------------------
describe("'debt' turi daftar va omborda", async () => {
  const { supplierTotals } = await import('@/lib/data/books');
  const { supplierEntries } = await import('@/lib/data/partnerLedger');
  const { receiptDays } = await import('@/lib/warehouseView');
  const doc = (over: Partial<PurchaseDoc>): PurchaseDoc => ({ id: 'x', supplier_id: 's1', doc_date: '2026-11-11', status: 'posted', subtotal: 0n, created_at: '2026-11-11T10:00:00Z', kind: 'purchase', ...over });
  const purchases = [doc({ id: 'o', kind: 'opening', subtotal: 500_000n }), doc({ id: 'd1', kind: 'debt', subtotal: 200_000n }), doc({ id: 'd2', kind: 'debt', subtotal: 300_000n }), doc({ id: 'p', subtotal: 100_000n })];

  it('qarz: 500 000 + 200 000 + 300 000 + 100 000 = 1 100 000', () => {
    expect(supplierTotals({ purchases, payments: [] }).get('s1')?.outstanding).toBe(1_100_000n);
  });
  it('daftar: qarz yozuvi o‘z yorlig‘i bilan (kirim deb emas)', () => {
    const refs = supplierEntries('s1', { purchases, payments: [] }).map((e) => [e.id, e.ref]);
    expect(refs).toEqual(expect.arrayContaining([['d1', 'debt'], ['d2', 'debt'], ['p', 'purchase'], ['o', 'opening']]));
  });
  it('ombor «Kirim» ro‘yxatiga faqat haqiqiy kirim tushadi', () => {
    const r = receiptDays(purchases, [], new Map([['s1', 'Rahim']]), { range: { from: '2026-11-01', to: '2026-11-30' } });
    expect(r.count).toBe(1);
    expect(r.total).toBe(100_000n);
  });
});

// ---------------------------------------------------------------------------
// Hook: useLedgerNoteSubmit (ta'minotchi) — ikki marta yozish
// ---------------------------------------------------------------------------
const rpc = vi.hoisted(() => ({
  postSupplierDebt: vi.fn(async (_sb: unknown, a: { documentId: string }) => a.documentId),
  postSupplierOpeningBalance: vi.fn(async () => 'o'),
  recordSupplierPayment: vi.fn(async () => 'p'),
}));
vi.mock('@/lib/data/purchases', async (orig) => ({ ...(await orig<typeof import('@/lib/data/purchases')>()), postSupplierDebt: rpc.postSupplierDebt, postSupplierOpeningBalance: rpc.postSupplierOpeningBalance }));
vi.mock('@/lib/data/supplierPayments', async (orig) => ({ ...(await orig<typeof import('@/lib/data/supplierPayments')>()), recordSupplierPayment: rpc.recordSupplierPayment }));
vi.mock('@/components/ShopDataProvider', () => ({ useShop: () => ({ shopId: 'shop', reload: async () => {} }) }));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({}) }));

beforeEach(() => {
  rpc.postSupplierDebt.mockClear();
  rpc.postSupplierOpeningBalance.mockClear();
  rpc.recordSupplierPayment.mockClear();
});
afterEach(cleanup);

describe('useLedgerNoteSubmit: ta‘minotchi', async () => {
  const { useLedgerNoteSubmit } = await import('@/components/panel/usePanelActions');
  const { previewLedgerNote } = await import('@/lib/ledgerNote');

  it('tovarsiz qarz ikki marta: ikkalasi ham post_supplier_debt (ochilish qoldig‘i emas), har biri yangi kalit bilan', async () => {
    const text = 'kirim 1 000 000';
    expect(previewLedgerNote(0n, text).ok).toBe(true);
    const { result } = renderHook(() => useLedgerNoteSubmit({ kind: 'supplier', partnerId: 's1', text, balance: 0n, reloadBooks: async () => {} }));
    let ok1 = false;
    let ok2 = false;
    await act(async () => {
      ok1 = await result.current.submit();
    });
    await act(async () => {
      ok2 = await result.current.submit();
    });
    expect(ok1 && ok2).toBe(true);
    expect(rpc.postSupplierOpeningBalance).not.toHaveBeenCalled();
    expect(rpc.postSupplierDebt).toHaveBeenCalledTimes(2);
    const [a, b] = rpc.postSupplierDebt.mock.calls.map((c) => c[1] as { documentId: string; clientOpId: string; amount: bigint; supplierId: string });
    expect(a).toMatchObject({ supplierId: 's1', amount: 1_000_000n });
    expect(b!.clientOpId).not.toBe(a!.clientOpId);
  });
});
