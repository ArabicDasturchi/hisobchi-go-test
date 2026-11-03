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

const SQL = readFileSync(join(__dirname, '../../../supabase/migrations/003_security_and_mvp_rpc.sql'), 'utf8');

/** SQL'dagi funksiya parametr nomlari (tartib bilan) */
function sqlParams(fn: string): string[] {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(([^)]*)\\)`, 's').exec(SQL);
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
    expect(post.p_lines).toEqual([{ product_name: 'un', qty_milli: '1500', unit: 'kg', unit_price: '13333', raw_text: null }]);
    // SQL qatorni qanday o'qiydi: v_line->>'qty_milli' va 'unit_price' — kalitlar mos
    expect(SQL).toContain("v_line->>'qty_milli'");
    expect(SQL).toContain("v_line->>'unit_price'");
    expect(SQL).toContain("v_line->>'product_name'");
    // Server qator summasi: 001 dagi calculate_line_total — mobil core bilan bir xil formula
    const SQL001 = readFileSync(join(__dirname, '../../../supabase/migrations/001_initial_schema.sql'), 'utf8');
    expect(SQL001).toContain('RETURN (p_qty_milli * p_unit_price + 500) / 1000;');
    expect(cloud.calls.find((c) => c.fn === 'record_payment')!.args).toMatchObject({ p_amount: '5000', p_method: 'karta' });
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
