/**
 * Chekka holatlar: yarim yo'lda xato, katta/noto'g'ri qiymatlar, tahrirlash, xato xabarlari.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MAX_QTY_MILLI, MAX_UNIT_PRICE, parseProductList } from '@hisobchi/core';
import {
  CalculationMismatchError,
  createLedger,
  SaleValidationError,
  type SaleLineInput,
} from '../src/data/ledger';
import { migrate } from '../src/data/schema';
import { editRow, emptyRow, rowsFromParsed, summarizeDraft } from '../src/features/draft';
import { describeSaveError } from '../src/features/saveErrors';
import { openMemoryDb } from './node-sqlite';

const deps = () => ({ newId: () => randomUUID(), now: () => new Date().toISOString() });
const LINES: SaleLineInput[] = [
  { productName: 'non', qtyMilli: 3000n, unit: 'dona', unitPrice: 4000n, rawText: null },
  { productName: 'sut', qtyMilli: 2000n, unit: 'litr', unitPrice: 12000n, rawText: null },
];
const count = (db: ReturnType<typeof openMemoryDb>, t: string) =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

describe('atomiklik: saqlash yarim yo\'lda xato bersa', () => {
  it("2-qator yozilayotganda xato — savdo, qatorlar va ledger bo'sh qoladi; qayta urinish ishlaydi", async () => {
    const db = openMemoryDb();
    await migrate(db);
    db.raw.exec(`CREATE TRIGGER test_fail BEFORE INSERT ON sale_lines WHEN NEW.line_index = 1
                 BEGIN SELECT RAISE(ABORT, 'sun''iy disk xatosi'); END;`);
    const ledger = createLedger(db, deps());
    await expect(ledger.postSale({ clientOpId: 'op', customerId: null, rawInput: null, lines: LINES })).rejects.toThrow(
      /disk xatosi/,
    );
    expect([count(db, 'sales'), count(db, 'sale_lines'), count(db, 'ledger_entries')]).toEqual([0, 0, 0]);

    // Xato bartaraf etilgach, xuddi shu client_op_id bilan saqlash muvaffaqiyatli
    db.raw.exec('DROP TRIGGER test_fail');
    const res = await ledger.postSale({ clientOpId: 'op', customerId: null, rawInput: null, lines: LINES });
    expect(res).toMatchObject({ total: 36000n, duplicate: false });
    expect([count(db, 'sales'), count(db, 'sale_lines'), count(db, 'ledger_entries')]).toEqual([1, 2, 1]);
  });

  it('parallel ikki marta bosish — bitta savdo', async () => {
    const db = openMemoryDb();
    await migrate(db);
    const ledger = createLedger(db, deps());
    const input = { clientOpId: 'tap', customerId: null, rawInput: null, lines: LINES };
    const [a, b] = await Promise.all([ledger.postSale(input), ledger.postSale(input)]);
    expect(a.saleId).toBe(b.saleId);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(count(db, 'sales')).toBe(1);
  });
});

describe('chegaraviy qiymatlar', () => {
  it("maksimal miqdor va narx qabul qilinadi, aniq BigInt summa", async () => {
    const db = openMemoryDb();
    await migrate(db);
    const ledger = createLedger(db, deps());
    const lines: SaleLineInput[] = [
      { productName: 'katta', qtyMilli: MAX_QTY_MILLI, unit: 'dona', unitPrice: MAX_UNIT_PRICE, rawText: null },
      { productName: 'katta2', qtyMilli: MAX_QTY_MILLI, unit: 'dona', unitPrice: MAX_UNIT_PRICE, rawText: null },
    ];
    const res = await ledger.postSale({ clientOpId: 'big', customerId: null, rawInput: null, lines });
    expect(res.total).toBe(200_000_000_000_000n);
    expect((await ledger.getSale(res.saleId))?.total).toBe(200_000_000_000_000n);
  });

  it('chegaradan oshgan narx va miqdor saqlanmaydi', async () => {
    const db = openMemoryDb();
    await migrate(db);
    const ledger = createLedger(db, deps());
    for (const bad of [
      { ...LINES[0], unitPrice: MAX_UNIT_PRICE + 1n },
      { ...LINES[0], qtyMilli: MAX_QTY_MILLI + 1n },
      { ...LINES[0], qtyMilli: -1000n },
      { ...LINES[0], unitPrice: -1n },
      { ...LINES[0], productName: '   ' },
    ]) {
      await expect(
        ledger.postSale({ clientOpId: randomUUID(), customerId: null, rawInput: null, lines: [bad] }),
      ).rejects.toBeInstanceOf(SaleValidationError);
    }
    expect(count(db, 'sales')).toBe(0);
  });
});

describe('qoralama: tahrirlash qoidalari', () => {
  const key = (() => {
    let n = 0;
    return () => `k${n++}`;
  })();

  it("chegaradan oshgan narx qatorni bloklaydi", () => {
    const row = { ...emptyRow('a'), productName: 'x', qtyText: '1', priceText: '100000001' };
    const e = summarizeDraft([row]).evals[0];
    expect(e.errors.map((x) => x.code)).toContain('PRICE_EXCEEDS_MAX');
    expect(summarizeDraft([row]).canConfirm).toBe(false);
  });

  it("manfiy yoki noto'g'ri miqdor matni bloklaydi", () => {
    for (const qtyText of ['-3', 'uch', '1.500', '1,2,3']) {
      const row = { ...emptyRow('a'), productName: 'x', qtyText, priceText: '1000' };
      expect(summarizeDraft([row]).evals[0].status, qtyText).toBe('error');
    }
  });

  it("nolga teng miqdor bloklaydi", () => {
    const row = { ...emptyRow('a'), productName: 'x', qtyText: '0', priceText: '1000' };
    expect(summarizeDraft([row]).evals[0].errors.map((e) => e.code)).toContain('ZERO_QTY');
  });

  it("nomni tahrirlash noaniqlik ogohlantirishini o'chirmaydi; miqdorni tahrirlash o'chiradi", () => {
    const [row] = rowsFromParsed(parseProductList('non 3 4000'), key);
    const withUnit = editRow(row, { unit: 'dona' }); // birlik tanlash — qiymat o'zgarishi
    expect(withUnit.parserIssues).toEqual([]);

    const [row2] = rowsFromParsed(parseProductList('non 3 4000'), key);
    const renamed = editRow(row2, { productName: 'oq non' });
    expect(renamed.parserIssues.map((i) => i.code)).toContain('ASSUMED_ROLES');
  });

  it("tasdiqlangan ogohlantirish qiymat o'zgarganda qayta tasdiq talab qiladi", () => {
    const [row] = rowsFromParsed(parseProductList("non 3 ta 4000 so'm 5000 so'm"), key);
    // Noaniq qatorda birlik ham taxmin qilinmaydi — miqdor va narx yetarli emas
    const partly = editRow(row, { qtyText: '3', priceText: '4000' });
    expect(summarizeDraft([partly]).evals[0].errors.map((e) => e.code)).toEqual(['MISSING_UNIT']);
    const fixed = editRow(partly, { unit: 'dona' });
    expect(summarizeDraft([fixed]).canConfirm).toBe(true);
    const acked = { ...fixed, acknowledged: true };
    expect(editRow(acked, { priceText: '4500' }).acknowledged).toBe(false);
  });

  it("qatorni o'chirgandan keyin jami qayta hisoblanadi", () => {
    const rows = rowsFromParsed(
      parseProductList("3 ta non 4000 so'mdan\n2 litr sut 12000 so'mdan"),
      key,
    );
    expect(summarizeDraft(rows).previewTotal).toBe(36000n);
    expect(summarizeDraft(rows.filter((r) => r.productName !== 'sut')).previewTotal).toBe(12000n);
  });

  it("bo'sh qoralama tasdiqlanmaydi", () => {
    expect(summarizeDraft(rowsFromParsed(parseProductList('   '), key)).canConfirm).toBe(false);
  });
});

describe('describeSaveError', () => {
  it('har bir xabar hech narsa saqlanmaganini va keyingi qadamni aytadi', () => {
    const cases: unknown[] = [
      new SaleValidationError("Birlik narxi ko'rsatilmagan"),
      new Error('FOREIGN KEY constraint failed'),
      new Error('database is locked'),
      new Error('database or disk is full'),
      new Error("noma'lum"),
      'satr xato',
    ];
    for (const c of cases) {
      const msg = describeSaveError(c);
      expect(msg, String(c)).toMatch(/saqlanmadi/i);
      expect(msg.length).toBeGreaterThan(20);
    }
    expect(describeSaveError(new Error('FOREIGN KEY constraint failed'))).toMatch(/Mijozni qayta tanlang/);
  });

  it('mos kelmaslik xabari summalarni saqlaydi', () => {
    const err = new CalculationMismatchError({
      match: false,
      tsLineTotals: [1n],
      sqlLineTotals: [2n],
      tsTotal: 1n,
      sqlTotal: 2n,
    });
    expect(describeSaveError(err)).toMatch(/TypeScript=1, SQL=2/);
  });
});
