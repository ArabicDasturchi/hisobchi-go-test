/**
 * Demo rejimi (npm run demo): soxta ma'lumot va soxta Supabase klienti veb panelning haqiqiy data qatlami (api.ts, books.ts)
 * orqali o'qiladi. Raqamlar: savdo 385 000; kirim 1 450 000 / berildi 1 000 000 / ostatka 450 000.
 */
import { describe, expect, it } from 'vitest';
import { listCustomers, listProducts, listSales, postSale, getMembership } from '@/lib/data/api';
import { loadBooks } from '@/lib/data/books';
import { buildDemoTables, DEMO_USER_ID } from '@/lib/demo/seed';
import { createFakeSupabase, splitColumns } from '@/lib/demo/fakeSupabase';

const setup = () => {
  const db = buildDemoTables();
  const sb = createFakeSupabase(db);
  const shopId = (db.shops![0] as { id: string }).id;
  return { db, sb, shopId };
};

describe('demo ma\'lumot', () => {
  it('a\'zolik: do\'kon embed bilan o\'qiladi', async () => {
    const { sb, shopId } = setup();
    const m = await getMembership(sb, DEMO_USER_ID);
    expect(m?.shop.id).toBe(shopId);
    expect(m?.role).toBe('owner');
  });

  it('savdolar: 385 000 va bir martalik 70 500; mijozlar va tovarlar', async () => {
    const { sb, shopId } = setup();
    const sales = await listSales(sb, shopId);
    expect(sales.map((s) => s.subtotal).sort((a, b) => (a < b ? -1 : 1))).toEqual([70_500n, 385_000n]);
    const customers = await listCustomers(sb, shopId);
    expect(customers.filter((c) => c.kind === 'one_time')).toHaveLength(1);
    const products = await listProducts(sb, shopId);
    expect(products.length).toBeGreaterThanOrEqual(8);
    expect(products.length).toBeLessThanOrEqual(10);
  });

  it('kirim 1 450 000, berildi 1 000 000, qoldiq: guruch 90 kg', async () => {
    const { sb, shopId } = setup();
    const b = await loadBooks(sb, shopId);
    expect(b.purchases).toHaveLength(1);
    expect(b.purchases[0]!.subtotal).toBe(1_450_000n);
    expect(b.payments.reduce((s, p) => s + p.amount, 0n)).toBe(1_000_000n);
    const guruch = b.stock.find((s) => s.name === 'Guruch');
    expect(guruch?.qty_milli).toBe(90_000n);
    expect(b.stock.every((s) => s.qty_milli >= 0n)).toBe(true);
  });

  it('yozish yopiq: RPC demo_read_only qaytaradi, hech narsa saqlanmaydi', async () => {
    const { sb, shopId, db } = setup();
    const before = db.documents!.length;
    await expect(
      postSale(sb, { shopId, saleId: 'x', clientOpId: 'y', customerId: null, note: null, lines: [{ product_name: 'A', qty_milli: 1000n, unit: 'kg', unit_price: 1n }], clientTotal: 1n }),
    ).rejects.toThrow();
    expect(db.documents!.length).toBe(before);
  });

  it('mavjud bo\'lmagan ustun 42703 xatosi (hasCustomerKind mantiqi bilan mos)', async () => {
    const { sb, shopId } = setup();
    const r = await sb.from('customers').select('yoq_ustun').eq('shop_id', shopId).limit(1);
    expect((r.error as { code?: string }).code).toBe('42703');
  });
});

describe('splitColumns', () => {
  it('qavs ichidagi vergulni bo\'lmaydi', () => {
    expect(splitColumns('role, user_id, shop:shops(id, name), amount::text')).toEqual(['role', 'user_id', 'shop:shops(id, name)', 'amount::text']);
  });
});
