/**
 * Tarix filtrlari, tarixdan yashirish (v4) va dashboard ko'rsatkichlari — haqiqiy SQLite.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createLedger, SaleValidationError, type Ledger, type SaleLineInput } from '../src/data/ledger';
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../src/data/schema';
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
let now = '';
const at = (iso: string) => {
  now = iso;
};

beforeEach(async () => {
  db = openMemoryDb();
  await migrate(db);
  ledger = createLedger(db, { newId: () => randomUUID(), now: () => now });
});

async function seed() {
  const akmal = await ledger.createCustomer({ name: 'Akmal aka' });
  const dilnoza = await ledger.createCustomer({ name: 'Dilnoza' });
  at('2026-10-20T10:00:00.000Z');
  const old = await ledger.postSale({ clientOpId: 'old', customerId: akmal, rawInput: null, lines: [line('shakar', 15000n)] });
  at('2026-10-29T08:00:00.000Z');
  const big = await ledger.postSale({ clientOpId: 'big', customerId: dilnoza, rawInput: null, lines: [line('guruch', 90000n)] });
  at('2026-10-29T09:00:00.000Z');
  const walk = await ledger.postSale({ clientOpId: 'walk', customerId: null, rawInput: null, lines: [line('non', 4000n)] });
  at('2026-10-29T10:00:00.000Z');
  const rev = await ledger.postSale({ clientOpId: 'rev', customerId: akmal, rawInput: null, lines: [line('sut', 12000n)] });
  at('2026-10-29T10:30:00.000Z');
  await ledger.reverseSale({ saleId: rev.saleId, reason: "xato narx", clientOpId: 'r' });
  return { akmal, dilnoza, old, big, walk, rev };
}

describe('tarix filtrlari', () => {
  it('qidiruv: mijoz nomi va mahsulot nomi (katta-kichik harfsiz)', async () => {
    const ids = await seed();
    expect((await ledger.listSales({ search: 'akmal' })).map((s) => s.id).sort()).toEqual([ids.old.saleId, ids.rev.saleId].sort());
    expect((await ledger.listSales({ search: 'GURUCH' })).map((s) => s.id)).toEqual([ids.big.saleId]);
    expect(await ledger.listSales({ search: 'yoq-narsa' })).toEqual([]);
  });

  it("sana oralig'i, holat va saralash", async () => {
    const ids = await seed();
    const today = await ledger.listSales({ from: '2026-10-29T00:00:00.000Z', to: '2026-10-30T00:00:00.000Z' });
    expect(today.map((s) => s.id)).toEqual([ids.rev.saleId, ids.walk.saleId, ids.big.saleId]);
    expect((await ledger.listSales({ status: 'reversed' })).map((s) => s.id)).toEqual([ids.rev.saleId]);
    expect((await ledger.listSales({ status: 'active' })).length).toBe(3);
    expect((await ledger.listSales({ sort: 'oldest' }))[0].id).toBe(ids.old.saleId);
    expect((await ledger.listSales({ sort: 'amount_desc' })).map((s) => s.total)).toEqual([90000n, 15000n, 12000n, 4000n]);
  });

  it("SQL in'ektsiyaga o'xshash qidiruv xavfsiz (parametr sifatida)", async () => {
    await seed();
    expect(await ledger.listSales({ search: "' OR 1=1 --" })).toEqual([]);
    expect((await ledger.listSales()).length).toBe(4);
  });
});

describe('tarixdan yashirish', () => {
  it("ro'yxatdan chiqadi, lekin summalar, balans va savdo o'zgarmaydi", async () => {
    const ids = await seed();
    const before = {
      dash: await ledger.dashboard('2026-10-29T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
      akmal: (await ledger.getCustomer(ids.akmal))?.balance,
      dilnoza: (await ledger.getCustomer(ids.dilnoza))?.balance,
    };
    expect(await ledger.setSaleHidden(ids.big.saleId, true)).toEqual({ changed: true });

    expect((await ledger.listSales()).map((s) => s.id)).not.toContain(ids.big.saleId);
    expect((await ledger.listSales({ includeHidden: true })).find((s) => s.id === ids.big.saleId)?.hidden).toBe(true);
    expect((await ledger.listSales({ customerId: ids.dilnoza, includeHidden: true })).length).toBe(1);
    expect((await ledger.getSale(ids.big.saleId))?.hidden).toBe(true);

    expect(await ledger.dashboard('2026-10-29T00:00:00.000Z', '2026-10-22T00:00:00.000Z')).toEqual(before.dash);
    expect((await ledger.getCustomer(ids.akmal))?.balance).toBe(before.akmal);
    expect((await ledger.getCustomer(ids.dilnoza))?.balance).toBe(before.dilnoza);
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM sales').get() as { n: number }).n).toBe(4);
  });

  it('idempotent; qayta ko\'rsatish; audit izi saqlanadi va o\'zgartirib bo\'lmaydi', async () => {
    const ids = await seed();
    await ledger.setSaleHidden(ids.walk.saleId, true);
    expect(await ledger.setSaleHidden(ids.walk.saleId, true)).toEqual({ changed: false });
    expect(await ledger.setSaleHidden(ids.walk.saleId, false)).toEqual({ changed: true });
    expect((await ledger.listSales()).map((s) => s.id)).toContain(ids.walk.saleId);
    const events = db.raw.prepare('SELECT action FROM sale_visibility_events ORDER BY rowid').all() as { action: string }[];
    expect(events.map((e) => e.action)).toEqual(['hide', 'unhide']);
    expect(() => db.raw.exec('DELETE FROM sale_visibility_events')).toThrow(/append-only/);
    expect(() => db.raw.exec("UPDATE sale_visibility_events SET action = 'hide'")).toThrow(/append-only/);
  });

  it("mavjud bo'lmagan savdo rad etiladi", async () => {
    await expect(ledger.setSaleHidden('yoq', true)).rejects.toBeInstanceOf(SaleValidationError);
  });
});

describe('dashboard', () => {
  it("bugun, 7 kun va mijozlarga savdo — bekor qilinganlarsiz, bir xil qoida", async () => {
    await seed();
    const d = await ledger.dashboard('2026-10-29T00:00:00.000Z', '2026-10-22T00:00:00.000Z');
    // bugun: 90000 + 4000 + 12000 − 12000 (bekor) = 94000; faol savdolar: 2
    expect(d.today).toEqual({ total: 94000n, count: 2 });
    expect(d.last7Days).toEqual({ total: 94000n, count: 2 });
    // mijozlarga: akmal 15000 (+12000 −12000) + dilnoza 90000; umumiy xaridor (4000) kirmaydi
    expect(d.customerSalesTotal).toBe(105000n);
    const balances = (await ledger.listCustomers()).reduce((s, c) => s + c.balance, 0n);
    expect(d.customerSalesTotal).toBe(balances);
    expect(d).toMatchObject({ customerCount: 2, reversedCount: 1 });
  });

  it("bo'sh baza — nollar", async () => {
    expect(await ledger.dashboard('2026-10-29T00:00:00.000Z', '2026-10-22T00:00:00.000Z')).toEqual({
      today: { total: 0n, count: 0 },
      last7Days: { total: 0n, count: 0 },
      customerSalesTotal: 0n,
      customerCount: 0,
      reversedCount: 0,
      activeCount: 0,
      outstandingTotal: 0n,
      paymentsToday: { total: 0n, count: 0 },
    });
  });
});

describe('migratsiya v3 → v4', () => {
  it("v3 bazadagi savdo va bekor qilish saqlanadi, yashirish jadvali qo'shiladi", async () => {
    const old = openMemoryDb();
    old.raw.exec(`PRAGMA foreign_keys = ON; ${MIGRATIONS[0]} ${MIGRATIONS[1]} ${MIGRATIONS[2]} PRAGMA user_version = 3;`);
    old.raw.exec(`INSERT INTO sales VALUES ('s1','op1',NULL,12000,12000,12000,1,NULL,'2026-01-01T00:00:00.000Z');
      INSERT INTO sale_lines VALUES ('l1','s1',0,'non',3000,'dona',4000,12000,NULL);
      INSERT INTO ledger_entries VALUES ('e1','s1',NULL,'sale',12000,'2026-01-01T00:00:00.000Z');
      INSERT INTO sale_reversals VALUES ('r1','s1','rop',NULL,12000,'sabab','2026-01-02T00:00:00.000Z');`);
    const report = await migrate(old);
    expect(report).toMatchObject({ userVersion: SCHEMA_VERSION, problems: [] });
    expect(SCHEMA_VERSION).toBe(7);
    const l = createLedger(old, { newId: () => randomUUID(), now: () => '2026-01-03T00:00:00.000Z' });
    const sale = await l.getSale('s1');
    expect(sale).toMatchObject({ total: 12000n, hidden: false });
    expect(sale?.reversal?.reason).toBe('sabab');
  });
});

describe('format yordamchilari', () => {
  it('savdo raqami — qisqa, katta harfli, tiresiz', async () => {
    const { shortSaleNumber } = await import('../src/lib/format');
    expect(shortSaleNumber('a1b2c3d4-e5f6-4789-abcd-ef0123456789')).toBe('#A1B2C3D4');
  });
  it('daysAgoIso — kun boshlanishi, mahalliy vaqt bo\'yicha', async () => {
    const { daysAgoIso, startOfTodayIso } = await import('../src/lib/format');
    const now = new Date(2026, 9, 29, 15, 30);
    expect(daysAgoIso(0, now)).toBe(startOfTodayIso(now));
    expect(new Date(daysAgoIso(7, now)).getDate()).toBe(22);
  });
});
