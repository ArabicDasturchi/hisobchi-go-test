/**
 * RPC kontrakti: mobil sinxronlash yuboradigan argument nomlari va qiymat formatlari
 * supabase/migrations/003_security_and_mvp_rpc.sql dagi haqiqiy funksiya imzolariga mosligi.
 * (Jonli bazada ham aniq nomlar bilan tekshirilgan — docs/arxiv/PROGRESS.md.)
 * Shuningdek: avtomatik sinxronlash yordamchilari va mijozni xavfsiz o'chirish.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateLineTotal } from '@hisobchi/core';
import { CloudError, toCloudError, type CloudClient, type CloudResult } from '../src/backend/cloud';
import { isPushed, loadSyncMeta, nextSyncDelay, pushToCloud, saveSyncMeta, SYNC_BASE_DELAY_MS, SYNC_MAX_DELAY_MS } from '../src/backend/sync';
import { createLedger, SaleValidationError, type Ledger } from '../src/data/ledger';
import { migrate } from '../src/data/schema';
import { openMemoryDb } from './node-sqlite';

const MIG = (f: string) => readFileSync(join(__dirname, '../../../supabase/migrations', f), 'utf8');
// Funksiya oxirgi migratsiyadagi (006/007 003 ni almashtiradi) imzosi bo'yicha tekshiriladi
const SQL = [MIG('003_security_and_mvp_rpc.sql'), MIG('006_partners_stock.sql'), MIG('007_purchases.sql')].join('\n');

/** SQL'dagi funksiya parametr nomlari (tartib bilan) */
function sqlParams(fn: string): string[] {
  const all = [...SQL.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(([\\s\\S]*?)\\)\\s*RETURNS`, 'g'))];
  const m = all[all.length - 1];
  if (!m) throw new Error(`SQL'da ${fn} topilmadi`);
  return m[1]
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
}

class RecordingCloud implements CloudClient {
  calls: { fn: string; args: Record<string, unknown> }[] = [];
  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<CloudResult<T>> {
    this.calls.push({ fn, args });
    return { data: 'ok' as T, error: null };
  }
  async upsert(table: string, rows: Record<string, unknown>[]) {
    this.calls.push({ fn: `upsert:${table}`, args: { rows } });
    return { data: null, error: null };
  }
  async selectAll<T>(): Promise<CloudResult<T[]>> {
    return { data: [], error: null };
  }
}

let db: ReturnType<typeof openMemoryDb>;
let ledger: Ledger;
let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 30, 9, 0, clock++)).toISOString();

beforeEach(async () => {
  db = openMemoryDb();
  await migrate(db);
  clock = 0;
  ledger = createLedger(db, { newId: () => randomUUID(), now });
});

describe('RPC kontrakti (SQL imzo ↔ mobil argumentlar)', () => {
  it("post_sale, reverse_sale, record_payment, void_payment — nomlar aynan mos, pul string, qty_milli SQL formulasiga mos", async () => {
    const cid = await ledger.createCustomer({ name: 'A' });
    // 1,5 kg × 13 333 so'm = 19 999,5 → yaxlitlash 20 000 (SQL: (1500*13333+500)/1000)
    const sale = await ledger.postSale({
      clientOpId: 'op',
      customerId: cid,
      rawInput: null,
      lines: [{ productName: 'un', qtyMilli: 1500n, unit: 'kg', unitPrice: 13333n, rawText: null }],
    });
    const pay = await ledger.recordPayment({ customerId: cid, amount: 5000n, method: 'karta', clientOpId: 'p' });
    await ledger.voidPayment({ paymentId: pay.paymentId, reason: 'xato' });
    await ledger.reverseSale({ saleId: sale.saleId, reason: 'qaytdi', clientOpId: 'r' });

    const cloud = new RecordingCloud();
    const res = await pushToCloud(db, cloud, 'shop', { now });
    expect(res.error).toBeNull();

    for (const fn of ['post_sale', 'reverse_sale', 'record_payment', 'void_payment']) {
      const call = cloud.calls.find((c) => c.fn === fn);
      expect(call, fn).toBeDefined();
      expect(Object.keys(call!.args).sort(), fn).toEqual(sqlParams(fn).sort());
    }
    const post = cloud.calls.find((c) => c.fn === 'post_sale')!.args;
    expect(post.p_client_total).toBe('20000');
    expect(calculateLineTotal(1500n, 13333n)).toBe(20000n);
    expect(post.p_lines).toEqual([{ product_name: 'un', qty_milli: '1500', unit: 'kg', unit_price: '13333', raw_text: null, product_id: null, unit_cost: null }]);
    // SQL qatorni qanday o'qiydi: v_line->>'qty_milli' va 'unit_price' — kalitlar mos
    expect(SQL).toContain("v_line->>'qty_milli'");
    expect(SQL).toContain("v_line->>'unit_price'");
    expect(SQL).toContain("v_line->>'product_name'");
    // Server qator summasi: 001 dagi calculate_line_total — mobil core bilan bir xil formula
    const SQL001 = readFileSync(join(__dirname, '../../../supabase/migrations/001_initial_schema.sql'), 'utf8');
    expect(SQL001).toContain('RETURN (p_qty_milli * p_unit_price + 500) / 1000;');
    expect(cloud.calls.find((c) => c.fn === 'record_payment')!.args).toMatchObject({ p_amount: '5000', p_method: 'karta' });
  });

  it("kirim, ta'minotchi to'lovi, ombor, bir martalik mijoz — nomlar SQL bilan aynan mos", async () => {
    const { createPurchasing } = await import('../src/data/purchasing');
    const { createCatalog } = await import('../src/data/catalog');
    const buy = createPurchasing(db, { newId: () => randomUUID(), now });
    const sup = await buy.saveSupplier({ name: 'Baraka' });
    const pid = await createCatalog(db, { newId: () => randomUUID(), now }).saveProduct({ name: 'Un', unit: 'kg', unitPrice: 13000n });
    const p = await buy.postPurchase({ clientOpId: 'k', supplierId: sup, lines: [{ productId: pid, qtyMilli: 100000n, unitCost: 9000n }], paid: { method: 'naqd', amount: 400000n } });
    await buy.recordSupplierPayment({ supplierId: sup, amount: 100000n, method: 'karta', clientOpId: 'sp' });
    const sp = (await buy.listSupplierPayments())[0];
    await buy.voidSupplierPayment({ paymentId: sp.id, reason: 'xato' });
    await buy.adjustStock({ productId: pid, qtyMilli: -1000n, reason: 'sinish', clientOpId: 'adj' });
    await buy.reversePurchase({ purchaseId: p.purchaseId, reason: 'xato kirim', clientOpId: 'rp' });
    const w = await ledger.ensureWalkinCustomer();
    await ledger.postSale({ clientOpId: 'ws', customerId: w, rawInput: null, lines: [{ productName: 'Un', qtyMilli: 1000n, unit: 'kg', unitPrice: 13000n, rawText: null, productId: pid, unitCost: 9000n }], paid: { method: 'naqd', amount: 13000n } });

    const cloud = new RecordingCloud();
    const res = await pushToCloud(db, cloud, 'shop', { now });
    expect(res.error).toBeNull();
    for (const fn of ['post_purchase', 'reverse_purchase', 'record_supplier_payment', 'void_supplier_payment', 'adjust_stock', 'post_sale']) {
      const call = cloud.calls.find((c) => c.fn === fn);
      expect(call, fn).toBeDefined();
      expect(Object.keys(call!.args).sort(), fn).toEqual(sqlParams(fn).sort());
    }
    const ensure = cloud.calls.find((c) => c.fn === 'ensure_walkin_customer')!;
    expect(Object.keys(ensure.args)).toEqual(sqlParams('ensure_walkin_customer'));

    const purchase = cloud.calls.find((c) => c.fn === 'post_purchase')!.args;
    expect(purchase).toMatchObject({ p_client_total: '900000', p_paid: '400000', p_payment_method: 'naqd', p_doc_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(purchase.p_lines).toEqual([{ product_id: pid, product_name: 'Un', qty_milli: '100000', unit: 'kg', unit_cost: '9000' }]);
    // SQL kirim qatorini shu kalitlar bilan o'qiydi
    for (const k of ['qty_milli', 'unit_cost', 'product_id']) expect(SQL).toContain(`v_line->>'${k}'`);
    // Bir martalik savdo: to'lov savdoga qo'shilgan, alohida record_payment yo'q
    const walkSale = cloud.calls.filter((c) => c.fn === 'post_sale').at(-1)!.args;
    expect(walkSale).toMatchObject({ p_paid: '13000', p_payment_method: 'naqd' });
    expect(cloud.calls.filter((c) => c.fn === 'record_payment')).toHaveLength(0);
    expect(cloud.calls.filter((c) => c.fn === 'record_supplier_payment')).toHaveLength(1); // 'kirim bilan' to'lovi alohida emas
    // Mahalliy bir martalik mijoz serverga upsert qilinmaydi
    const upserts = cloud.calls.filter((c) => c.fn === 'upsert:customers').flatMap((c) => c.args.rows as { id: string }[]);
    expect(upserts.map((r) => r.id)).not.toContain(w);
  });

  it("create_shop imzosi — p_name", () => {
    expect(sqlParams('create_shop')).toEqual(['p_name']);
  });

  it("to'lov usullari SQL CHECK bilan bir xil", async () => {
    const { PAYMENT_METHODS } = await import('../src/data/ledger');
    expect(SQL).toContain(`method IN (${PAYMENT_METHODS.map((m) => `'${m}'`).join(', ')})`);
  });
});

describe('avtomatik sinxronlash yordamchilari', () => {
  it("oxirgi natija saqlanadi va qayta o'qiladi (ilova qayta ochilganda)", async () => {
    expect(await loadSyncMeta(db)).toEqual({ lastSyncAt: null, lastError: null });
    await saveSyncMeta(db, { lastSyncAt: '2026-10-30T09:00:00.000Z', lastError: null }, now());
    expect(await loadSyncMeta(db)).toEqual({ lastSyncAt: '2026-10-30T09:00:00.000Z', lastError: null });
    await saveSyncMeta(db, { lastSyncAt: '2026-10-30T09:00:00.000Z', lastError: "Internet yo'q" }, now());
    expect((await loadSyncMeta(db)).lastError).toBe("Internet yo'q");
  });

  it('isPushed — faqat server tasdiqlagandan keyin true', async () => {
    const s = await ledger.postSale({ clientOpId: 'a', customerId: null, rawInput: null, lines: [{ productName: 'n', qtyMilli: 1000n, unit: 'dona', unitPrice: 1n, rawText: null }] });
    expect(await isPushed(db, 'shop', 'sale', s.saleId)).toBe(false);
    const failing: CloudClient = {
      rpc: async () => ({ data: null, error: { message: 'Network request failed: timeout' } }),
      upsert: async () => ({ data: null, error: null }),
      selectAll: async () => ({ data: [], error: null }),
    };
    const r = await pushToCloud(db, failing, 'shop', { now });
    expect(r.error?.kind).toBe('network');
    expect(await isPushed(db, 'shop', 'sale', s.saleId)).toBe(false);
    await pushToCloud(db, new RecordingCloud(), 'shop', { now });
    expect(await isPushed(db, 'shop', 'sale', s.saleId)).toBe(true);
  });

  it('qayta urinish oralig\'i: tarmoqda eksponensial (maks 5 daq), ruxsat/validatsiyada to\'xtaydi', () => {
    const net = new CloudError('network', 'x');
    expect(nextSyncDelay(null, null)).toBe(SYNC_BASE_DELAY_MS);
    expect(nextSyncDelay(SYNC_BASE_DELAY_MS, net)).toBe(SYNC_BASE_DELAY_MS * 2);
    expect(nextSyncDelay(SYNC_MAX_DELAY_MS, net)).toBe(SYNC_MAX_DELAY_MS);
    expect(nextSyncDelay(SYNC_BASE_DELAY_MS, new CloudError('forbidden', 'x'))).toBeNull();
    expect(nextSyncDelay(SYNC_BASE_DELAY_MS, new CloudError('validation', 'x'))).toBeNull();
    expect(nextSyncDelay(SYNC_BASE_DELAY_MS, toCloudError({ message: 'Network request failed: timeout' }))).toBe(SYNC_BASE_DELAY_MS * 2);
  });
});

describe("mijozni xavfsiz o'chirish", () => {
  it("tarixsiz va yuborilmagan mijoz o'chiriladi", async () => {
    const id = await ledger.createCustomer({ name: 'Bo\'sh' });
    await ledger.deleteCustomer(id);
    expect(await ledger.getCustomer(id)).toBeNull();
  });

  it("savdo yoki to'lov tarixi bor mijoz o'chirilmaydi", async () => {
    const id = await ledger.createCustomer({ name: 'Tarixli' });
    await ledger.postSale({ clientOpId: 's', customerId: id, rawInput: null, lines: [{ productName: 'n', qtyMilli: 1000n, unit: 'dona', unitPrice: 100n, rawText: null }] });
    await expect(ledger.deleteCustomer(id)).rejects.toThrow(/tarixi bor/);
    expect(await ledger.getCustomer(id)).not.toBeNull();
  });

  it("bulutga yuborilgan mijoz o'chirilmaydi", async () => {
    const id = await ledger.createCustomer({ name: 'Bulutda' });
    await pushToCloud(db, new RecordingCloud(), 'shop', { now });
    await expect(ledger.deleteCustomer(id)).rejects.toBeInstanceOf(SaleValidationError);
  });
});

describe("lokal baza ↔ bulut do'koni bog'lanishi", () => {
  it("birinchi do'konga bog'lanadi; boshqa do'kon bilan sinxronlash bloklanadi", async () => {
    const { ensureShopBinding } = await import('../src/backend/sync');
    expect(await ensureShopBinding(db, 'shop-A', now())).toEqual({ ok: true });
    expect(await ensureShopBinding(db, 'shop-A', now())).toEqual({ ok: true });
    const other = await ensureShopBinding(db, 'shop-B', now());
    expect(other.ok).toBe(false);
    if (!other.ok) {
      expect(other.error.kind).toBe('forbidden');
      expect(other.error.message).toMatch(/boshqa hisob/);
    }
    // bog'lanish kaliti do'kon sozlamalari ro'yxatiga aralashmaydi
    const { createCatalog } = await import('../src/data/catalog');
    expect(Object.keys(await createCatalog(db, { newId: () => randomUUID(), now }).getSettings())).toEqual(['shop_name', 'shop_phone', 'shop_address']);
  });
});
