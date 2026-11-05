/**
 * S4 mobil ekranlar modeli: tezkor savdo, kirim formasi, daftar, katalog qatori, hamkor ko'rinishi.
 * Pul raqamlari TZ-3: 10×13 000 + 5×15 000 + 20×9 000 = 385 000; kirim 1 450 000 / berildi 1 000 000 / ostatka 450 000; foyda 20 000.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCatalog } from '../src/data/catalog';
import { partnerBook } from '../src/data/books';
import { createLedger, type Ledger } from '../src/data/ledger';
import { createPurchasing, type Purchasing, type StockRow } from '../src/data/purchasing';
import { migrate } from '../src/data/schema';
import { addDays, displayDate, groupByDate, inRange, parseDateInput, presetRange, validRange } from '../src/features/books';
import { catalogRow } from '../src/features/catalogView';
import { addPurchaseLine, evaluatePurchase, removePurchaseLine, updatePurchaseLine } from '../src/features/purchaseForm';
import { addProduct, evaluateQuickSale, setQty, setQtyText, stepQty, toSaleLines } from '../src/features/quickSale';
import { openMemoryDb } from './node-sqlite';

const nb = (t: string) => t.replace(/ /g, '\u00a0'); // formatlash qattiq bo'shliq ishlatadi
const row = (over: Partial<StockRow> = {}): StockRow => ({
  productId: 'p1', name: 'Un', unit: 'kg', qtyMilli: 100000n, costPrice: 11000n, salePrice: 13000n, isActive: true, ...over,
});

describe('katalog qatori', () => {
  it("qoldiq, narx, tan narx va birlik foydasi (core)", () => {
    const v = catalogRow(row());
    expect(v).toMatchObject({ name: 'Un', stockText: '100 kg', stockLevel: 'positive', priceText: nb('13 000'), costText: nb('11 000'), marginText: nb('+2 000') });
  });
  it("manfiy qoldiq belgilanadi; tan narx noma'lum bo'lsa foyda ko'rsatilmaydi (taxmin yo'q)", () => {
    const v = catalogRow(row({ qtyMilli: -2000n, costPrice: null }));
    expect(v.stockLevel).toBe('negative');
    expect(v.stockText).toBe('-2 kg');
    expect(v.marginText).toBeNull();
    expect(v.costText).toBeNull();
  });
  it("zarar bo'lsa minus ishora", () => {
    expect(catalogRow(row({ costPrice: 15000n })).marginText).toBe(nb('-2 000'));
  });
});

describe('tezkor savdo', () => {
  it("385 000: 10×13 000 + 5×15 000 + 20×9 000", () => {
    let l = addProduct([], row({ productId: 'a', salePrice: 13000n }));
    l = setQty(l, 'a', 10000n);
    l = addProduct(l, row({ productId: 'b', name: "Yog'", salePrice: 15000n }));
    l = setQty(l, 'b', 5000n);
    l = addProduct(l, row({ productId: 'c', name: 'Shakar', salePrice: 9000n }));
    l = setQty(l, 'c', 20000n);
    const e = evaluateQuickSale(l, 'one_time', null);
    expect(e.total).toBe(385000n);
    expect(e.blocker).toBeNull();
    expect(e.paid).toBe(385000n);
    expect(e.debt).toBe(0n);
  });

  it("bir martalik: 1 ta bosish bilan tovar qo'shiladi va sotishga tayyor; qayta bosish soni oshiradi", () => {
    let l = addProduct([], row());
    expect(evaluateQuickSale(l, 'one_time', null)).toMatchObject({ total: 13000n, blocker: null });
    l = addProduct(l, row());
    expect(l).toHaveLength(1);
    expect(l[0].qtyMilli).toBe(2000n);
    expect(evaluateQuickSale(l, 'one_time', null).total).toBe(26000n);
  });

  it("foyda: 10×13 000 sotuv, 10×11 000 tan narx → 20 000 (kodda)", () => {
    const l = setQty(addProduct([], row()), 'p1', 10000n);
    expect(evaluateQuickSale(l, 'one_time', null).profit).toMatchObject({ profit: 20000n, revenue: 130000n, unknownCostLines: [] });
  });

  it("manfiy qoldiq sariq ogohlantirish beradi, sotishni to'smaydi; tan narx noma'lum ham ogohlantirish", () => {
    const l = setQty(addProduct([], row({ qtyMilli: 5000n, costPrice: null })), 'p1', 7000n);
    const e = evaluateQuickSale(l, 'one_time', null);
    expect(e.blocker).toBeNull();
    expect(e.warnings.some((w) => w.includes("manfiy"))).toBe(true);
    expect(e.warnings.some((w) => w.includes("tan narx noma'lum"))).toBe(true);
    expect(e.profit.unknownCostLines).toEqual([0]);
  });

  it("doimiy mijoz: to'lovsiz = qarz; qisman to'lov qarzni kamaytiradi; jamidan ko'p to'lov rad etiladi", () => {
    const l = setQty(addProduct([], row()), 'p1', 10000n);
    expect(evaluateQuickSale(l, 'regular', null)).toMatchObject({ debt: 130000n, paid: 0n, blocker: null });
    expect(evaluateQuickSale(l, 'regular', 30000n)).toMatchObject({ debt: 100000n, paid: 30000n });
    expect(evaluateQuickSale(l, 'regular', 130001n).blocker).toMatch(/jamidan katta/);
  });

  it("bo'sh savdo bloklanadi; qty 0 qatorni olib tashlaydi; matn bilan kiritish", () => {
    expect(evaluateQuickSale([], 'one_time', null).blocker).toBe('Tovar tanlang');
    let l = addProduct([], row());
    l = stepQty(l, 'p1', -1000n);
    expect(l).toEqual([]);
    l = addProduct([], row());
    const r = setQtyText(l, 'p1', '1,5');
    expect(r.error).toBeNull();
    expect(r.lines[0].qtyMilli).toBe(1500n);
    expect(setQtyText(l, 'p1', 'abc').error).toMatch(/format/);
  });

  it("toSaleLines tovar id va tan narx snapshot'ini uzatadi", () => {
    const l = setQty(addProduct([], row()), 'p1', 2000n);
    expect(toSaleLines(l)).toEqual([{ productName: 'Un', qtyMilli: 2000n, unit: 'kg', unitPrice: 13000n, rawText: null, productId: 'p1', unitCost: 11000n }]);
  });
});

describe('kirim formasi', () => {
  const stock = (id: string, name: string, cost: bigint | null) => row({ productId: id, name, costPrice: cost });
  it("100×9 000 + 50×11 000 = 1 450 000; berildi 1 000 000 → ostatka 450 000", () => {
    let f = addPurchaseLine([], stock('a', 'Un', null));
    f = updatePurchaseLine(f, 'a', { qtyText: '100', costText: '9000' });
    f = addPurchaseLine(f, stock('b', "Yog'", 11000n));
    f = updatePurchaseLine(f, 'b', { qtyText: '50' });
    expect(f[1].costText).toBe('11000'); // oxirgi kirim narxi oldindan to'ldirilgan
    const e = evaluatePurchase(f, 0n, '1000000');
    expect(e.goods).toBe(1450000n);
    expect(e.blocker).toBeNull();
    expect(e.settlement).toMatchObject({ opening: 0n, goods: 1450000n, total: 1450000n, paid: 1000000n, balance: 450000n });
  });
  it("Eski qoldiq jamiga qo'shiladi: Eski 450 000 + Tovar 90 000 − Berildi 0 = 540 000", () => {
    let f = addPurchaseLine([], stock('a', 'Un', 9000n));
    f = updatePurchaseLine(f, 'a', { qtyText: '10' });
    expect(evaluatePurchase(f, 450000n, '').settlement).toMatchObject({ opening: 450000n, goods: 90000n, total: 540000n, balance: 540000n });
  });
  it("jamidan katta to'lov, noto'g'ri miqdor/narx, bo'sh forma bloklanadi", () => {
    let f = addPurchaseLine([], stock('a', 'Un', 9000n));
    f = updatePurchaseLine(f, 'a', { qtyText: '10' });
    expect(evaluatePurchase(f, 0n, '90001').blocker).toMatch(/jamidan katta/);
    expect(evaluatePurchase(updatePurchaseLine(f, 'a', { qtyText: 'x' }), 0n, '').blocker).toMatch(/format/);
    expect(evaluatePurchase(updatePurchaseLine(f, 'a', { costText: '' }), 0n, '').blocker).toBeTruthy();
    expect(evaluatePurchase(updatePurchaseLine(f, 'a', { qtyText: '0' }), 0n, '').blocker).toBeTruthy();
    expect(evaluatePurchase([], 0n, '').blocker).toBe('Tovar tanlang');
    expect(removePurchaseLine(f, 'a')).toEqual([]);
  });
});

describe('daftar sanalari', () => {
  const NOW = '2026-10-30T20:00:00.000Z'; // Toshkentda 31.10 01:00
  it("Toshkent kuni bo'yicha oraliqlar", () => {
    expect(presetRange('today', NOW)).toEqual({ from: '2026-10-31', to: '2026-10-31' });
    expect(presetRange('week', NOW)).toEqual({ from: '2026-10-25', to: '2026-10-31' });
    expect(presetRange('month', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('all', NOW)).toEqual({ from: null, to: null });
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it("sana matni: yil-oy-kun va kun.oy.yil, bo'sh = chegarasiz, noto'g'ri rad", () => {
    expect(parseDateInput('2026-10-05')).toEqual({ ok: true, date: '2026-10-05' });
    expect(parseDateInput('5.10.2026')).toEqual({ ok: true, date: '2026-10-05' });
    expect(parseDateInput('')).toEqual({ ok: true, date: null });
    expect(parseDateInput('31.02.2026').ok).toBe(false);
    expect(parseDateInput('kecha').ok).toBe(false);
    expect(validRange({ from: '2026-10-05', to: '2026-10-01' })).toMatch(/oldin/);
    expect(validRange({ from: null, to: '2026-10-01' })).toBeNull();
  });
  it("oraliqqa kirish ikki chegara bilan va sana bo'yicha guruhlash (yangisi tepada)", () => {
    const r = { from: '2026-10-02', to: '2026-10-03' };
    expect([ '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04' ].map((d) => inRange(d, r))).toEqual([false, true, true, false]);
    const g = groupByDate([{ date: '2026-10-01', n: 1 }, { date: '2026-10-03', n: 2 }, { date: '2026-10-01', n: 3 }]);
    expect(g.map((x) => [x.date, x.items.map((i) => i.n)])).toEqual([['2026-10-03', [2]], ['2026-10-01', [1, 3]]]);
    expect(displayDate('2026-10-05')).toBe('05.10.2026');
  });
});

describe('hamkor bo\'yicha daftar (SQLite)', () => {
  let db: ReturnType<typeof openMemoryDb>;
  let ledger: Ledger;
  let buy: Purchasing;
  let now = '2026-10-29T08:00:00.000Z';
  const deps = { newId: () => randomUUID(), now: () => now };
  beforeEach(async () => {
    db = openMemoryDb();
    await migrate(db);
    ledger = createLedger(db, deps);
    buy = createPurchasing(db, deps);
    now = '2026-10-29T08:00:00.000Z';
  });

  it("Eski/Tovar/Jami/Berildi/Ostatka davr bo'yicha; harakatsiz hamkor ko'rinmaydi", async () => {
    const pid = await createCatalog(db, deps).saveProduct({ name: 'Un', unit: 'kg', unitPrice: 13000n });
    const a = await buy.saveSupplier({ name: 'Baraka' });
    await buy.saveSupplier({ name: 'Bo\'sh' });
    await buy.postPurchase({ clientOpId: 'k1', supplierId: a, lines: [{ productId: pid, qtyMilli: 100000n, unitCost: 9000n }, { productId: pid, qtyMilli: 50000n, unitCost: 11000n }], paid: { method: 'naqd', amount: 1000000n } });
    now = '2026-10-31T08:00:00.000Z';
    await buy.postPurchase({ clientOpId: 'k2', supplierId: a, lines: [{ productId: pid, qtyMilli: 10000n, unitCost: 9000n }] });

    const rows = await partnerBook('in', { from: '2026-10-31', to: '2026-10-31' }, '', { ledger, purchasing: buy });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Baraka');
    expect(rows[0].settlement).toMatchObject({ opening: 450000n, goods: 90000n, total: 540000n, paid: 0n, balance: 540000n });

    const all = await partnerBook('in', { from: null, to: null }, 'bar', { ledger, purchasing: buy });
    expect(all[0].settlement).toMatchObject({ opening: 0n, goods: 1540000n, paid: 1000000n, balance: 540000n });
    expect(await partnerBook('in', { from: null, to: null }, 'yo\'q-hamkor', { ledger, purchasing: buy })).toEqual([]);
  });

  it("chiqim daftari mijoz bo'yicha; bir martalik mijoz ro'yxatda yo'q; bekor qilingan savdo hisobga olinmaydi", async () => {
    const cid = await ledger.createCustomer({ name: 'Akmal' });
    const w = await ledger.ensureWalkinCustomer();
    const line = { productName: 'Un', qtyMilli: 10000n, unit: 'kg' as const, unitPrice: 13000n, rawText: null };
    const s1 = await ledger.postSale({ clientOpId: 's1', customerId: cid, rawInput: null, lines: [line], paid: { method: 'naqd', amount: 30000n } });
    const s2 = await ledger.postSale({ clientOpId: 's2', customerId: cid, rawInput: null, lines: [line] });
    await ledger.postSale({ clientOpId: 's3', customerId: w, rawInput: null, lines: [line], paid: { method: 'naqd', amount: 130000n } });
    await ledger.reverseSale({ saleId: s2.saleId, reason: 'xato', clientOpId: 'r2' });
    const rows = await partnerBook('out', { from: null, to: null }, '', { ledger, purchasing: buy });
    expect(rows.map((r) => r.name)).toEqual(['Akmal']);
    expect(rows[0].settlement).toMatchObject({ goods: 130000n, paid: 30000n, balance: 100000n });
    expect(s1.saleId).toBeTruthy();
  });
});

describe('bir martalik mijoz xulosasi', () => {
  it("yaratilmaguncha null; keyin savdolar soni va jami (bekor qilinganlarsiz)", async () => {
    const db = openMemoryDb();
    await migrate(db);
    const d = { newId: () => randomUUID(), now: () => '2026-10-29T08:00:00.000Z' };
    const ledger = createLedger(db, d);
    expect(await ledger.getWalkinSummary()).toBeNull();
    const w = await ledger.ensureWalkinCustomer();
    const line = { productName: 'Un', qtyMilli: 1000n, unit: 'kg' as const, unitPrice: 13000n, rawText: null };
    const a = await ledger.postSale({ clientOpId: 'a', customerId: w, rawInput: null, lines: [line], paid: { method: 'naqd', amount: 13000n } });
    await ledger.postSale({ clientOpId: 'b', customerId: w, rawInput: null, lines: [line], paid: { method: 'naqd', amount: 13000n } });
    await ledger.reverseSale({ saleId: a.saleId, reason: 'xato', clientOpId: 'ra' });
    expect(await ledger.getWalkinSummary()).toEqual({ id: w, saleCount: 1, balance: 13000n });
  });
});
