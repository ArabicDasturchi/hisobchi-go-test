/**
 * Migratsiya, tranzaksiya ulanishi va saqlash/qayta o'qish testlari (haqiqiy SQLite).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProductList } from '@hisobchi/core';
import type { SqlConn, SqlDb, SqlParam } from '../src/data/db';
import { createLedger, type SaleLineInput } from '../src/data/ledger';
import { inspectSchema, migrate, REQUIRED_SCHEMA, SCHEMA_VERSION, SchemaError } from '../src/data/schema';
import { rowsFromParsed, toSaleLines } from '../src/features/draft';
import { openMemoryDb, openNodeDb } from './node-sqlite';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const deps = () => ({ newId: () => randomUUID(), now: () => new Date().toISOString() });
const NON: SaleLineInput[] = [{ productName: 'non', qtyMilli: 3000n, unit: 'dona', unitPrice: 4000n, rawText: '3 ta non 4000' }];

const tempDirs: string[] = [];
afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("regressiya: 'no such table: sales'", () => {
  /** expo-sqlite withExclusiveTransactionAsync xatti-harakati: tranzaksiya uchun YANGI ulanish */
  function connectionPerTransactionDb(path: string): SqlDb {
    const wrap = (raw: InstanceType<typeof DatabaseSync>): SqlConn => ({
      exec: async (sql) => void raw.exec(sql),
      run: async (sql, p: SqlParam[] = []) => void raw.prepare(sql).run(...p),
      get: async <T,>(sql: string, p: SqlParam[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
      all: async <T,>(sql: string, p: SqlParam[] = []) => raw.prepare(sql).all(...p) as T[],
    });
    const main = wrap(new DatabaseSync(path));
    return {
      ...main,
      async transaction(fn) {
        const tx = wrap(new DatabaseSync(path));
        await tx.exec('BEGIN');
        try {
          const r = await fn(tx);
          await tx.exec('COMMIT');
          return r;
        } catch (e) {
          await tx.exec('ROLLBACK');
          throw e;
        }
      },
    };
  }

  it("eski usul: ':memory:' + alohida tranzaksiya ulanishi xatoni takrorlaydi", async () => {
    const db = connectionPerTransactionDb(':memory:');
    // Migratsiya ham tranzaksiyadan foydalanadi — jadvallar boshqa ulanishda yaratiladi
    await expect(migrate(db)).rejects.toThrow(/jadval yo'q: sales/);
    const ledger = createLedger(db, deps());
    await expect(ledger.postSale({ clientOpId: 'x', customerId: null, rawInput: null, lines: NON })).rejects.toThrow(
      /no such table: sales/,
    );
  });

  it('yangi usul: bitta navbatli ulanishda xuddi shu oqim ishlaydi', async () => {
    const db = openMemoryDb();
    await migrate(db);
    const res = await createLedger(db, deps()).postSale({ clientOpId: 'x', customerId: null, rawInput: null, lines: NON });
    expect(res.total).toBe(12000n);
  });
});

describe('migrate', () => {
  it('yangi baza: barcha jadval, ustun va triggerlar yaratiladi', async () => {
    const db = openMemoryDb();
    const report = await migrate(db);
    expect(report.problems).toEqual([]);
    expect(report.userVersion).toBe(SCHEMA_VERSION);
    for (const t of Object.keys(REQUIRED_SCHEMA)) expect(report.tables).toContain(t);
  });

  it('qayta ishga tushirish xavfsiz va ma\'lumotni saqlaydi', async () => {
    const db = openMemoryDb();
    await migrate(db);
    await createLedger(db, deps()).postSale({ clientOpId: 'a', customerId: null, rawInput: null, lines: NON });
    await migrate(db);
    await migrate(db);
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM sales').get() as { n: number }).n).toBe(1);
  });

  it("user_version=1, lekin jadvallar yo'q — DROP'siz tiklanadi", async () => {
    const db = openMemoryDb();
    db.raw.exec('PRAGMA user_version = 1');
    expect((await inspectSchema(db)).problems.length).toBeGreaterThan(0);
    const report = await migrate(db);
    expect(report.problems).toEqual([]);
  });

  it("jadvallar bor, user_version=0 — mavjud mijoz saqlanadi", async () => {
    const db = openMemoryDb();
    await migrate(db);
    const id = await createLedger(db, deps()).createCustomer({ name: 'Akmal' });
    db.raw.exec('PRAGMA user_version = 0');
    await migrate(db);
    expect((await createLedger(db, deps()).getCustomer(id))?.name).toBe('Akmal');
  });

  it("mos kelmaydigan eski jadval — SchemaError, jadval o'chirilmaydi", async () => {
    const db = openMemoryDb();
    db.raw.exec("CREATE TABLE sales (id TEXT PRIMARY KEY, total INTEGER); INSERT INTO sales VALUES ('old', 5)");
    await expect(migrate(db)).rejects.toBeInstanceOf(SchemaError);
    expect(db.raw.prepare("SELECT total FROM sales WHERE id = 'old'").get()).toEqual({ total: 5 });
  });
});

describe('tranzaksiya ulanishi', () => {
  it('foreign key tranzaksiya ichida ham ishlaydi', async () => {
    const db = openMemoryDb();
    await migrate(db);
    await expect(
      db.transaction((tx) =>
        tx.run(
          `INSERT INTO sales (id, client_op_id, customer_id, total, ts_total, sql_total, line_count, created_at)
           VALUES ('s', 'op', 'mavjud-emas', 1, 1, 1, 1, 'now')`,
        ),
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("tranzaksiya paytidagi boshqa so'rov navbat kutadi (aralashmaydi)", async () => {
    const db = openMemoryDb();
    await migrate(db);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tx = db.transaction(async (t) => {
      order.push('tx-start');
      await gate;
      await t.run("INSERT INTO customers (id, name, phone, note, created_at, updated_at) VALUES ('c1', 'A', NULL, NULL, 'x', 'x')");
      order.push('tx-end');
    });
    const read = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM customers').then((r) => {
      order.push(`read:${r?.n}`);
    });
    await Promise.resolve();
    release();
    await Promise.all([tx, read]);
    expect(order).toEqual(['tx-start', 'tx-end', 'read:1']);
  });
});

describe("fayl bazasi: saqlash, yopish, qayta ochish", () => {
  it("to'liq oqim: matn → qatorlar → ikki hisob → saqlash → qayta ochib o'qish", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hisobchi-'));
    tempDirs.push(dir);
    const file = join(dir, 'hisobchi.db');

    // 1-sessiya
    let db = openNodeDb(file);
    await migrate(db);
    let ledger = createLedger(db, deps());
    let n = 0;
    const rows = rowsFromParsed(
      parseProductList('chirmoq 10 ta 13 ming, yurak 5 ta 15 ming, momiq 20 ta 9 ming'),
      () => `k${n++}`,
    );
    const lines = toSaleLines(rows);
    const check = await ledger.verifyTotals(lines);
    expect(check).toMatchObject({ match: true, tsTotal: 385000n, sqlTotal: 385000n });
    const customerId = await ledger.createCustomer({ name: 'Dilnoza opa' });
    const first = await ledger.postSale({ clientOpId: 'op-385', customerId, rawInput: 'matn', lines });
    expect(first.duplicate).toBe(false);
    db.raw.close();

    // 2-sessiya (ilova qayta ochilgandek)
    db = openNodeDb(file);
    const report = await migrate(db);
    expect(report.problems).toEqual([]);
    ledger = createLedger(db, deps());
    const again = await ledger.postSale({ clientOpId: 'op-385', customerId, rawInput: 'matn', lines });
    expect(again).toEqual({ saleId: first.saleId, total: 385000n, duplicate: true });

    const history = await ledger.listSales();
    expect(history).toHaveLength(1);
    const sale = await ledger.getSale(history[0].id);
    expect(sale).toMatchObject({ total: 385000n, tsTotal: 385000n, sqlTotal: 385000n, customerName: 'Dilnoza opa' });
    expect(sale?.lines.map((l) => [l.productName, l.lineTotal])).toEqual([
      ['chirmoq', 130000n],
      ['yurak', 75000n],
      ['momiq', 180000n],
    ]);
    expect((await ledger.getCustomer(customerId))?.balance).toBe(385000n);
    db.raw.close();
  });
});
