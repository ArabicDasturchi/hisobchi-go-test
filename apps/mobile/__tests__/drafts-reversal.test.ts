/**
 * Qoralama (C), bekor qilish (D) va savdo oqimi mosligi (B) — haqiqiy SQLite.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { parseProductList } from '@hisobchi/core';
import { createDraftStore, parseDraftPayload, serializeDraft, type StoredDraft } from '../src/data/drafts';
import { AlreadyReversedError, createLedger, SaleValidationError, type SaleLineInput } from '../src/data/ledger';
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../src/data/schema';
import { rowsFromParsed, toSaleLines } from '../src/features/draft';
import { openMemoryDb } from './node-sqlite';

let clock = 0;
const deps = { newId: () => randomUUID(), now: () => new Date(Date.UTC(2026, 9, 29, 9, 0, clock++)).toISOString() };
let n = 0;
const key = () => `k${n++}`;

let db: ReturnType<typeof openMemoryDb>;
beforeEach(async () => {
  clock = 0;
  db = openMemoryDb();
  await migrate(db);
});
const count = (t: string) => (db.raw.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;

function sampleDraft(clientOpId = randomUUID()): StoredDraft {
  const rawInput = "3 ta non 4000 so'mdan\n2 litr sut 12000 so'mdan";
  return { rawInput, clientOpId, rows: rowsFromParsed(parseProductList(rawInput), key) };
}

describe("C: migratsiya v1 → eng so'nggi", () => {
  it("eski v1 bazadagi savdo va mijozlar saqlanadi, yangi jadvallar qo'shiladi", async () => {
    const old = openMemoryDb();
    old.raw.exec(`PRAGMA foreign_keys = ON; ${MIGRATIONS[0]} PRAGMA user_version = 1;`);
    const ledgerV1 = createLedger(old, deps);
    const cid = await ledgerV1.createCustomer({ name: 'Eski mijoz' });
    // v1 bazada drafts jadvali yo'q — postSale'ning qoralama o'chirish qadamisiz yozamiz
    old.raw.exec(`INSERT INTO sales VALUES ('s1','op1','${cid}',12000,12000,12000,1,NULL,'2026-01-01T00:00:00.000Z');
      INSERT INTO sale_lines VALUES ('l1','s1',0,'non',3000,'dona',4000,12000,NULL);
      INSERT INTO ledger_entries VALUES ('e1','s1','${cid}','sale',12000,'2026-01-01T00:00:00.000Z');`);

    const report = await migrate(old);
    expect(report.userVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(7);
    expect(report.problems).toEqual([]);
    const ledger = createLedger(old, deps);
    expect((await ledger.getCustomer(cid))?.balance).toBe(12000n);
    expect((await ledger.getSale('s1'))?.lines[0].lineTotal).toBe(12000n);
  });
});

describe('C: qoralama', () => {
  it("saqlash → qayta ochish (yangi store) → tiklash; ustiga yozish; o'chirish", async () => {
    const store = createDraftStore(db, deps);
    expect(await store.load()).toEqual({ status: 'none' });
    const draft = sampleDraft();
    expect(await store.save(draft)).toBe('saved');

    const reopened = createDraftStore(db, deps);
    const loaded = await reopened.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.draft).toEqual(draft);

    const edited = { ...draft, rows: draft.rows.slice(0, 1) };
    await reopened.save(edited);
    const again = await reopened.load();
    expect(again.status === 'ok' && again.draft.rows).toHaveLength(1);
    expect(count('drafts')).toBe(1);

    await reopened.discard();
    expect(await reopened.load()).toEqual({ status: 'none' });
  });

  it('qoralama ledger, savdo va mijoz balansiga ta\'sir qilmaydi', async () => {
    const ledger = createLedger(db, deps);
    await ledger.createCustomer({ name: 'A' });
    await createDraftStore(db, deps).save(sampleDraft());
    expect([count('sales'), count('sale_lines'), count('ledger_entries')]).toEqual([0, 0, 0]);
    expect((await ledger.listCustomers())[0].balance).toBe(0n);
    expect(await ledger.totalSince('2000-01-01T00:00:00.000Z')).toEqual({ total: 0n, count: 0 });
  });

  it("savdo saqlanganda qoralama o'sha tranzaksiyada o'chadi; kechikkan saqlash uni tiriltirmaydi", async () => {
    const store = createDraftStore(db, deps);
    const ledger = createLedger(db, deps);
    const draft = sampleDraft();
    await store.save(draft);
    await ledger.postSale({ clientOpId: draft.clientOpId, customerId: null, rawInput: draft.rawInput, lines: toSaleLines(draft.rows) });
    expect(await store.load()).toEqual({ status: 'none' });
    expect(await store.save(draft)).toBe('skipped');
    expect(await store.load()).toEqual({ status: 'none' });
  });

  it("buzilgan qoralama ilovani yiqitmaydi — 'corrupt', keyin o'chirish mumkin", async () => {
    db.raw.exec("INSERT INTO drafts VALUES ('active', 'op', '{bu json emas', '2026-01-01')");
    const store = createDraftStore(db, deps);
    const r = await store.load();
    expect(r.status).toBe('corrupt');
    await store.discard();
    expect(await store.load()).toEqual({ status: 'none' });
  });

  it("noto'g'ri tuzilma rad etiladi", () => {
    const good = JSON.parse(serializeDraft(sampleDraft()));
    expect(parseDraftPayload(JSON.stringify(good)).ok).toBe(true);
    const bad = [
      { ...good, version: 2 },
      { ...good, clientOpId: '' },
      { ...good, rows: 'x' },
      { ...good, rows: [{ ...good.rows[0], unit: 'bochka' }] },
      { ...good, rows: [{ ...good.rows[0], acknowledged: 'ha' }] },
      { ...good, rows: [{ ...good.rows[0], parserIssues: [{ code: 'X', message: 'm', severity: 'fatal' }] }] },
      null,
    ];
    for (const b of bad) expect(parseDraftPayload(JSON.stringify(b)).ok, JSON.stringify(b)?.slice(0, 60)).toBe(false);
  });

  it('parallel saqlashlar — oxirgisi qoladi, bitta qator', async () => {
    const store = createDraftStore(db, deps);
    const base = sampleDraft();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.save({ ...base, rawInput: `versiya ${i}` })),
    );
    const r = await store.load();
    expect(r.status === 'ok' && r.draft.rawInput).toBe('versiya 19');
    expect(count('drafts')).toBe(1);
  });
});

const LINES: SaleLineInput[] = [{ productName: 'non', qtyMilli: 3000n, unit: 'dona', unitPrice: 4000n, rawText: null }];

describe('D: savdoni bekor qilish', () => {
  it("asl yozuvlar o'zgarmaydi; balans, kunlik jami va tarix bekor qilishni hisobga oladi", async () => {
    const ledger = createLedger(db, deps);
    const cid = await ledger.createCustomer({ name: 'Akmal' });
    const a = await ledger.postSale({ clientOpId: 'a', customerId: cid, rawInput: null, lines: LINES });
    await ledger.postSale({ clientOpId: 'b', customerId: cid, rawInput: null, lines: [{ ...LINES[0], unitPrice: 5000n }] });
    expect((await ledger.getCustomer(cid))?.balance).toBe(27000n);

    const res = await ledger.reverseSale({ saleId: a.saleId, reason: "Noto'g'ri narx kiritildi", clientOpId: 'rev-a' });
    expect(res.duplicate).toBe(false);

    expect([count('sales'), count('sale_lines'), count('ledger_entries'), count('sale_reversals')]).toEqual([2, 2, 2, 1]);
    const customer = await ledger.getCustomer(cid);
    expect(customer).toMatchObject({ balance: 15000n, saleCount: 1 });
    expect(await ledger.totalSince('2000-01-01T00:00:00.000Z')).toEqual({ total: 15000n, count: 1 });

    const detail = await ledger.getSale(a.saleId);
    expect(detail?.total).toBe(12000n);
    expect(detail?.reversal?.reason).toBe("Noto'g'ri narx kiritildi");
    const history = await ledger.listSales();
    expect(history.map((s) => s.reversal !== null)).toEqual([false, true]);
  });

  it('ikki marta bekor qilib bo\'lmaydi; bir xil amal takrori idempotent', async () => {
    const ledger = createLedger(db, deps);
    const s = await ledger.postSale({ clientOpId: 'a', customerId: null, rawInput: null, lines: LINES });
    const first = await ledger.reverseSale({ saleId: s.saleId, reason: 'xato savdo', clientOpId: 'r1' });
    expect(await ledger.reverseSale({ saleId: s.saleId, reason: 'xato savdo', clientOpId: 'r1' })).toEqual({
      reversalId: first.reversalId,
      duplicate: true,
    });
    await expect(ledger.reverseSale({ saleId: s.saleId, reason: 'yana', clientOpId: 'r2' })).rejects.toBeInstanceOf(
      AlreadyReversedError,
    );
    expect(count('sale_reversals')).toBe(1);
  });

  it('parallel ikki xil bekor qilish — faqat bittasi o\'tadi', async () => {
    const ledger = createLedger(db, deps);
    const s = await ledger.postSale({ clientOpId: 'a', customerId: null, rawInput: null, lines: LINES });
    const results = await Promise.allSettled([
      ledger.reverseSale({ saleId: s.saleId, reason: 'birinchi', clientOpId: 'p1' }),
      ledger.reverseSale({ saleId: s.saleId, reason: 'ikkinchi', clientOpId: 'p2' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(count('sale_reversals')).toBe(1);
  });

  it("sababsiz, mavjud bo'lmagan savdo va boshqa savdoning amal IDsi rad etiladi", async () => {
    const ledger = createLedger(db, deps);
    const s1 = await ledger.postSale({ clientOpId: 'a', customerId: null, rawInput: null, lines: LINES });
    const s2 = await ledger.postSale({ clientOpId: 'b', customerId: null, rawInput: null, lines: LINES });
    await expect(ledger.reverseSale({ saleId: s1.saleId, reason: ' x ', clientOpId: 'r' })).rejects.toBeInstanceOf(SaleValidationError);
    await expect(ledger.reverseSale({ saleId: 'yoq', reason: 'sabab bor', clientOpId: 'r' })).rejects.toBeInstanceOf(SaleValidationError);
    await ledger.reverseSale({ saleId: s1.saleId, reason: 'sabab bor', clientOpId: 'r' });
    await expect(ledger.reverseSale({ saleId: s2.saleId, reason: 'sabab bor', clientOpId: 'r' })).rejects.toBeInstanceOf(
      SaleValidationError,
    );
  });

  it('baza darajasida: noto\'g\'ri summa, UPDATE va DELETE taqiqlangan', async () => {
    const ledger = createLedger(db, deps);
    const s = await ledger.postSale({ clientOpId: 'a', customerId: null, rawInput: null, lines: LINES });
    expect(() =>
      db.raw.exec(`INSERT INTO sale_reversals VALUES ('x','${s.saleId}','op',NULL,1,'sabab','t')`),
    ).toThrow(/mos emas/);
    await ledger.reverseSale({ saleId: s.saleId, reason: 'sabab', clientOpId: 'r' });
    expect(() => db.raw.exec("UPDATE sale_reversals SET reason = 'boshqa'")).toThrow(/append-only/);
    expect(() => db.raw.exec('DELETE FROM sale_reversals')).toThrow(/append-only/);
  });
});

describe('B: tarix, tafsilot va balans o\'zaro mos', () => {
  it("har bir savdo: ro'yxatdagi jami = tafsilot jami = qatorlar yig'indisi; balans = mijoz savdolari", async () => {
    const ledger = createLedger(db, deps);
    const a = await ledger.createCustomer({ name: 'A' });
    const b = await ledger.createCustomer({ name: 'B' });
    const inputs = [
      { customerId: a, text: 'chirmoq 10 ta 13 ming, yurak 5 ta 15 ming, momiq 20 ta 9 ming' },
      { customerId: b, text: "go'sht 1,5 kg 90 ming\npishloq 0,25 kg 60000 so'm" },
      { customerId: null, text: "3 ta non 4000 so'mdan" },
      { customerId: a, text: "2 litr sut 12000 so'mdan" },
    ];
    for (const inp of inputs) {
      const lines = toSaleLines(rowsFromParsed(parseProductList(inp.text), key));
      await ledger.postSale({ clientOpId: randomUUID(), customerId: inp.customerId, rawInput: inp.text, lines });
    }
    const history = await ledger.listSales();
    for (const s of history) {
      const d = await ledger.getSale(s.id);
      expect(d?.total).toBe(s.total);
      expect(d?.lines.reduce((sum, l) => sum + l.lineTotal, 0n)).toBe(s.total);
    }
    const sumFor = (cid: string | null) =>
      history.filter((s) => s.customerId === cid).reduce((sum, s) => sum + s.total, 0n);
    expect((await ledger.getCustomer(a))?.balance).toBe(sumFor(a));
    expect((await ledger.getCustomer(b))?.balance).toBe(sumFor(b));
    expect(sumFor(a)).toBe(385000n + 24000n);
    expect(sumFor(b)).toBe(135000n + 15000n);
    expect((await ledger.totalSince('2000-01-01T00:00:00.000Z')).total).toBe(history.reduce((s, x) => s + x.total, 0n));
  });
});
