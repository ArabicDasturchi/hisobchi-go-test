/**
 * To'lovlar va qarz (v5), mahsulot katalogi, sozlamalar, hisobot va izchillik — haqiqiy SQLite.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCatalog } from '../src/data/catalog';
import { createLedger, PaymentError, SaleValidationError, type Ledger, type SaleLineInput } from '../src/data/ledger';
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../src/data/schema';
import { salesByDay } from '../src/lib/reports';
import { openMemoryDb } from './node-sqlite';

const line = (name: string, price: bigint, qty = 1000n): SaleLineInput => ({
  productName: name,
  qtyMilli: qty,
  unit: 'dona',
  unitPrice: price,
  rawText: null,
});

let db: ReturnType<typeof openMemoryDb>;
let ledger: Ledger;
let now = '2026-10-29T08:00:00.000Z';
const deps = { newId: () => randomUUID(), now: () => now };
const count = (t: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

beforeEach(async () => {
  db = openMemoryDb();
  await migrate(db);
  ledger = createLedger(db, deps);
  now = '2026-10-29T08:00:00.000Z';
});

async function customerWithDebt(total: bigint) {
  const cid = await ledger.createCustomer({ name: 'Akmal' });
  const sale = await ledger.postSale({ clientOpId: randomUUID(), customerId: cid, rawInput: null, lines: [line('un', total)] });
  return { cid, saleId: sale.saleId };
}

describe("to'lovlar va qarz", () => {
  it("qarz = savdo − to'lov; savdo summasi qarz deb aralashtirilmaydi", async () => {
    const { cid } = await customerWithDebt(100000n);
    let c = await ledger.getCustomer(cid);
    expect(c).toMatchObject({ balance: 100000n, paid: 0n, outstanding: 100000n });

    await ledger.recordPayment({ customerId: cid, amount: 30000n, method: 'naqd', clientOpId: 'p1' });
    c = await ledger.getCustomer(cid);
    expect(c).toMatchObject({ balance: 100000n, paid: 30000n, outstanding: 70000n });
    expect(count('ledger_entries')).toBe(1); // to'lov savdo ledger'ini o'zgartirmaydi
  });

  it("qarzdan katta, nol, manfiy va qarzi yo'q mijozga to'lov rad etiladi", async () => {
    const { cid } = await customerWithDebt(50000n);
    await expect(ledger.recordPayment({ customerId: cid, amount: 50001n, method: 'naqd', clientOpId: 'a' })).rejects.toBeInstanceOf(PaymentError);
    await expect(ledger.recordPayment({ customerId: cid, amount: 0n, method: 'naqd', clientOpId: 'b' })).rejects.toBeInstanceOf(PaymentError);
    await expect(ledger.recordPayment({ customerId: cid, amount: -5n, method: 'naqd', clientOpId: 'c' })).rejects.toBeInstanceOf(PaymentError);
    await expect(ledger.recordPayment({ customerId: cid, amount: 1n, method: 'bitcoin' as never, clientOpId: 'd' })).rejects.toBeInstanceOf(PaymentError);
    const empty = await ledger.createCustomer({ name: 'Qarzsiz' });
    await expect(ledger.recordPayment({ customerId: empty, amount: 1n, method: 'naqd', clientOpId: 'e' })).rejects.toThrow(/qarzi yo'q/);
    await expect(ledger.recordPayment({ customerId: 'yoq', amount: 1n, method: 'naqd', clientOpId: 'f' })).rejects.toThrow(/topilmadi/);
    expect(count('payments')).toBe(0);
    // aynan qarzga teng to'lov ruxsat etiladi
    await ledger.recordPayment({ customerId: cid, amount: 50000n, method: 'karta', clientOpId: 'g' });
    expect((await ledger.getCustomer(cid))?.outstanding).toBe(0n);
  });

  it("takroriy so'rov (client_op_id) — bitta to'lov; parallel ikki to'lov qarzdan oshmaydi", async () => {
    const { cid } = await customerWithDebt(10000n);
    const a = await ledger.recordPayment({ customerId: cid, amount: 4000n, method: 'naqd', clientOpId: 'same' });
    const b = await ledger.recordPayment({ customerId: cid, amount: 4000n, method: 'naqd', clientOpId: 'same' });
    expect(b).toEqual({ paymentId: a.paymentId, duplicate: true });
    const results = await Promise.allSettled([
      ledger.recordPayment({ customerId: cid, amount: 5000n, method: 'naqd', clientOpId: 'x' }),
      ledger.recordPayment({ customerId: cid, amount: 5000n, method: 'naqd', clientOpId: 'y' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await ledger.getCustomer(cid))?.outstanding).toBe(1000n);
  });

  it("to'lovni bekor qilish: bir marta, sabab bilan, yozuvlar o'chirilmaydi", async () => {
    const { cid } = await customerWithDebt(10000n);
    const p = await ledger.recordPayment({ customerId: cid, amount: 6000n, method: 'otkazma', note: 'Click', clientOpId: 'p' });
    await expect(ledger.voidPayment({ paymentId: p.paymentId, reason: 'x' })).rejects.toBeInstanceOf(PaymentError);
    await ledger.voidPayment({ paymentId: p.paymentId, reason: "noto'g'ri summa" });
    await expect(ledger.voidPayment({ paymentId: p.paymentId, reason: 'yana bir bor' })).rejects.toThrow(/allaqachon/);
    expect((await ledger.getCustomer(cid))).toMatchObject({ paid: 0n, outstanding: 10000n });
    const list = await ledger.listPayments({ customerId: cid });
    expect(list[0]).toMatchObject({ amount: 6000n, method: 'otkazma', note: 'Click' });
    expect(list[0].void?.reason).toBe("noto'g'ri summa");
    expect(() => db.raw.exec('DELETE FROM payments')).toThrow(/append-only/);
    expect(() => db.raw.exec('UPDATE payment_voids SET reason = 1')).toThrow(/append-only/);
  });

  it("to'lovdan keyin savdo bekor qilinsa — ortiqcha to'lov manfiy qoldiq sifatida ko'rinadi, yashirilmaydi", async () => {
    const { cid, saleId } = await customerWithDebt(10000n);
    await ledger.recordPayment({ customerId: cid, amount: 10000n, method: 'naqd', clientOpId: 'p' });
    await ledger.reverseSale({ saleId, reason: 'mol qaytarildi', clientOpId: 'r' });
    expect(await ledger.getCustomer(cid)).toMatchObject({ balance: 0n, paid: 10000n, outstanding: -10000n });
    // dashboard faqat musbat qarzlarni yig'adi
    expect((await ledger.dashboard('2026-10-29T00:00:00.000Z', '2026-10-22T00:00:00.000Z')).outstandingTotal).toBe(0n);
  });

  it('dashboard: qarz, bugungi to\'lovlar, faol/bekor qilingan — barcha raqamlar mos', async () => {
    const a = await customerWithDebt(80000n);
    const b = await ledger.createCustomer({ name: 'Bobur' });
    await ledger.postSale({ clientOpId: 'b1', customerId: b, rawInput: null, lines: [line('tuz', 20000n)] });
    const walk = await ledger.postSale({ clientOpId: 'w', customerId: null, rawInput: null, lines: [line('non', 4000n)] });
    await ledger.reverseSale({ saleId: walk.saleId, reason: 'xato', clientOpId: 'rw' });
    await ledger.recordPayment({ customerId: a.cid, amount: 30000n, method: 'naqd', clientOpId: 'pa' });
    const d = await ledger.dashboard('2026-10-29T00:00:00.000Z', '2026-10-22T00:00:00.000Z');
    expect(d.today).toEqual({ total: 100000n, count: 2 });
    expect(d).toMatchObject({ activeCount: 2, reversedCount: 1, customerCount: 2, outstandingTotal: 70000n });
    expect(d.paymentsToday).toEqual({ total: 30000n, count: 1 });
    const customers = await ledger.listCustomers();
    expect(customers.reduce((s, c) => s + c.outstanding, 0n)).toBe(d.outstandingTotal);
    expect(customers.reduce((s, c) => s + c.balance, 0n)).toBe(d.customerSalesTotal);
  });
});

describe('mahsulot katalogi va sozlamalar', () => {
  it("qo'shish, tahrirlash, qidirish, o'chirish — saqlangan savdo narxi o'zgarmaydi", async () => {
    const catalog = createCatalog(db, deps);
    const id = await catalog.saveProduct({ name: '  Oq   non ', unit: 'dona', unitPrice: 4000n });
    expect((await catalog.listProducts())[0]).toMatchObject({ name: 'Oq non', unitPrice: 4000n });
    const sale = await ledger.postSale({ clientOpId: 's', customerId: null, rawInput: null, lines: [line('Oq non', 4000n, 2000n)] });

    await catalog.saveProduct({ name: 'Oq non', unit: 'dona', unitPrice: 4500n }, id);
    expect((await catalog.listProducts('NON'))[0].unitPrice).toBe(4500n);
    await catalog.deleteProduct(id);
    expect(await catalog.listProducts()).toEqual([]);

    const d = await ledger.getSale(sale.saleId);
    expect(d?.lines[0]).toMatchObject({ productName: 'Oq non', unitPrice: 4000n, lineTotal: 8000n });
  });

  it("noto'g'ri mahsulot rad etiladi; nom takrorlanmaydi (katta-kichik harfsiz)", async () => {
    const catalog = createCatalog(db, deps);
    await catalog.saveProduct({ name: 'Shakar', unit: 'kg', unitPrice: 15000n });
    for (const bad of [
      { name: '  ', unit: 'kg' as const, unitPrice: 1n },
      { name: 'x', unit: 'bochka' as never, unitPrice: 1n },
      { name: 'x', unit: 'kg' as const, unitPrice: -1n },
      { name: 'x', unit: 'kg' as const, unitPrice: 100_000_001n },
      { name: 'SHAKAR', unit: 'kg' as const, unitPrice: 1n },
    ]) {
      await expect(catalog.saveProduct(bad)).rejects.toBeInstanceOf(SaleValidationError);
    }
    expect((await catalog.listProducts()).length).toBe(1);
  });

  it("sozlamalar saqlanadi va noma'lum kalit e'tiborsiz qoldiriladi", async () => {
    const catalog = createCatalog(db, deps);
    expect(await catalog.getSettings()).toEqual({ shop_name: '', shop_phone: '', shop_address: '' });
    await catalog.saveSettings({ shop_name: " Akmal do'koni ", shop_phone: '+998901234567' });
    await catalog.saveSettings({ shop_name: "Akmal savdo", ['hack' as never]: 'x' });
    expect(await catalog.getSettings()).toEqual({ shop_name: 'Akmal savdo', shop_phone: '+998901234567', shop_address: '' });
  });
});

describe('hisobot: kunlar bo\'yicha', () => {
  it("dashboard'dagi 7 kunlik jami bilan mos", async () => {
    const cid = await ledger.createCustomer({ name: 'A' });
    now = new Date(2026, 9, 29, 10).toISOString();
    await ledger.postSale({ clientOpId: '1', customerId: cid, rawInput: null, lines: [line('a', 10000n)] });
    now = new Date(2026, 9, 27, 10).toISOString();
    const s2 = await ledger.postSale({ clientOpId: '2', customerId: null, rawInput: null, lines: [line('b', 5000n)] });
    await ledger.postSale({ clientOpId: '3', customerId: null, rawInput: null, lines: [line('c', 7000n)] });
    now = new Date(2026, 9, 29, 11).toISOString();
    await ledger.reverseSale({ saleId: s2.saleId, reason: 'xato', clientOpId: 'r' });

    const ref = new Date(2026, 9, 29, 12);
    const week = new Date(2026, 9, 23).toISOString();
    const days = salesByDay(await ledger.listSales({ from: week, includeHidden: true }), 7, ref);
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ activeTotal: 10000n, activeCount: 1 });
    expect(days[2]).toMatchObject({ activeTotal: 7000n, activeCount: 1, reversedTotal: 5000n, reversedCount: 1 });
    const sum = days.reduce((s, d) => s + d.activeTotal, 0n);
    expect(sum).toBe((await ledger.totalSince(week)).total);
  });
});

describe('migratsiya v4 → v5', () => {
  it("v4 bazadagi ma'lumot saqlanadi; to'lovlar bo'sh, qarz = savdo", async () => {
    const old = openMemoryDb();
    old.raw.exec(`PRAGMA foreign_keys = ON; ${MIGRATIONS.slice(0, 4).join(' ')} PRAGMA user_version = 4;`);
    old.raw.exec(`INSERT INTO customers VALUES ('c1','Eski',NULL,NULL,'t','t');
      INSERT INTO sales VALUES ('s1','op1','c1',12000,12000,12000,1,NULL,'2026-01-01T00:00:00.000Z');
      INSERT INTO sale_lines VALUES ('l1','s1',0,'non',3000,'dona',4000,12000,NULL);
      INSERT INTO ledger_entries VALUES ('e1','s1','c1','sale',12000,'2026-01-01T00:00:00.000Z');`);
    const report = await migrate(old);
    expect(report).toMatchObject({ userVersion: SCHEMA_VERSION, problems: [] });
    expect(SCHEMA_VERSION).toBe(6);
    const l = createLedger(old, deps);
    expect(await l.getCustomer('c1')).toMatchObject({ balance: 12000n, paid: 0n, outstanding: 12000n });
  });
});

describe("qo'lda kiritish + katalogdan tanlash → saqlash → tafsilot", () => {
  it("bo'sh qatordan boshlab katalog qiymatlari bilan savdo saqlanadi", async () => {
    const { editRow, emptyRow, summarizeDraft, toSaleLines } = await import('../src/features/draft');
    const catalog = createCatalog(db, deps);
    await catalog.saveProduct({ name: 'Guruch', unit: 'kg', unitPrice: 18000n });
    const [p] = await catalog.listProducts('gur');

    let row = emptyRow('k1');
    expect(summarizeDraft([row]).canConfirm).toBe(false); // bo'sh nom/miqdor/narx bloklaydi
    row = editRow(row, { productName: p.name, unit: p.unit, priceText: p.unitPrice.toString() });
    row = editRow(row, { qtyText: '2,5' });
    const extra = editRow(emptyRow('k2'), { productName: 'Tuz', qtyText: '1', priceText: '3 ming' });
    const summary = summarizeDraft([row, extra]);
    expect(summary.canConfirm).toBe(true);
    expect(summary.previewTotal).toBe(45000n + 3000n);

    const res = await ledger.postSale({ clientOpId: 'manual', customerId: null, rawInput: '', lines: toSaleLines([row, extra]) });
    const sale = await ledger.getSale(res.saleId);
    expect(sale?.lines.map((l) => [l.productName, l.unit, l.qtyMilli, l.lineTotal])).toEqual([
      ['Guruch', 'kg', 2500n, 45000n],
      ['Tuz', 'dona', 1000n, 3000n],
    ]);
    expect(sale?.lines.every((l) => l.rawText === null)).toBe(true);
  });
});
