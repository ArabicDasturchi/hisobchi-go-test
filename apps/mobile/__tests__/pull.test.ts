/**
 * Bulutdan telefonga qo'shimcha import (pull) — haqiqiy SQLite, soxta bulut javoblari
 * (PostgREST formati: bigint ustunlar ::text bilan string, vaqt — timestamptz).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CloudClient, CloudResult, CloudTable } from '../src/backend/cloud';
import { pullFromCloud } from '../src/backend/pull';
import { pendingCount, pushToCloud } from '../src/backend/sync';
import { createLedger, type Ledger } from '../src/data/ledger';
import { migrate } from '../src/data/schema';
import { openMemoryDb } from './node-sqlite';

type Tables = Partial<Record<CloudTable, Record<string, unknown>[]>>;

class FakeCloud implements CloudClient {
  calls: string[] = [];
  constructor(public tables: Tables = {}) {}
  async rpc<T>(fn: string): Promise<CloudResult<T>> {
    this.calls.push(fn);
    return { data: 'ok' as T, error: null };
  }
  async upsert(table: string) {
    this.calls.push(`upsert:${table}`);
    return { data: null, error: null };
  }
  async selectAll<T>(table: CloudTable): Promise<CloudResult<T[]>> {
    return { data: (this.tables[table] ?? []) as T[], error: null };
  }
}

const C1 = '11111111-1111-4111-8111-111111111111';
const D1 = '22222222-2222-4222-8222-222222222222';
const D2 = '33333333-3333-4333-8333-333333333333';
const P1 = '44444444-4444-4444-8444-444444444444';
const T0 = '2026-10-30T08:00:00.123456+00:00';

function webData(): Tables {
  return {
    customers: [{ id: C1, name: 'Web mijoz', phone: '+99890', notes: null, created_at: T0, updated_at: T0 }],
    products: [
      { id: 'pr-1', name: 'Guruch', unit: 'kg', last_price: '18000', is_active: true, created_at: T0, updated_at: T0 },
      { id: 'pr-2', name: 'Arxiv', unit: 'dona', last_price: '1', is_active: false, created_at: T0, updated_at: T0 },
      { id: 'pr-3', name: 'Narxsiz', unit: 'dona', last_price: null, is_active: true, created_at: T0, updated_at: T0 },
    ],
    documents: [
      { id: D1, client_op_id: 'web-op-1', customer_id: C1, status: 'posted', subtotal: '45000', created_at: T0 },
      { id: D2, client_op_id: 'web-op-2', customer_id: null, status: 'reversed', subtotal: '4000', created_at: T0 },
    ],
    document_lines: [
      { document_id: D1, line_index: 0, product_name: 'Guruch', qty_milli: '2500', unit: 'kg', unit_price: '18000', line_total: '45000', raw_text: null },
      { document_id: D2, line_index: 0, product_name: 'Non', qty_milli: '1000', unit: 'dona', unit_price: '4000', line_total: '4000', raw_text: null },
    ],
    document_reversals: [{ id: 'rv-1', document_id: D2, client_op_id: 'web-rev', amount: '4000', reason: 'xato kiritildi', created_at: T0 }],
    payments: [{ id: P1, client_op_id: 'web-pay', customer_id: C1, amount: '20000', method: 'karta', note: 'Click', created_at: T0 }],
    payment_voids: [],
  };
}

let db: ReturnType<typeof openMemoryDb>;
let ledger: Ledger;
let clock = 0;
const deps = { now: () => new Date(Date.UTC(2026, 9, 30, 10, 0, clock++)).toISOString(), newId: () => randomUUID() };
const count = (t: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

beforeEach(async () => {
  db = openMemoryDb();
  await migrate(db);
  clock = 0;
  ledger = createLedger(db, deps);
});

describe('pullFromCloud', () => {
  it("web'da yaratilgan mijoz, mahsulot, savdo, bekor qilish va to'lovni import qiladi; qarz to'g'ri", async () => {
    const res = await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    expect(res.error).toBeNull();
    expect(res.imported).toEqual({ customer: 1, product: 1, sale: 2, reversal: 1, payment: 1, payment_void: 0 });
    expect(res.rejected.map((r) => r.reason)).toEqual(["narx ko'rsatilmagan"]); // arxiv — jim o'tkazib yuboriladi

    const c = await ledger.getCustomer(C1);
    expect(c).toMatchObject({ name: 'Web mijoz', balance: 45000n, paid: 20000n, outstanding: 25000n });
    const sale = await ledger.getSale(D1);
    expect(sale?.lines[0]).toMatchObject({ qtyMilli: 2500n, unitPrice: 18000n, lineTotal: 45000n });
    expect((await ledger.getSale(D2))?.reversal?.reason).toBe('xato kiritildi');
    expect(sale?.createdAt).toBe('2026-10-30T08:00:00.123Z'); // vaqt lokal formatga keltirilgan

    // Import qilingan yozuvlar qayta serverga yuborilmaydi
    expect(await pendingCount(db, 'shop')).toBe(0);
    const pushCloud = new FakeCloud();
    await pushToCloud(db, pushCloud, 'shop', deps);
    expect(pushCloud.calls).toEqual([]);
  });

  it('qayta pull — dublikat yaratmaydi', async () => {
    await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    const again = await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    expect(again.imported).toEqual({ customer: 0, product: 0, sale: 0, reversal: 0, payment: 0, payment_void: 0 });
    expect([count('sales'), count('sale_lines'), count('ledger_entries'), count('payments')]).toEqual([2, 2, 2, 1]);
  });

  it("formulaga mos kelmaydigan savdo import qilinmaydi va hech narsa qolmaydi", async () => {
    const data = webData();
    data.document_lines![0] = { ...data.document_lines![0], line_total: '45001' };
    const res = await pullFromCloud(db, new FakeCloud(data), 'shop', deps);
    expect(res.rejected.find((r) => r.id === D1)?.reason).toMatch(/formulaga mos emas/);
    expect(await ledger.getSale(D1)).toBeNull();
    // shu savdo uchun to'lov baribir import qilinadi (mijoz bor) — qarz manfiy ko'rinadi, yashirilmaydi
    expect((await ledger.getCustomer(C1))?.outstanding).toBe(-20000n);
  });

  it("bo'sh server javobi lokal ma'lumotni o'chirmaydi", async () => {
    const cid = await ledger.createCustomer({ name: 'Lokal' });
    await ledger.postSale({ clientOpId: 'l', customerId: cid, rawInput: null, lines: [{ productName: 'n', qtyMilli: 1000n, unit: 'dona', unitPrice: 5n, rawText: null }] });
    const res = await pullFromCloud(db, new FakeCloud({}), 'shop', deps);
    expect(res.error).toBeNull();
    expect([count('customers'), count('sales'), count('ledger_entries')]).toEqual([1, 1, 1]);
  });

  it("telefonda yuborilmagan tahrir bulutdagi eski nusxa bilan ustidan yozilmaydi; tahrirlanmagani yangilanadi", async () => {
    await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    // Telefonda tahrir (hali yuborilmagan)
    await ledger.updateCustomer(C1, { name: 'Telefondagi ism' });
    const newer = webData();
    newer.customers![0] = { ...newer.customers![0], name: 'Web yangi ism', updated_at: '2030-01-01T00:00:00+00:00' };
    await pullFromCloud(db, new FakeCloud(newer), 'shop', deps);
    expect((await ledger.getCustomer(C1))?.name).toBe('Telefondagi ism');

    // Tahrir yuborilgach, bulutdagi yangiroq o'zgarish qabul qilinadi
    await pushToCloud(db, new FakeCloud(), 'shop', deps);
    await pullFromCloud(db, new FakeCloud(newer), 'shop', deps);
    expect((await ledger.getCustomer(C1))?.name).toBe('Web yangi ism');
  });

  it("nomi telefondagi boshqa mahsulot bilan bir xil mahsulot import qilinmaydi", async () => {
    db.raw.exec("INSERT INTO products (id, name, unit, unit_price, created_at, updated_at) VALUES ('local-1','GURUCH','kg',17000,'t','t')");
    const res = await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    expect(res.rejected.find((r) => r.id === 'pr-1')?.reason).toMatch(/boshqa mahsulot/);
    expect((db.raw.prepare("SELECT unit_price FROM products WHERE id = 'local-1'").get() as { unit_price: number }).unit_price).toBe(17000);
  });

  it("katta summalar aniqligi saqlanadi (string → BigInt)", async () => {
    const data: Tables = {
      customers: webData().customers,
      documents: [{ id: D1, client_op_id: 'big', customer_id: C1, status: 'posted', subtotal: '100000000000000', created_at: T0 }],
      document_lines: [{ document_id: D1, line_index: 0, product_name: 'x', qty_milli: '1000000000', unit: 'dona', unit_price: '100000000', line_total: '100000000000000', raw_text: null }],
    };
    await pullFromCloud(db, new FakeCloud(data), 'shop', deps);
    expect((await ledger.getCustomer(C1))?.outstanding).toBe(100_000_000_000_000n);
  });

  it("server xatosi — xato qaytadi, lokal ma'lumot o'zgarmaydi", async () => {
    const failing: CloudClient = {
      rpc: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      selectAll: async () => ({ data: null, error: { message: 'JWT expired' } }),
    };
    const res = await pullFromCloud(db, failing, 'shop', deps);
    expect(res.error?.kind).toBe('auth');
    expect(count('customers')).toBe(0);
  });
});

describe("pull: web'da o'chirilgan / arxivlangan yozuvlar", () => {
  it("web'da o'chirilgan, tarixsiz mijoz telefondan ham olib tashlanadi", async () => {
    const data = webData();
    data.customers!.push({ id: 'c-del', name: 'Vaqtinchalik', phone: null, notes: null, created_at: T0, updated_at: T0 });
    await pullFromCloud(db, new FakeCloud(data), 'shop', deps);
    expect(await ledger.getCustomer('c-del')).not.toBeNull();
    const after = webData(); // c-del web'da o'chirilgan
    const res = await pullFromCloud(db, new FakeCloud(after), 'shop', deps);
    expect(res.removed.customer).toBe(1);
    expect(await ledger.getCustomer('c-del')).toBeNull();
    expect(await ledger.getCustomer(C1)).not.toBeNull();
  });

  it("savdo/to'lov tarixi bor mijoz o'chirilmaydi va sababi ko'rsatiladi", async () => {
    await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    const noCustomer = webData();
    noCustomer.customers = [{ id: 'other', name: 'Boshqa', phone: null, notes: null, created_at: T0, updated_at: T0 }];
    const res = await pullFromCloud(db, new FakeCloud(noCustomer), 'shop', deps);
    expect(res.removed.customer).toBe(0);
    expect(res.rejected.some((r) => r.id === C1 && /tarixi bor/.test(r.reason))).toBe(true);
    expect((await ledger.getCustomer(C1))?.balance).toBe(45000n);
  });

  it("telefonda tahrirlangan (hali yuborilmagan) mijoz o'chirilmaydi", async () => {
    const data = webData();
    data.customers!.push({ id: 'c-edit', name: 'Tahrir', phone: null, notes: null, created_at: T0, updated_at: T0 });
    await pullFromCloud(db, new FakeCloud(data), 'shop', deps);
    await ledger.updateCustomer('c-edit', { name: 'Telefonda tahrirlandi' });
    const res = await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    expect(res.removed.customer).toBe(0);
    expect((await ledger.getCustomer('c-edit'))?.name).toBe('Telefonda tahrirlandi');
  });

  it("web'da arxivlangan mahsulot telefondan olib tashlanadi; saqlangan savdo o'zgarmaydi", async () => {
    await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM products WHERE id = 'pr-1'").get() as { n: number }).n).toBe(1);
    const archived = webData();
    archived.products![0] = { ...archived.products![0], is_active: false };
    const res = await pullFromCloud(db, new FakeCloud(archived), 'shop', deps);
    expect(res.removed.product).toBe(1);
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM products WHERE id = 'pr-1'").get() as { n: number }).n).toBe(0);
    expect((await ledger.getSale(D1))?.lines[0]).toMatchObject({ productName: 'Guruch', unitPrice: 18000n });
  });

  it("bulut jadvali butunlay bo'sh qaytsa — hech narsa o'chirilmaydi", async () => {
    const data = webData();
    data.customers!.push({ id: 'c-x', name: 'X', phone: null, notes: null, created_at: T0, updated_at: T0 });
    await pullFromCloud(db, new FakeCloud(data), 'shop', deps);
    const res = await pullFromCloud(db, new FakeCloud({}), 'shop', deps);
    expect(res.removed).toEqual({ customer: 0, product: 0 });
    expect(await ledger.getCustomer('c-x')).not.toBeNull();
  });

  it("hali bulutga yuborilmagan lokal mijoz o'chirilmaydi", async () => {
    const local = await ledger.createCustomer({ name: 'Faqat telefonda' });
    await pullFromCloud(db, new FakeCloud(webData()), 'shop', deps);
    expect(await ledger.getCustomer(local)).not.toBeNull();
  });
});
