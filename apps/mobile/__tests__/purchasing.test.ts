/**
 * Ta'minotchi, kirim, ombor va oldi-berdi — haqiqiy SQLite.
 * Raqamlar TZ-3 dan: 100×9 000 + 50×11 000 = 1 450 000, berildi 1 000 000 → ostatka 450 000.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCatalog } from '../src/data/catalog';
import { createLedger, CalculationMismatchError, PaymentError, type Ledger } from '../src/data/ledger';
import { createPurchasing, PurchaseError, type Purchasing } from '../src/data/purchasing';
import { migrate } from '../src/data/schema';
import { openMemoryDb } from './node-sqlite';

let db: ReturnType<typeof openMemoryDb>;
let ledger: Ledger;
let buy: Purchasing;
let now = '2026-10-29T08:00:00.000Z';
const deps = { newId: () => randomUUID(), now: () => now };
const count = (t: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

let sup: string;
let un: string;
let yog: string;

beforeEach(async () => {
  db = openMemoryDb();
  await migrate(db);
  ledger = createLedger(db, deps);
  buy = createPurchasing(db, deps);
  const catalog = createCatalog(db, deps);
  now = '2026-10-29T08:00:00.000Z';
  sup = await buy.saveSupplier({ name: 'Baraka Optom' });
  un = (await catalog.saveProduct({ name: 'Un', unit: 'kg', unitPrice: 13000n })) as unknown as string;
  yog = (await catalog.saveProduct({ name: "Yog'", unit: 'litr', unitPrice: 15000n })) as unknown as string;
});

const lines = () => [
  { productId: un, qtyMilli: 100000n, unitCost: 9000n },
  { productId: yog, qtyMilli: 50000n, unitCost: 11000n },
];

describe('kirim', () => {
  it("100×9 000 + 50×11 000 = 1 450 000; 1 000 000 berildi → ostatka 450 000", async () => {
    const r = await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines(), paid: { method: 'naqd', amount: 1000000n } });
    expect(r.total).toBe(1450000n);
    const s = await buy.getSupplier(sup);
    expect(s).toMatchObject({ goods: 1450000n, paid: 1000000n, outstanding: 450000n });
  });

  it("qoldiq oshadi va tan narx oxirgi kirimdan olinadi", async () => {
    await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines() });
    expect(await buy.stockOf(un)).toBe(100000n);
    now = '2026-10-30T08:00:00.000Z';
    await buy.postPurchase({ clientOpId: 'k2', supplierId: sup, lines: [{ productId: un, qtyMilli: 10000n, unitCost: 9500n }] });
    expect(await buy.stockOf(un)).toBe(110000n);
    const row = (await buy.listStock()).find((x) => x.productId === un)!;
    expect(row.costPrice).toBe(9500n);
  });

  it("takroriy clientOpId ikkinchi marta yozmaydi", async () => {
    await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines() });
    const again = await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines() });
    expect(again.duplicate).toBe(true);
    expect(count('purchases')).toBe(1);
    expect(count('purchase_lines')).toBe(2);
  });

  it("noto'g'ri kirim hech narsa yozmaydi (bo'sh, 0 miqdor, noma'lum tovar, ortiqcha to'lov)", async () => {
    await expect(buy.postPurchase({ clientOpId: 'a', supplierId: sup, lines: [] })).rejects.toBeInstanceOf(PurchaseError);
    await expect(buy.postPurchase({ clientOpId: 'b', supplierId: sup, lines: [{ productId: un, qtyMilli: 0n, unitCost: 1n }] })).rejects.toBeInstanceOf(PurchaseError);
    await expect(buy.postPurchase({ clientOpId: 'c', supplierId: sup, lines: [{ productId: 'yoq', qtyMilli: 1000n, unitCost: 1n }] })).rejects.toBeInstanceOf(PurchaseError);
    await expect(buy.postPurchase({ clientOpId: 'd', supplierId: sup, lines: lines(), paid: { method: 'naqd', amount: 1450001n } })).rejects.toBeInstanceOf(PaymentError);
    expect(count('purchases')).toBe(0);
    expect(count('supplier_payments')).toBe(0);
  });

  it("ikki hisob mos kelmasa to'xtaydi (SQLite hisobi buzilsa)", async () => {
    db.raw.exec(`CREATE TEMP TRIGGER t_break BEFORE INSERT ON purchase_lines BEGIN SELECT RAISE(ABORT, 'x'); END`);
    await expect(buy.postPurchase({ clientOpId: 'm', supplierId: sup, lines: lines() })).rejects.toThrow();
    expect(count('purchases')).toBe(0);
    expect(CalculationMismatchError).toBeDefined();
  });
});

describe('bekor qilish (teskari yozuv)', () => {
  it("ombor va ostatka qaytadi, tan narx oldingisiga qaytadi, qator o'chmaydi", async () => {
    const first = await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: [{ productId: un, qtyMilli: 10000n, unitCost: 9000n }] });
    now = '2026-10-30T08:00:00.000Z';
    const second = await buy.postPurchase({ clientOpId: 'k2', supplierId: sup, lines: [{ productId: un, qtyMilli: 5000n, unitCost: 12000n }] });
    expect((await buy.listStock()).find((x) => x.productId === un)!.costPrice).toBe(12000n);

    await buy.reversePurchase({ purchaseId: second.purchaseId, reason: 'xato kiritilgan', clientOpId: 'r1' });
    expect(await buy.stockOf(un)).toBe(10000n);
    expect((await buy.getSupplier(sup))!.outstanding).toBe(90000n);
    expect((await buy.listStock()).find((x) => x.productId === un)!.costPrice).toBe(9000n);
    expect(count('purchases')).toBe(2);
    expect(first.purchaseId).toBeTruthy();

    await expect(buy.reversePurchase({ purchaseId: second.purchaseId, reason: 'yana', clientOpId: 'r2' })).rejects.toThrow(/allaqachon/);
    const dup = await buy.reversePurchase({ purchaseId: second.purchaseId, reason: 'xato kiritilgan', clientOpId: 'r1' });
    expect(dup.duplicate).toBe(true);
  });

  it("sababsiz bekor qilinmaydi; append-only: kirimni UPDATE/DELETE qilib bo'lmaydi", async () => {
    const r = await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines() });
    await expect(buy.reversePurchase({ purchaseId: r.purchaseId, reason: ' ', clientOpId: 'x' })).rejects.toThrow(/sabab/);
    expect(() => db.raw.exec('DELETE FROM purchases')).toThrow();
    expect(() => db.raw.exec('UPDATE purchase_lines SET qty_milli = 1')).toThrow();
  });
});

describe("ta'minotchiga to'lov", () => {
  it("qarzdan katta to'lov rad etiladi; bekor qilish qarzni qaytaradi", async () => {
    await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines() });
    await expect(buy.recordSupplierPayment({ supplierId: sup, amount: 1450001n, method: 'naqd', clientOpId: 'p0' })).rejects.toBeInstanceOf(PaymentError);
    const p = await buy.recordSupplierPayment({ supplierId: sup, amount: 450000n, method: 'karta', clientOpId: 'p1' });
    expect((await buy.getSupplier(sup))!.outstanding).toBe(1000000n);
    await buy.voidSupplierPayment({ paymentId: p.paymentId, reason: 'xato' });
    expect((await buy.getSupplier(sup))!.outstanding).toBe(1450000n);
    await expect(buy.voidSupplierPayment({ paymentId: p.paymentId, reason: 'yana' })).rejects.toThrow(/allaqachon/);
  });
});

describe('ombor', () => {
  it("savdo qoldiqni kamaytiradi, bekor qilish qaytaradi; manfiy qoldiqqa ruxsat", async () => {
    await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: [{ productId: un, qtyMilli: 10000n, unitCost: 9000n }] });
    const cid = await ledger.createCustomer({ name: 'Akmal' });
    const sale = await ledger.postSale({
      clientOpId: 's1', customerId: cid, rawInput: null,
      lines: [{ productName: 'Un', qtyMilli: 12000n, unit: 'kg', unitPrice: 13000n, rawText: null, productId: un, unitCost: 9000n }],
    });
    expect(await buy.stockOf(un)).toBe(-2000n);
    await ledger.reverseSale({ saleId: sale.saleId, reason: 'xato', clientOpId: 'rv1' });
    expect(await buy.stockOf(un)).toBe(10000n);
  });

  it("tuzatish qoldiqni o'zgartiradi, sabab majburiy, takror yozmaydi", async () => {
    await buy.adjustStock({ productId: un, qtyMilli: 5000n, reason: 'inventarizatsiya', clientOpId: 'a1' });
    const dup = await buy.adjustStock({ productId: un, qtyMilli: 5000n, reason: 'inventarizatsiya', clientOpId: 'a1' });
    expect(dup.duplicate).toBe(true);
    expect(await buy.stockOf(un)).toBe(5000n);
    await expect(buy.adjustStock({ productId: un, qtyMilli: 1000n, reason: '', clientOpId: 'a2' })).rejects.toThrow(/sabab/i);
  });
});

describe('oldi-berdi', () => {
  it("Eski + Tovar − Berildi = Ostatka", async () => {
    await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines(), paid: { method: 'naqd', amount: 1000000n } });
    now = '2026-10-30T08:00:00.000Z';
    await buy.postPurchase({ clientOpId: 'k2', supplierId: sup, lines: [{ productId: un, qtyMilli: 10000n, unitCost: 9000n }] });
    const st = await buy.supplierStatement(sup, '2026-10-30', '2026-10-30');
    expect(st).toMatchObject({ opening: 450000n, goods: 90000n, paid: 0n, total: 540000n, balance: 540000n });
  });
});

describe('bir martalik mijoz va foyda', () => {
  const unLine = (qty: bigint, cost: bigint | null) => ({
    productName: 'Un', qtyMilli: qty, unit: 'kg' as const, unitPrice: 13000n, rawText: null, productId: un, unitCost: cost,
  });

  it("bir martalik savdo to'liq to'lanadi va qarz yaratmaydi; ro'yxatda ko'rinmaydi", async () => {
    const w = await ledger.ensureWalkinCustomer();
    expect(await ledger.ensureWalkinCustomer()).toBe(w);
    const r = await ledger.postSale({ clientOpId: 'w1', customerId: w, rawInput: null, lines: [unLine(10000n, 11000n)], paid: { method: 'naqd', amount: 130000n } });
    expect(r.total).toBe(130000n);
    expect((await ledger.getCustomer(w))!.outstanding).toBe(0n);
    expect((await ledger.listCustomers()).map((c) => c.id)).not.toContain(w);
  });

  it("bir martalik mijoz qarzga ololmaydi: to'lovsiz yoki kam to'lovli savdo rad etiladi", async () => {
    const w = await ledger.ensureWalkinCustomer();
    await expect(ledger.postSale({ clientOpId: 'w2', customerId: w, rawInput: null, lines: [unLine(10000n, null)] })).rejects.toBeInstanceOf(PaymentError);
    await expect(ledger.postSale({ clientOpId: 'w3', customerId: w, rawInput: null, lines: [unLine(10000n, null)], paid: { method: 'naqd', amount: 1000n } })).rejects.toBeInstanceOf(PaymentError);
    expect(count('sales')).toBe(0);
  });

  it("bir martalik savdo bekor qilinsa pul ham qaytariladi (to'lov bekor), qoldiq tiklanadi", async () => {
    await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: [{ productId: un, qtyMilli: 20000n, unitCost: 11000n }] });
    const w = await ledger.ensureWalkinCustomer();
    const r = await ledger.postSale({ clientOpId: 'w4', customerId: w, rawInput: null, lines: [unLine(10000n, 11000n)], paid: { method: 'naqd', amount: 130000n } });
    expect(await buy.stockOf(un)).toBe(10000n);
    await ledger.reverseSale({ saleId: r.saleId, reason: 'qaytarildi', clientOpId: 'rv' });
    expect(await buy.stockOf(un)).toBe(20000n);
    expect(count('payment_voids')).toBe(1);
    expect((await ledger.getCustomer(w))!.paid).toBe(0n);
  });

  it("doimiy mijoz: qisman to'lov bilan savdo qolgan qarzni qoldiradi; to'lov jamidan katta bo'lsa rad", async () => {
    const cid = await ledger.createCustomer({ name: 'Akmal' });
    await ledger.postSale({ clientOpId: 'c1', customerId: cid, rawInput: null, lines: [unLine(10000n, null)], paid: { method: 'naqd', amount: 30000n } });
    expect((await ledger.getCustomer(cid))!.outstanding).toBe(100000n);
    await expect(ledger.postSale({ clientOpId: 'c2', customerId: cid, rawInput: null, lines: [unLine(1000n, null)], paid: { method: 'naqd', amount: 13001n } })).rejects.toBeInstanceOf(PaymentError);
  });

  it("savdo qatorida tan narx snapshot saqlanadi; keyingi kirim uni o'zgartirmaydi", async () => {
    const w = await ledger.ensureWalkinCustomer();
    await ledger.postSale({ clientOpId: 'w5', customerId: w, rawInput: null, lines: [unLine(10000n, 11000n)], paid: { method: 'naqd', amount: 130000n } });
    await buy.postPurchase({ clientOpId: 'k9', supplierId: sup, lines: [{ productId: un, qtyMilli: 1000n, unitCost: 20000n }] });
    const row = db.raw.prepare('SELECT unit_cost AS c, product_id AS p FROM sale_lines').get() as { c: number; p: string };
    expect(row).toEqual({ c: 11000, p: un });
  });
});

describe('katalog', () => {
  it("tarixi bor tovarni o'chirib bo'lmaydi, arxivlash ro'yxatdan yashiradi", async () => {
    const catalog = createCatalog(db, deps);
    await buy.postPurchase({ clientOpId: 'k1', supplierId: sup, lines: lines() });
    await expect(catalog.deleteProduct(un)).rejects.toThrow(/arxivlang/);
    await catalog.setProductActive(un, false);
    expect((await catalog.listProducts()).map((p) => p.id)).not.toContain(un);
    expect((await catalog.listProducts('', { includeArchived: true })).map((p) => p.id)).toContain(un);
    const unused = await catalog.saveProduct({ name: 'Tuz', unit: 'kg', unitPrice: 3000n });
    await catalog.deleteProduct(unused);
    expect((await catalog.listProducts('Tuz')).length).toBe(0);
  });
});
