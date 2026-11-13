/**
 * Daftar varag'i RPC kontrakti (007_purchases.sql): web yuboradigan argument nomlari SQL imzosi bilan bir xil.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { fetchSqlBalance } from '../src/lib/data/partnerLedger';
import { recordSupplierPayment, reversePurchase, voidSupplierPayment } from '../src/lib/data/supplierPayments';

// 007 (daftar RPC'lari) + 017 (F3: reverse_purchase_with_payments)
const SQL = ['007_purchases.sql', '017_audit_tuzatish.sql'].map((f) => readFileSync(path.resolve(__dirname, '../../../supabase/migrations', f), 'utf8')).join('\n');

function signature(fn: string): { all: string[]; required: string[] } {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(([\\s\\S]*?)\\)\\s*(?:RETURNS|LANGUAGE)`, 'i').exec(SQL);
  if (!m?.[1]) throw new Error(`${fn} topilmadi`);
  const params = m[1].replace(/now\(\)/g, 'now').split(',').map((s) => s.trim()).filter(Boolean).map((p) => ({ name: p.split(/\s+/)[0]!, hasDefault: /\bDEFAULT\b/i.test(p) }));
  return { all: params.map((p) => p.name), required: params.filter((p) => !p.hasDefault).map((p) => p.name) };
}

function fake(rows: Record<string, unknown>, rpcResult: unknown = 'id-1') {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const k of ['select', 'eq']) b[k] = () => b;
    b.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
    return b;
  };
  const sb = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: rpcResult, error: null };
    },
    from: (t: string) => builder(t),
  } as unknown as SupabaseClient;
  return { sb, calls };
}

function expectMatches(fn: string, args: Record<string, unknown>) {
  const sig = signature(fn);
  for (const k of Object.keys(args)) expect(sig.all, `${fn}: ${k} SQL imzosida yo'q`).toContain(k);
  for (const k of sig.required) expect(Object.keys(args), `${fn}: majburiy ${k} yuborilmagan`).toContain(k);
}

describe('daftar RPC imzolari (007)', () => {
  it('record_supplier_payment', async () => {
    const { sb, calls } = fake({ supplier_payments: { id: 'id-1', amount: '500' } });
    await recordSupplierPayment(sb, { shopId: 's', paymentId: 'p', clientOpId: 'o', supplierId: 'x', amount: 500n, method: 'naqd', note: null, createdAt: '2026-11-01T00:00:00Z' });
    expectMatches('record_supplier_payment', calls[0]!.args);
    expect(calls[0]!.args.p_amount).toBe('500');
  });

  it("record_supplier_payment: server boshqa summa qaytarsa to'xtaydi", async () => {
    const { sb } = fake({ supplier_payments: { id: 'id-1', amount: '999' } });
    await expect(recordSupplierPayment(sb, { shopId: 's', paymentId: 'p', clientOpId: 'o', supplierId: 'x', amount: 500n, method: 'naqd', note: null })).rejects.toThrow();
  });

  it('void_supplier_payment va reverse_purchase', async () => {
    const a = fake({ supplier_payment_voids: { id: 'v' } });
    await voidSupplierPayment(a.sb, 's', 'p', ' xato kiritilgan ');
    expectMatches('void_supplier_payment', a.calls[0]!.args);
    expect(a.calls[0]!.args.p_reason).toBe('xato kiritilgan');
    const b = fake({ purchase_documents: { status: 'reversed' } });
    // F3 (017): kirim va uning to'lovi bitta RPC'da bekor qilinadi
    expect(await reversePurchase(b.sb, 's', 'd', 'op', 'xato')).toBe('with_payment');
    expect(b.calls[0]!.fn).toBe('reverse_purchase_with_payments');
    expectMatches('reverse_purchase_with_payments', b.calls[0]!.args);
    expect(b.calls[0]!.args.p_void_payment).toBe(true);
  });

  it('reverse_purchase: server bekor qilishni tasdiqlamasa xato', async () => {
    const { sb } = fake({ purchase_documents: { status: 'posted' } });
    await expect(reversePurchase(sb, 's', 'd', 'op', 'xato')).rejects.toThrow();
  });

  it("partner_statement: ikkinchi yo'l argumentlari SQL bilan bir xil, butun davr Ostatka'si", async () => {
    const { sb, calls } = fake({}, [{ opening: 0, goods: 10, total: 10, paid: 4, balance: 6 }]);
    expect(await fetchSqlBalance(sb, 's', 'customer', 'c')).toBe(6n);
    expectMatches('partner_statement', calls[0]!.args);
  });

  it("partner_statement yetib bo'lmasa null (demo, 007 yo'q)", async () => {
    const sb = { rpc: async () => ({ data: null, error: { message: 'demo_read_only' } }) } as unknown as SupabaseClient;
    expect(await fetchSqlBalance(sb, 's', 'supplier', 'x')).toBeNull();
  });
});
