/**
 * Demo rejimi (npm run demo): soxta ma'lumot va soxta Supabase klienti veb panelning haqiqiy data qatlami (api.ts, books.ts)
 * orqali o'qiladi. Raqamlar: savdo 385 000; kirim 1 450 000 / berildi 1 000 000 / ostatka 450 000.
 */
import { describe, expect, it } from 'vitest';
import { listCustomers, listProducts, listSales, postSale, getMembership } from '@/lib/data/api';
import { loadBooks, supplierTotals } from '@/lib/data/books';
import { calculateDocument, calculatePurchase } from '@hisobchi/core';
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
    const totals = sales.map((s) => s.subtotal);
    expect(totals).toContain(385_000n);
    expect(totals).toContain(70_500n);
    expect(sales.length).toBeGreaterThanOrEqual(15);
    expect(sales.length).toBeLessThanOrEqual(20);
    const customers = await listCustomers(sb, shopId);
    expect(customers.filter((c) => c.kind === 'one_time')).toHaveLength(1);
    const regular = customers.filter((c) => c.kind !== 'one_time');
    expect(regular.length).toBeGreaterThanOrEqual(6);
    expect(regular.length).toBeLessThanOrEqual(8);
    const products = await listProducts(sb, shopId);
    expect(products.length).toBeGreaterThanOrEqual(25);
  });

  it('kirim 1 450 000, berildi 1 000 000, qoldiq: guruch 90 kg', async () => {
    const { sb, shopId } = setup();
    const b = await loadBooks(sb, shopId);
    const anvar = b.suppliers.find((s) => s.name === 'Anvar ulgurji')!;
    const anvarDocs = b.purchases.filter((p) => p.supplier_id === anvar.id);
    expect(anvarDocs).toHaveLength(1);
    expect(anvarDocs[0]!.subtotal).toBe(1_450_000n);
    expect(b.payments.filter((p) => p.supplier_id === anvar.id).reduce((s, p) => s + p.amount, 0n)).toBe(1_000_000n);
    expect(supplierTotals(b).get(anvar.id)?.outstanding).toBe(450_000n);
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

type R = Record<string, unknown>;

describe('kengaytirilgan demo (PANEL-2 S8)', () => {
  it("har savdo jami core bilan qayta hisoblanganda qatorlar yig'indisiga teng; telefon yo'q", () => {
    const { db } = setup();
    const docs = db.documents as R[];
    const lines = db.document_lines as R[];
    expect(docs.length).toBeGreaterThanOrEqual(15);
    for (const d of docs) {
      const mine = lines.filter((l) => l.document_id === d.id);
      expect(mine.length).toBeGreaterThan(0);
      const calc = calculateDocument(mine.map((l) => ({ qtyMilli: BigInt(l.qty_milli as string), unitPrice: BigInt(l.unit_price as string) })));
      expect(calc.subtotal.toString()).toBe(d.subtotal);
      mine.forEach((l) => expect(l.line_total).toBe(calculateDocument([{ qtyMilli: BigInt(l.qty_milli as string), unitPrice: BigInt(l.unit_price as string) }]).subtotal.toString()));
    }
    const people = [...(db.customers as R[]), ...(db.suppliers as R[])];
    expect(people.every((r) => r.phone === null)).toBe(true);
  });

  it("ta'minotchilar Rahim aka va Abbosxon: qarz bor, summalar to'qilgan (haqiqiy 46 431 000 / 13 755 000 emas)", async () => {
    const { sb, shopId, db } = setup();
    const b = await loadBooks(sb, shopId);
    const totals = supplierTotals(b);
    const rahim = b.suppliers.find((s) => s.name.startsWith('Rahim aka'))!;
    const abbos = b.suppliers.find((s) => s.name.startsWith('Abbosxon'))!;
    expect(totals.get(rahim.id)!.outstanding).toBeGreaterThan(0n);
    expect(totals.get(abbos.id)!.outstanding).toBeGreaterThan(0n);
    for (const t of totals.values()) {
      expect(t.outstanding).not.toBe(46_431_000n);
      expect(t.outstanding).not.toBe(13_755_000n);
    }
    // Rahim: ochilish qoldig'i 3 200 000 (qatorsiz yozuv) + kirim qatorlari (core) − to'lovlar
    const docs = (db.purchase_documents as R[]).filter((p) => p.supplier_id === rahim.id);
    const opening = docs.filter((p) => p.kind === 'opening');
    expect(opening).toHaveLength(1);
    expect(opening[0]!.subtotal).toBe('3200000');
    const myLines = (db.purchase_lines as R[]).filter((l) => docs.some((d) => d.id === l.document_id));
    const lineGoods = calculatePurchase(myLines.map((l) => ({ qtyMilli: BigInt(l.qty_milli as string), unitCost: BigInt(l.unit_cost as string) }))).subtotal;
    const paid = b.payments.filter((p) => p.supplier_id === rahim.id).reduce((s, p) => s + p.amount, 0n);
    expect(totals.get(rahim.id)!.outstanding).toBe(3_200_000n + lineGoods - paid);
    const real = (db.purchase_documents as R[]).filter((p) => p.kind !== 'opening');
    expect(real.length).toBeGreaterThanOrEqual(3);
    expect(real.length).toBeLessThanOrEqual(5);
  });

  it("tan narx snapshot'i, narxi yo'q tovar, tugayotgan tovarlar, bugungi savdo bor", async () => {
    const { sb, shopId, db } = setup();
    const lines = db.document_lines as R[];
    expect(lines.some((l) => l.unit_cost === null)).toBe(true); // foydaga kirmaydigan qatorlar
    expect(lines.some((l) => typeof l.unit_cost === 'string')).toBe(true);
    const products = await listProducts(sb, shopId);
    expect(products.some((p) => p.last_price === null)).toBe(true); // narxi yo'q: qo'lda kiritiladi
    const b = await loadBooks(sb, shopId);
    expect(b.stock.filter((s) => s.qty_milli >= 0n && s.qty_milli <= 5_000n).length).toBeGreaterThanOrEqual(2);
    // product_stock faqat harakati bor tovarlar uchun (kuzatilmaydigan tovar "tugagan" ko'rinmasin)
    expect((db.product_stock as R[]).length).toBeLessThan(products.length);
    const docs = db.documents as R[];
    const sinceHours = (iso: unknown) => (Date.now() - new Date(iso as string).getTime()) / 3_600_000;
    expect(docs.some((d) => sinceHours(d.created_at) < 6)).toBe(true);
    // mijozsiz naqd, qarzga va qisman to'lovli savdolar
    expect(docs.some((d) => d.customer_id === null)).toBe(true);
    const payments = db.payments as R[];
    expect(payments.length).toBeGreaterThanOrEqual(4);
  });
});
