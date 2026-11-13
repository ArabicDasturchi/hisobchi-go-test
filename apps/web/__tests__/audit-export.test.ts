/**
 * F3: o'zgarishlar tarixi matni, kirimni to'lovi bilan bekor qilish (016 va eski server).
 * B5: to'liq CSV eksport. Kutilgan qiymatlar qo'lda yozilgan.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { describeAudit, describeChanges } from '@/lib/auditView';
import { reversePurchase } from '@/lib/data/supplierPayments';
import { buildExports } from '@/lib/exportAll';
import type { BooksData } from '@/lib/data/books';

const nb = (s: string) => s.replace(/[\u00a0\u202f\u2009]/g, ' ');

describe('auditView', () => {
  it('tovar tuzatishi: narx va nom o‘zgarishi o‘qiladigan matnda', () => {
    const d = describeAudit({ action: 'product_updated', entity_type: 'product', details: { name: 'Chirmoq katta', changes: { last_price: { from: 13000, to: 14000 }, name: { from: 'Chirmoq', to: 'Chirmoq katta' } } } });
    expect(d.title).toBe('Tovar tuzatildi «Chirmoq katta»');
    expect(nb(d.detail)).toBe("narxi: 13 000 so'm → 14 000 so'm; nomi: Chirmoq → Chirmoq katta");
  });
  it('telefon qiymati yo‘q — faqat «o‘zgardi»', () => {
    expect(describeChanges({ phone: { changed: true }, is_active: { from: true, to: false } })).toBe("telefoni o'zgardi; holati: faol → arxivda");
  });
  it('bekor qilishlar sabab va summa bilan', () => {
    expect(nb(describeAudit({ action: 'sale_reversed', entity_type: 'sale', details: { amount: 130000, reason: 'narx xato' } }).detail)).toBe("Summa: 130 000 so'm. Sabab: narx xato");
    expect(describeAudit({ action: 'purchase_reversed', entity_type: 'purchase', details: { amount: '200000', reason: 'qaytarildi' } }).title).toBe('Kirim bekor qilindi');
    expect(describeAudit({ action: 'stock_adjusted', entity_type: 'product', details: { qty_milli: -2000, reason: 'buzildi' } }).detail).toBe('Farq: -2. Sabab: buzildi');
    expect(describeAudit({ action: 'draft_converted', entity_type: 'agent_draft', details: {} }).title).toBe('AI qoralamasi savatga olindi');
    expect(describeAudit({ action: 'noma_lum', entity_type: null, details: null }).title).toBe('noma_lum');
  });
});

function fakeSb(firstError: unknown) {
  const calls: string[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) q[m] = () => q;
  q.maybeSingle = async () => ({ data: { status: 'reversed' }, error: null });
  const sb = {
    rpc: async (fn: string) => {
      calls.push(fn);
      return fn === 'reverse_purchase_with_payments' && firstError ? { data: null, error: firstError } : { data: 'rev', error: null };
    },
    from: () => q,
  } as unknown as SupabaseClient;
  return { sb, calls };
}

describe('kirimni bekor qilish (F3)', () => {
  it('016 bor: bitta RPC, to‘lov ham bekor', async () => {
    const { sb, calls } = fakeSb(null);
    expect(await reversePurchase(sb, 's', 'd', 'op', 'qaytarildi')).toBe('with_payment');
    expect(calls).toEqual(['reverse_purchase_with_payments']);
  });
  it('016 yo‘q (RPC topilmadi): eski yo‘l, natija «legacy» (savdogarga aytiladi)', async () => {
    const { sb, calls } = fakeSb({ code: 'PGRST202', message: 'Could not find the function public.reverse_purchase_with_payments' });
    expect(await reversePurchase(sb, 's', 'd', 'op', 'qaytarildi')).toBe('legacy');
    expect(calls).toEqual(['reverse_purchase_with_payments', 'reverse_purchase']);
  });
  it('boshqa server xatosi jim eski yo‘lga o‘tmaydi', async () => {
    const { sb, calls } = fakeSb({ code: 'P0001', message: 'already_reversed' });
    await expect(reversePurchase(sb, 's', 'd', 'op', 'qaytarildi')).rejects.toBeTruthy();
    expect(calls).toEqual(['reverse_purchase_with_payments']);
  });
});

describe('to‘liq eksport (B5)', () => {
  const books: BooksData = {
    suppliers: [{ id: 'sp', name: 'Rahim aka', phone: null, notes: null, is_active: true, created_at: '2026-11-01T00:00:00Z' }],
    purchases: [{ id: 'p1', supplier_id: 'sp', doc_date: '2026-11-10', status: 'posted', subtotal: 200000n, created_at: '2026-11-10T09:00:00Z' }],
    lines: [{ document_id: 'p1', line_index: 0, product_id: 'c1', product_name: 'Chirmoq', qty_milli: 20000n, unit: 'dona', unit_cost: 10000n, line_total: 200000n }],
    payments: [{ id: 'sp1', supplier_id: 'sp', amount: 150000n, method: 'naqd', note: null, created_at: '2026-11-10T09:00:00Z', voided: false }],
    stock: [{ product_id: 'c1', name: 'Chirmoq', unit: 'dona', is_active: true, qty_milli: 20000n, cost_price: 10000n, sale_price: 13000n }],
  };
  const files = buildExports({
    sales: [{ id: 's1', customer_id: 'c', status: 'reversed', subtotal: 385000n, created_at: '2026-11-12T10:00:00Z', posted_at: null, created_by: 'u' }],
    payments: [],
    customers: [{ id: 'c', name: '=HYPERLINK("x")', phone: '+998', notes: null, is_active: true, source: 'app', kind: 'regular', created_at: '2026-11-01T00:00:00Z', updated_at: '' }, { id: 'w', name: 'Bir martalik', phone: null, notes: null, is_active: true, source: 'app', kind: 'one_time', created_at: '2026-11-01T00:00:00Z', updated_at: '' }],
    products: [{ id: 'c1', name: 'Chirmoq', unit: 'dona', last_price: 13000n, cost_price: 10000n, is_active: true, source: 'app', created_at: '', updated_at: '' }],
    books,
  }, '2026-11-12');

  it('9 ta fayl, nomida sana', () => {
    expect(files.map((f) => f.name)).toEqual(['savdolar', 'tolovlar', 'mijozlar', 'mahsulotlar', 'kirimlar', 'kirim_qatorlari', 'taminotchi_tolovlari', 'taminotchilar', 'ombor'].map((n) => `${n}_2026-11-12.csv`));
  });
  it('savdo summasi va holati; bir martalik mijoz ro‘yxatda yo‘q; formula in’yeksiyasi zararsiz', () => {
    const sales = files[0]!.csv;
    expect(sales).toContain('s1;2026-11-12 10:00:00;');
    expect(sales).toContain('Bekor qilingan;385000');
    const customers = files[2]!;
    expect(customers.rows).toBe(1);
    expect(customers.csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('kitoblar yuklanmagan bo‘lsa faqat asosiy 4 fayl', () => {
    expect(buildExports({ sales: [], payments: [], customers: [], products: [], books: null }, 'x')).toHaveLength(4);
  });
});
