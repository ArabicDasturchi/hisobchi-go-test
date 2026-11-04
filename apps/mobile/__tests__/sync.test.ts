/**
 * Bulutga push (bir tomonlama) — soxta (fake) bulut klienti bilan, lokal ma'lumot haqiqiy SQLite'da.
 * Haqiqiy Supabase bilan sinov — alohida (credential talab qiladi); server mantiqi
 * supabase/tests/10_security_isolation.test.sql da lokal PostgreSQL'da sinalgan.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CloudError, toCloudError, type CloudClient, type CloudResult } from '../src/backend/cloud';
import { ALL_ENTITIES, pendingCount, pushToCloud, type SyncEntity } from '../src/backend/sync';
import { createCatalog } from '../src/data/catalog';
import { createLedger, type Ledger, type SaleLineInput } from '../src/data/ledger';
import { migrate } from '../src/data/schema';
import { openMemoryDb } from './node-sqlite';

const line = (name: string, price: bigint): SaleLineInput => ({ productName: name, qtyMilli: 1000n, unit: 'dona', unitPrice: price, rawText: null });

class FakeCloud implements CloudClient {
  calls: { fn: string; args: Record<string, unknown> }[] = [];
  failOn: ((fn: string, n: number) => CloudResult<unknown>['error']) | null = null;
  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<CloudResult<T>> {
    this.calls.push({ fn, args });
    const err = this.failOn?.(fn, this.calls.length) ?? null;
    return { data: err ? null : (('id-' + this.calls.length) as T), error: err };
  }
  async upsert(table: string, rows: Record<string, unknown>[]) {
    this.calls.push({ fn: `upsert:${table}`, args: { rows } });
    return { data: null, error: null };
  }
  async selectAll<T>(): Promise<CloudResult<T[]>> {
    return { data: [], error: null };
  }
}

const ZERO = Object.fromEntries(ALL_ENTITIES.map((e) => [e, 0])) as Record<SyncEntity, number>;

let db: ReturnType<typeof openMemoryDb>;
let ledger: Ledger;
let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 29, 8, 0, clock++)).toISOString();

beforeEach(async () => {
  db = openMemoryDb();
  await migrate(db);
  clock = 0;
  ledger = createLedger(db, { newId: () => randomUUID(), now });
});

async function seed() {
  const cid = await ledger.createCustomer({ name: 'Akmal', phone: '901', note: 'Chorsu' });
  await createCatalog(db, { newId: () => randomUUID(), now }).saveProduct({ name: 'Non', unit: 'dona', unitPrice: 4000n });
  const sale = await ledger.postSale({ clientOpId: 'op-s', customerId: cid, rawInput: 'x', lines: [line('non', 10000n)] });
  const pay = await ledger.recordPayment({ customerId: cid, amount: 10000n, method: 'naqd', clientOpId: 'op-p' });
  await ledger.reverseSale({ saleId: sale.saleId, reason: 'qaytarildi', clientOpId: 'op-r' });
  await ledger.voidPayment({ paymentId: pay.paymentId, reason: 'xato' });
  return { cid, sale, pay };
}

describe('pushToCloud', () => {
  it("vaqt tartibida yuboradi, pul string, server hisobiga klient jamisi bilan", async () => {
    const { cid, sale } = await seed();
    const cloud = new FakeCloud();
    const res = await pushToCloud(db, cloud, 'shop-1', { now });
    expect(res.error).toBeNull();
    expect(res.pushed).toEqual({ ...ZERO, customer: 1, product: 1, sale: 1, reversal: 1, payment: 1, payment_void: 1 });
    expect(cloud.calls.map((c) => c.fn)).toEqual([
      'upsert:customers',
      'upsert:products',
      'post_sale',
      'record_payment',
      'reverse_sale',
      'void_payment',
    ]);
    const post = cloud.calls[2].args;
    expect(post).toMatchObject({ p_shop_id: 'shop-1', p_sale_id: sale.saleId, p_client_op_id: 'op-s', p_customer_id: cid, p_client_total: '10000' });
    expect(post.p_lines).toEqual([{ product_name: 'non', qty_milli: '1000', unit: 'dona', unit_price: '10000', raw_text: null, product_id: null, unit_cost: null }]);
    expect(cloud.calls[3].args).toMatchObject({ p_amount: '10000', p_method: 'naqd' });
    expect((cloud.calls[0].args.rows as Record<string, unknown>[])[0]).toEqual({ id: cid, shop_id: 'shop-1', name: 'Akmal', phone: '901', notes: 'Chorsu', is_active: true });
    expect(await pendingCount(db, 'shop-1')).toBe(0);
  });

  it("bir martalik savdo: serverdagi tizim mijozi ishlatiladi, to'lov savdoga qo'shiladi, avto-bekor alohida yuborilmaydi", async () => {
    const w = await ledger.ensureWalkinCustomer();
    const r = await ledger.postSale({ clientOpId: 'w1', customerId: w, rawInput: null, lines: [line('non', 5000n)], paid: { method: 'naqd', amount: 5000n } });
    await ledger.reverseSale({ saleId: r.saleId, reason: 'qaytarildi', clientOpId: 'w1r' });
    const cloud = new FakeCloud();
    expect(await pendingCount(db, 'shop-1')).toBe(2); // sale + reversal; to'lov va uning avto-bekori sanalmaydi
    const res = await pushToCloud(db, cloud, 'shop-1', { now });
    expect(res.error).toBeNull();
    expect(cloud.calls.map((c) => c.fn)).toEqual(['ensure_walkin_customer', 'post_sale', 'reverse_sale']);
    const post = cloud.calls[1].args;
    expect(post.p_customer_id).toBe('id-1'); // serverning ensure_walkin_customer javobi, lokal id emas
    expect(post.p_customer_id).not.toBe(w);
    expect(post).toMatchObject({ p_paid: '5000', p_payment_method: 'naqd' });
    expect(await pendingCount(db, 'shop-1')).toBe(0);
  });

  it("kirim sinxronlanadi: ta'minotchi, kirim (to'lov bilan), to'lov va bekor — to'g'ri tartibda", async () => {
    const { createPurchasing } = await import('../src/data/purchasing');
    const buy = createPurchasing(db, { newId: () => randomUUID(), now });
    const sup = await buy.saveSupplier({ name: 'Baraka' });
    const pid = await createCatalog(db, { newId: () => randomUUID(), now }).saveProduct({ name: 'Un', unit: 'kg', unitPrice: 13000n });
    const k = await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: [{ productId: pid, qtyMilli: 100000n, unitCost: 9000n }, { productId: pid, qtyMilli: 50000n, unitCost: 11000n }], paid: { method: 'naqd', amount: 1000000n } });
    expect(k.total).toBe(1450000n);
    await buy.reversePurchase({ purchaseId: k.purchaseId, reason: 'xato kirim', clientOpId: 'kr' });
    const cloud = new FakeCloud();
    const res = await pushToCloud(db, cloud, 'shop-1', { now });
    expect(res.error).toBeNull();
    expect(res.pushed).toEqual({ ...ZERO, supplier: 1, product: 1, purchase: 1, purchase_reversal: 1 });
    expect(cloud.calls.map((c) => c.fn)).toEqual(['upsert:products', 'upsert:suppliers', 'post_purchase', 'reverse_purchase']);
    expect(cloud.calls[2].args).toMatchObject({ p_client_total: '1450000', p_paid: '1000000', p_payment_method: 'naqd' });
    expect(await pendingCount(db, 'shop-1')).toBe(0);
  });

  it("qayta ishga tushirish — yuborilganlar takrorlanmaydi; boshqa do'kon uchun alohida hisob", async () => {
    await seed();
    await pushToCloud(db, new FakeCloud(), 'shop-1', { now });
    const again = new FakeCloud();
    const res = await pushToCloud(db, again, 'shop-1', { now });
    // O'zgarmagan mijoz/mahsulot qayta yuborilmaydi (web'da o'chirilgan bo'lsa tiriltirmaslik uchun)
    expect(again.calls.map((c) => c.fn)).toEqual([]);
    expect(res.skipped).toBe(4);
    expect(await pendingCount(db, 'shop-2')).toBe(4);
  });

  it("xatoda to'xtaydi, lokal ma'lumotga tegmaydi, keyingi safar qolganidan davom etadi", async () => {
    await seed();
    const before = ['sales', 'sale_lines', 'ledger_entries', 'payments', 'payment_voids', 'sale_reversals'].map(
      (t) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n,
    );
    const flaky = new FakeCloud();
    flaky.failOn = (fn) => (fn === 'record_payment' ? { message: 'Network request failed' } : null);
    const res = await pushToCloud(db, flaky, 'shop-1', { now });
    expect(res.error?.kind).toBe('network');
    expect(res.pushed.sale).toBe(1);
    expect(res.pushed.payment).toBe(0);
    expect(await pendingCount(db, 'shop-1')).toBe(3);
    const after = ['sales', 'sale_lines', 'ledger_entries', 'payments', 'payment_voids', 'sale_reversals'].map(
      (t) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n,
    );
    expect(after).toEqual(before);

    const ok = new FakeCloud();
    const res2 = await pushToCloud(db, ok, 'shop-1', { now });
    expect(res2.error).toBeNull();
    expect(ok.calls.map((c) => c.fn)).toEqual(['record_payment', 'reverse_sale', 'void_payment']);
  });

  it("faqat yangi yoki yuborilgandan keyin tahrirlangan mijoz qayta yuboriladi", async () => {
    const { cid } = await seed();
    await pushToCloud(db, new FakeCloud(), 'shop-1', { now });
    await ledger.updateCustomer(cid, { name: 'Akmal aka', phone: '901', note: 'Chorsu' });
    const third = new FakeCloud();
    await pushToCloud(db, third, 'shop-1', { now });
    expect(third.calls.map((c) => c.fn)).toEqual(['upsert:customers']);
    expect((third.calls[0].args.rows as { name: string }[]).map((r) => r.name)).toEqual(['Akmal aka']);
  });

  it("bo'sh lokal baza — hech narsa yuborilmaydi", async () => {
    const cloud = new FakeCloud();
    const res = await pushToCloud(db, cloud, 'shop-1', { now });
    expect(res).toEqual({ pushed: ZERO, skipped: 0, error: null });
    expect(cloud.calls).toEqual([]);
  });
});

describe('toCloudError', () => {
  it.each([
    [{ message: 'Network request failed' }, 'network'],
    [{ message: 'TypeError: Failed to fetch' }, 'network'],
    [{ message: 'not_authenticated', code: '28000' }, 'auth'],
    [{ message: 'JWT expired' }, 'auth'],
    [{ message: 'forbidden', code: '42501' }, 'forbidden'],
    [{ message: 'new row violates row-level security policy for table "customers"' }, 'forbidden'],
    [{ message: 'id_conflict', code: '23505' }, 'conflict'],
    [{ message: 'calc_mismatch: server=1, client=2' }, 'validation'],
    [{ message: 'payment_exceeds_debt: debt=5' }, 'validation'],
    [{ message: 'nimadir' }, 'unknown'],
  ])('%j → %s', (err, kind) => {
    const e = toCloudError(err);
    expect(e).toBeInstanceOf(CloudError);
    expect(e.kind).toBe(kind);
    expect(e.message.length).toBeGreaterThan(10);
  });
});
