// @vitest-environment jsdom
/**
 * W1: savdoni bekor qilishda shu savdo bilan kelgan to'lov ham BITTA tranzaksiyada bekor qilinadi.
 * - salePayments: qaysi to'lovlar savdoga bog'langan (faqat aniq belgilar, taxmin yo'q);
 * - reverseSale: to'lov tanlansa reverse_sale_with_payments (013), argumentlar SQL imzosiga mos, natija tekshiriladi;
 * - RefundChoice: standart belgilangan, olib tashlansa kredit ogohlantirishi.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefundChoice } from '@/components/sale/RefundChoice';
import { reverseSale } from '@/lib/data/api';
import type { Payment } from '@/lib/data/types';
import { legacySalePaymentNote, salePayments } from '@/lib/saleReversal';

afterEach(cleanup);

// 013 migratsiyasi alohida SQL PR'da (ISH-TARTIBI 4-band). U main'ga tushgach imzo fayldan ham solishtiriladi
const SQL_FILE = path.resolve(__dirname, '../../../supabase/migrations/013_bekor_tolov_va_qarz_yozuvi.sql');
const HAS_SQL = existsSync(SQL_FILE);
/** 013 dagi imzo (SQL PR bilan bir xil); fayl bo'lsa pastdagi test ikkalasini solishtiradi */
const EXPECTED = { all: ['p_shop_id', 'p_document_id', 'p_client_op_id', 'p_reason', 'p_void_payment_ids'], required: ['p_shop_id', 'p_document_id', 'p_client_op_id', 'p_reason'] };

function signature(fn: string): { all: string[]; required: string[] } {
  if (!HAS_SQL) return EXPECTED;
  const m = new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(([^)]*)\\)`, 'i').exec(readFileSync(SQL_FILE, 'utf8'));
  if (!m?.[1]) throw new Error(`${fn} topilmadi`);
  const params = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((p) => ({ name: p.split(/\s+/)[0]!, hasDefault: /\bDEFAULT\b/i.test(p) }));
  return { all: params.map((p) => p.name), required: params.filter((p) => !p.hasDefault).map((p) => p.name) };
}

const SALE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const sale = { id: SALE_ID, customer_id: 'c1', subtotal: 100_000n, client_op_id: 'op-1' };
const pay = (over: Partial<Payment>): Payment => ({ id: 'p', customer_id: 'c1', amount: 100_000n, method: 'naqd', note: null, created_by: 'u', created_at: '2026-11-11T10:00:00Z', void: null, client_op_id: null, ...over });

describe('salePayments: savdoga bog‘langan to‘lovlar', () => {
  it('post_sale(p_paid) to‘lovi client_op_id bo‘yicha topiladi', () => {
    expect(salePayments(sale, [pay({ id: 'p1', client_op_id: 'sale-pay:op-1' })])).toEqual({ ids: ['p1'], total: 100_000n });
  });
  it('eski veb oqimi: izoh aynan «Savdo #XXXXXXXX uchun»', () => {
    expect(legacySalePaymentNote(SALE_ID)).toBe('Savdo #AAAAAAAA uchun');
    expect(salePayments(sale, [pay({ id: 'p2', amount: 40_000n, note: 'Savdo #AAAAAAAA uchun' })])).toEqual({ ids: ['p2'], total: 40_000n });
  });
  it('bog‘lanmaydi: boshqa mijoz, bekor qilingan, boshqa izoh, boshqa op', () => {
    const list = [
      pay({ id: 'x1', customer_id: 'c2', client_op_id: 'sale-pay:op-1' }),
      pay({ id: 'x2', client_op_id: 'sale-pay:op-1', void: { id: 'v', payment_id: 'x2', reason: 'r', created_by: 'u', created_at: '' } }),
      pay({ id: 'x3', note: 'Savdo #BBBBBBBB uchun' }),
      pay({ id: 'x4', client_op_id: 'sale-pay:op-2' }),
      pay({ id: 'x5', note: null }),
    ];
    expect(salePayments(sale, list)).toEqual({ ids: [], total: 0n });
  });
  it('mijozsiz va bir martalik mijoz savdosi: server o‘zi hal qiladi, ro‘yxat bo‘sh', () => {
    expect(salePayments({ ...sale, customer_id: null }, [pay({ client_op_id: 'sale-pay:op-1' })]).ids).toEqual([]);
    expect(salePayments(sale, [pay({ client_op_id: 'sale-pay:op-1' })], { walkin: true }).ids).toEqual([]);
  });
  it('yig‘indi savdodan oshsa hech narsa taklif qilinmaydi (server ham rad etadi)', () => {
    const list = [pay({ id: 'a', client_op_id: 'sale-pay:op-1' }), pay({ id: 'b', amount: 1n, note: 'Savdo #AAAAAAAA uchun' })];
    expect(salePayments(sale, list)).toEqual({ ids: [], total: 0n });
  });
});

function fakeClient(opts: { voided?: string[]; status?: string } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'order', 'range']) b[k] = () => b;
    b.in = () => Promise.resolve({ data: table === 'payment_voids' ? (opts.voided ?? []).map((payment_id) => ({ payment_id })) : [], error: null });
    b.maybeSingle = async () => ({ data: table === 'documents' ? { status: opts.status ?? 'reversed' } : null, error: null });
    return b;
  };
  const sb = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: 'rev-1', error: null };
    }),
    from: (table: string) => builder(table),
  } as unknown as SupabaseClient;
  return { sb, calls };
}

describe('reverseSale: atomik RPC (013)', () => {
  it.skipIf(!HAS_SQL)('testdagi kutilgan imzo 013 migratsiyasi bilan bir xil', () => {
    expect(signature('reverse_sale_with_payments')).toEqual(EXPECTED);
  });
  it('to‘lov tanlansa reverse_sale_with_payments chaqiriladi, argumentlar SQL imzosiga mos', async () => {
    const { sb, calls } = fakeClient({ voided: ['p1'] });
    await reverseSale(sb, 'shop', SALE_ID, 'op-r', ' narx xato ', ['p1']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe('reverse_sale_with_payments');
    const sig = signature('reverse_sale_with_payments');
    for (const k of Object.keys(calls[0]!.args)) expect(sig.all).toContain(k);
    for (const k of sig.required) expect(Object.keys(calls[0]!.args)).toContain(k);
    expect(calls[0]!.args).toMatchObject({ p_shop_id: 'shop', p_document_id: SALE_ID, p_client_op_id: 'op-r', p_reason: 'narx xato', p_void_payment_ids: ['p1'] });
  });
  it('to‘lovsiz: avvalgi reverse_sale (imzo o‘zgarmagan)', async () => {
    const { sb, calls } = fakeClient();
    await reverseSale(sb, 'shop', SALE_ID, 'op-r', 'narx xato');
    expect(calls.map((c) => c.fn)).toEqual(['reverse_sale']);
    expect(calls[0]!.args).not.toHaveProperty('p_void_payment_ids');
  });
  it('server to‘lov bekor qilinishini tasdiqlamasa xato (jim o‘tmaydi)', async () => {
    const { sb } = fakeClient({ voided: [] });
    await expect(reverseSale(sb, 'shop', SALE_ID, 'op-r', 'narx xato', ['p1'])).rejects.toThrow(/to'lov bekor qilinishini tasdiqlamadi/);
  });
  it('savdo reversed bo‘lmasa xato', async () => {
    const { sb } = fakeClient({ status: 'posted', voided: ['p1'] });
    await expect(reverseSale(sb, 'shop', SALE_ID, 'op-r', 'narx xato', ['p1'])).rejects.toThrow(/tasdiqlamadi/);
  });
});

describe('RefundChoice', () => {
  it('to‘lov yo‘q bo‘lsa ko‘rinmaydi', () => {
    render(<RefundChoice total={0n} checked onChange={() => {}} />);
    expect(screen.queryByTestId('refund-choice')).toBeNull();
  });
  it('standart belgilangan; olib tashlansa kredit ogohlantirishi chiqadi', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RefundChoice total={100_000n} checked onChange={onChange} />);
    const box = screen.getByRole('checkbox');
    expect(box).toHaveProperty('checked', true);
    expect(screen.queryByTestId('refund-kept')).toBeNull();
    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
    rerender(<RefundChoice total={100_000n} checked={false} onChange={onChange} />);
    expect(screen.getByTestId('refund-kept').textContent).toMatch(/kredit/);
  });
});
