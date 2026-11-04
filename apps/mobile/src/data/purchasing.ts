/**
 * Ta'minotchilar, kirim hujjatlari, ta'minotchiga to'lov va ombor (qurilmadagi SQLite).
 *
 * - Kirim saqlash tartibi savdo bilan bir xil: client_op_id idempotent, TypeScript (core) va SQLite hisobi
 *   mustaqil solishtiriladi, mos kelmasa CalculationMismatchError va hech narsa saqlanmaydi.
 * - Hamma moliyaviy jadval append-only; tuzatish teskari yozuv bilan (reversePurchase, voidSupplierPayment).
 * - Ombor qoldig'i alohida saqlanmaydi: kirim - savdo (bekor qilinmaganlar) + tuzatish. Manfiy qoldiqqa ruxsat.
 */
import {
  MAX_QTY_MILLI,
  MAX_UNIT_PRICE,
  calculatePurchase,
  partnerStatement,
  settlePurchase,
  tashkentDate,
  type Settlement,
  type StatementEntry,
} from '@hisobchi/core';
import type { SqlConn, SqlDb, SqlParam } from './db';
import { CalculationMismatchError, PAYMENT_METHODS, PaymentError, SaleValidationError, verifyTotals, type PaymentMethod } from './ledger';

export class PurchaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurchaseError';
  }
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierWithBalance extends Supplier {
  /** Kirimlar (bekor qilinmaganlar) */
  goods: bigint;
  /** To'lovlar (bekor qilinmaganlar) */
  paid: bigint;
  /** Biz ta'minotchiga qarzmiz: kirim - to'lov. Manfiy = ortiqcha to'lov */
  outstanding: bigint;
  purchaseCount: number;
}

export interface PurchaseLineInput {
  productId: string;
  qtyMilli: bigint;
  unitCost: bigint;
}

export interface PostPurchaseInput {
  clientOpId: string;
  supplierId: string;
  /** Toshkent sanasi YYYY-MM-DD (standart: bugun) */
  docDate?: string;
  lines: PurchaseLineInput[];
  /** Shu kirim bilan berilgan to'lov */
  paid?: { method: PaymentMethod; amount: bigint } | null;
}

export interface PurchaseSummary {
  id: string;
  supplierId: string;
  supplierName: string;
  docDate: string;
  total: bigint;
  lineCount: number;
  createdAt: string;
  reversal: { reason: string; createdAt: string } | null;
}

export interface PurchaseLine {
  lineIndex: number;
  productId: string;
  productName: string;
  qtyMilli: bigint;
  unit: string;
  unitCost: bigint;
  lineTotal: bigint;
}

export interface PurchaseDetail extends PurchaseSummary {
  clientOpId: string;
  lines: PurchaseLine[];
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: bigint;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
  void: { reason: string; createdAt: string } | null;
}

export interface StockRow {
  productId: string;
  name: string;
  unit: string;
  qtyMilli: bigint;
  costPrice: bigint | null;
  salePrice: bigint;
  isActive: boolean;
}

export interface PurchasingDeps {
  newId: () => string;
  now: () => string;
}

const big = (v: string | null | undefined): bigint => BigInt(v ?? '0');

/** Kirimlar (bekor qilinmaganlar): ta'minotchi bo'yicha */
const GOODS_NET_SQL = (sid: string) =>
  `COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.supplier_id = ${sid}
     AND NOT EXISTS (SELECT 1 FROM purchase_reversals r WHERE r.purchase_id = p.id)), 0)`;
const PAID_NET_SQL = (sid: string) =>
  `COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = ${sid}
     AND NOT EXISTS (SELECT 1 FROM supplier_payment_voids v WHERE v.payment_id = sp.id)), 0)`;

/** Ta'minotchi qoldig'i (biz unga qarz): bitta qoida, hamma joyda shu ishlatiladi */
export async function supplierOutstanding(conn: SqlConn, supplierId: string): Promise<bigint> {
  const row = await conn.get<{ o: string }>(`SELECT CAST(${GOODS_NET_SQL('?')} - ${PAID_NET_SQL('?')} AS TEXT) AS o`, [supplierId, supplierId]);
  return big(row?.o);
}

/** Tovar qoldig'i: kirim - savdo (bekor qilinmaganlar) + tuzatish. Tovarga bog'lanmagan savdo qatori hisobga kirmaydi. */
const STOCK_SQL = (pid: string) => `(
  COALESCE((SELECT SUM(pl.qty_milli) FROM purchase_lines pl JOIN purchases pu ON pu.id = pl.purchase_id
            WHERE pl.product_id = ${pid} AND NOT EXISTS (SELECT 1 FROM purchase_reversals r WHERE r.purchase_id = pu.id)), 0)
  - COALESCE((SELECT SUM(sl.qty_milli) FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
            WHERE sl.product_id = ${pid} AND NOT EXISTS (SELECT 1 FROM sale_reversals r WHERE r.sale_id = s.id)), 0)
  + COALESCE((SELECT SUM(a.qty_milli) FROM stock_adjustments a WHERE a.product_id = ${pid}), 0))`;

export async function stockOf(conn: SqlConn, productId: string): Promise<bigint> {
  const row = await conn.get<{ q: string }>(`SELECT CAST(${STOCK_SQL('?')} AS TEXT) AS q`, [productId, productId, productId]);
  return big(row?.q);
}

function supplierRow(r: { id: string; name: string; phone: string | null; note: string | null; is_active: number; created_at: string; updated_at: string }): Supplier {
  return { id: r.id, name: r.name, phone: r.phone, note: r.note, isActive: r.is_active === 1, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function createPurchasing(db: SqlDb, deps: PurchasingDeps) {
  const today = () => tashkentDate(deps.now());

  return {
    // ------------------------------------------------------------------ ta'minotchilar
    async saveSupplier(input: { name: string; phone?: string; note?: string }, id?: string): Promise<string> {
      const name = input.name.trim().replace(/\s+/g, ' ');
      if (!name) throw new PurchaseError("Ta'minotchi nomi kiritilmagan");
      const now = deps.now();
      if (id) {
        const res = await db.get<{ id: string }>('SELECT id FROM suppliers WHERE id = ?', [id]);
        if (!res) throw new PurchaseError("Ta'minotchi topilmadi");
        await db.run('UPDATE suppliers SET name = ?, phone = ?, note = ?, updated_at = ? WHERE id = ?', [
          name, input.phone?.trim() || null, input.note?.trim() || null, now, id,
        ]);
        return id;
      }
      const newId = deps.newId();
      await db.run('INSERT INTO suppliers (id, name, phone, note, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', [
        newId, name, input.phone?.trim() || null, input.note?.trim() || null, now, now,
      ]);
      return newId;
    },

    /** Arxivlash (haqiqiy o'chirish yo'q: kirim tarixi saqlanadi) */
    async setSupplierActive(id: string, active: boolean): Promise<void> {
      await db.run('UPDATE suppliers SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, deps.now(), id]);
    },

    async listSuppliers(opts: { search?: string; includeArchived?: boolean } = {}): Promise<SupplierWithBalance[]> {
      const conds: string[] = [];
      const params: SqlParam[] = [];
      if (!opts.includeArchived) conds.push('s.is_active = 1');
      if (opts.search?.trim()) {
        conds.push('(s.name LIKE ? COLLATE NOCASE OR s.phone LIKE ?)');
        params.push(`%${opts.search.trim()}%`, `%${opts.search.trim()}%`);
      }
      const rows = await db.all<{
        id: string; name: string; phone: string | null; note: string | null; is_active: number; created_at: string; updated_at: string;
        goods: string; paid: string; purchase_count: number;
      }>(
        `SELECT s.id, s.name, s.phone, s.note, s.is_active, s.created_at, s.updated_at,
                CAST(${GOODS_NET_SQL('s.id')} AS TEXT) AS goods, CAST(${PAID_NET_SQL('s.id')} AS TEXT) AS paid,
                (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id
                   AND NOT EXISTS (SELECT 1 FROM purchase_reversals r WHERE r.purchase_id = p.id)) AS purchase_count
         FROM suppliers s ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY s.name COLLATE NOCASE`,
        params,
      );
      return rows.map((r) => ({ ...supplierRow(r), goods: big(r.goods), paid: big(r.paid), outstanding: big(r.goods) - big(r.paid), purchaseCount: r.purchase_count }));
    },

    async getSupplier(id: string): Promise<SupplierWithBalance | null> {
      return (await this.listSuppliers({ includeArchived: true })).find((s) => s.id === id) ?? null;
    },

    // ------------------------------------------------------------------ kirim
    async postPurchase(input: PostPurchaseInput): Promise<{ purchaseId: string; total: bigint; duplicate: boolean }> {
      return db.transaction(async (tx) => {
        const existing = await tx.get<{ id: string; total: string }>('SELECT id, CAST(total AS TEXT) AS total FROM purchases WHERE client_op_id = ?', [input.clientOpId]);
        if (existing) return { purchaseId: existing.id, total: big(existing.total), duplicate: true };

        const supplier = await tx.get<{ is_active: number }>('SELECT is_active FROM suppliers WHERE id = ?', [input.supplierId]);
        if (!supplier) throw new PurchaseError("Ta'minotchi topilmadi");
        if (supplier.is_active !== 1) throw new PurchaseError("Ta'minotchi arxivlangan");
        if (input.lines.length === 0) throw new PurchaseError("Kirimda kamida bitta tovar bo'lishi kerak");
        const docDate = input.docDate ?? today();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate) || docDate < '2000-01-01') throw new PurchaseError("Sana noto'g'ri");

        const products: { id: string; name: string; unit: string }[] = [];
        for (const l of input.lines) {
          if (l.qtyMilli <= 0n || l.qtyMilli > MAX_QTY_MILLI) throw new PurchaseError("Miqdor noto'g'ri");
          if (l.unitCost < 0n || l.unitCost > MAX_UNIT_PRICE) throw new PurchaseError("Tan narx noto'g'ri");
          const p = await tx.get<{ id: string; name: string; unit: string }>('SELECT id, name, unit FROM products WHERE id = ?', [l.productId]);
          if (!p) throw new PurchaseError('Tovar katalogda topilmadi');
          products.push(p);
        }

        // Ikki mustaqil hisob: core (BigInt) va SQLite
        const calc = calculatePurchase(input.lines);
        const check = await verifyTotals(tx, input.lines.map((l) => ({ qtyMilli: l.qtyMilli, unitPrice: l.unitCost })));
        if (!check.match || check.tsTotal !== calc.subtotal) throw new CalculationMismatchError({ ...check, tsTotal: calc.subtotal });

        const before = await supplierOutstanding(tx, input.supplierId);
        const paid = input.paid && input.paid.amount > 0n ? input.paid : null;
        if (paid) {
          if (!PAYMENT_METHODS.includes(paid.method)) throw new PaymentError("Noma'lum to'lov usuli");
          const s = settlePurchase(before, input.lines, paid.amount);
          if (!s.ok) throw new PaymentError(`${s.message}`);
        }

        const purchaseId = deps.newId();
        const createdAt = deps.now();
        const total = calc.subtotal.toString();
        await tx.run(
          `INSERT INTO purchases (id, client_op_id, supplier_id, doc_date, total, ts_total, sql_total, line_count, created_at)
           VALUES (?, ?, ?, ?, CAST(? AS INTEGER), CAST(? AS INTEGER), CAST(? AS INTEGER), ?, ?)`,
          [purchaseId, input.clientOpId, input.supplierId, docDate, total, calc.subtotal.toString(), check.sqlTotal.toString(), input.lines.length, createdAt],
        );
        for (const [i, l] of input.lines.entries()) {
          await tx.run(
            `INSERT INTO purchase_lines (id, purchase_id, line_index, product_id, product_name, qty_milli, unit, unit_cost, line_total)
             VALUES (?, ?, ?, ?, ?, CAST(? AS INTEGER), ?, CAST(? AS INTEGER), CAST(? AS INTEGER))`,
            [deps.newId(), purchaseId, i, l.productId, products[i].name, l.qtyMilli.toString(), products[i].unit, l.unitCost.toString(), calc.lines[i].lineTotal.toString()],
          );
          // Oxirgi kirim tan narxi
          await tx.run('UPDATE products SET cost_price = CAST(? AS INTEGER), updated_at = ? WHERE id = ?', [l.unitCost.toString(), createdAt, l.productId]);
        }
        const stored = await tx.get<{ recomputed: string }>(
          'SELECT CAST(SUM((qty_milli * unit_cost + 500) / 1000) AS TEXT) AS recomputed FROM purchase_lines WHERE purchase_id = ?',
          [purchaseId],
        );
        if (big(stored?.recomputed) !== calc.subtotal) throw new CalculationMismatchError({ ...check, sqlTotal: big(stored?.recomputed) });

        if (paid) {
          await tx.run(
            `INSERT INTO supplier_payments (id, client_op_id, supplier_id, amount, method, note, created_at)
             VALUES (?, ?, ?, CAST(? AS INTEGER), ?, 'kirim bilan', ?)`,
            [deps.newId(), `purchase-pay:${input.clientOpId}`, input.supplierId, paid.amount.toString(), paid.method, createdAt],
          );
        }
        return { purchaseId, total: calc.subtotal, duplicate: false };
      });
    },

    /** Teskari yozuv: qoldiq va ta'minotchi qoldig'i qaytadi, tan narx oldingi kirimga qaytadi */
    async reversePurchase(input: { purchaseId: string; reason: string; clientOpId: string }): Promise<{ reversalId: string; duplicate: boolean }> {
      const reason = input.reason.trim();
      if (reason.length < 3) throw new PurchaseError('Bekor qilish sababini yozing (kamida 3 ta belgi)');
      return db.transaction(async (tx) => {
        const same = await tx.get<{ id: string; purchase_id: string }>('SELECT id, purchase_id FROM purchase_reversals WHERE client_op_id = ?', [input.clientOpId]);
        if (same) {
          if (same.purchase_id !== input.purchaseId) throw new PurchaseError('Amal identifikatori boshqa kirimga tegishli');
          return { reversalId: same.id, duplicate: true };
        }
        const p = await tx.get<{ total: string; supplier_id: string }>('SELECT CAST(total AS TEXT) AS total, supplier_id FROM purchases WHERE id = ?', [input.purchaseId]);
        if (!p) throw new PurchaseError('Kirim topilmadi');
        if (await tx.get<{ id: string }>('SELECT id FROM purchase_reversals WHERE purchase_id = ?', [input.purchaseId])) {
          throw new PurchaseError('Bu kirim allaqachon bekor qilingan');
        }
        const reversalId = deps.newId();
        const at = deps.now();
        await tx.run(
          `INSERT INTO purchase_reversals (id, purchase_id, client_op_id, supplier_id, amount, reason, created_at) VALUES (?, ?, ?, ?, CAST(? AS INTEGER), ?, ?)`,
          [reversalId, input.purchaseId, input.clientOpId, p.supplier_id, p.total, reason, at],
        );
        // Tan narx: bekor qilingan kirimdagi tovarlar uchun oxirgi QOLGAN kirim narxi (yo'q bo'lsa NULL)
        const pids = await tx.all<{ product_id: string }>('SELECT DISTINCT product_id FROM purchase_lines WHERE purchase_id = ?', [input.purchaseId]);
        for (const { product_id } of pids) {
          await tx.run(
            `UPDATE products SET updated_at = ?, cost_price = (
               SELECT pl.unit_cost FROM purchase_lines pl JOIN purchases pu ON pu.id = pl.purchase_id
               WHERE pl.product_id = ? AND NOT EXISTS (SELECT 1 FROM purchase_reversals r WHERE r.purchase_id = pu.id)
               ORDER BY pu.created_at DESC, pu.rowid DESC, pl.line_index DESC LIMIT 1) WHERE id = ?`,
            [at, product_id, product_id],
          );
        }
        return { reversalId, duplicate: false };
      });
    },

    async listPurchases(opts: { supplierId?: string; fromDate?: string; toDate?: string; status?: 'all' | 'active' | 'reversed'; limit?: number } = {}): Promise<PurchaseSummary[]> {
      const conds: string[] = [];
      const params: SqlParam[] = [];
      if (opts.supplierId) { conds.push('p.supplier_id = ?'); params.push(opts.supplierId); }
      if (opts.fromDate) { conds.push('p.doc_date >= ?'); params.push(opts.fromDate); }
      if (opts.toDate) { conds.push('p.doc_date <= ?'); params.push(opts.toDate); }
      if (opts.status === 'active') conds.push('r.id IS NULL');
      if (opts.status === 'reversed') conds.push('r.id IS NOT NULL');
      const rows = await db.all<{ id: string; supplier_id: string; supplier_name: string; doc_date: string; total: string; line_count: number; created_at: string; reason: string | null; reversed_at: string | null }>(
        `SELECT p.id, p.supplier_id, s.name AS supplier_name, p.doc_date, CAST(p.total AS TEXT) AS total, p.line_count, p.created_at,
                r.reason, r.created_at AS reversed_at
         FROM purchases p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN purchase_reversals r ON r.purchase_id = p.id
         ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY p.doc_date DESC, p.created_at DESC, p.rowid DESC LIMIT ?`,
        [...params, opts.limit ?? 200],
      );
      return rows.map((r) => ({
        id: r.id, supplierId: r.supplier_id, supplierName: r.supplier_name, docDate: r.doc_date, total: big(r.total), lineCount: r.line_count,
        createdAt: r.created_at, reversal: r.reversed_at ? { reason: r.reason ?? '', createdAt: r.reversed_at } : null,
      }));
    },

    async getPurchase(id: string): Promise<PurchaseDetail | null> {
      const [head] = (await this.listPurchases({ limit: 100000 })).filter((p) => p.id === id);
      if (!head) return null;
      const op = await db.get<{ client_op_id: string }>('SELECT client_op_id FROM purchases WHERE id = ?', [id]);
      const lines = await db.all<{ line_index: number; product_id: string; product_name: string; qty_milli: string; unit: string; unit_cost: string; line_total: string }>(
        `SELECT line_index, product_id, product_name, CAST(qty_milli AS TEXT) AS qty_milli, unit, CAST(unit_cost AS TEXT) AS unit_cost, CAST(line_total AS TEXT) AS line_total
         FROM purchase_lines WHERE purchase_id = ? ORDER BY line_index`,
        [id],
      );
      return {
        ...head,
        clientOpId: op?.client_op_id ?? '',
        lines: lines.map((l) => ({ lineIndex: l.line_index, productId: l.product_id, productName: l.product_name, qtyMilli: big(l.qty_milli), unit: l.unit, unitCost: big(l.unit_cost), lineTotal: big(l.line_total) })),
      };
    },

    // ------------------------------------------------------------------ ta'minotchiga to'lov
    async recordSupplierPayment(input: { supplierId: string; amount: bigint; method: PaymentMethod; note?: string; clientOpId: string }): Promise<{ paymentId: string; duplicate: boolean }> {
      if (input.amount <= 0n) throw new PaymentError("To'lov summasi musbat bo'lishi kerak");
      if (!PAYMENT_METHODS.includes(input.method)) throw new PaymentError("Noma'lum to'lov usuli");
      return db.transaction(async (tx) => {
        const same = await tx.get<{ id: string; supplier_id: string; amount: string }>('SELECT id, supplier_id, CAST(amount AS TEXT) AS amount FROM supplier_payments WHERE client_op_id = ?', [input.clientOpId]);
        if (same) {
          if (same.supplier_id !== input.supplierId || big(same.amount) !== input.amount) throw new PaymentError("Amal identifikatori boshqa to'lovga tegishli");
          return { paymentId: same.id, duplicate: true };
        }
        if (!(await tx.get<{ id: string }>('SELECT id FROM suppliers WHERE id = ?', [input.supplierId]))) throw new PaymentError("Ta'minotchi topilmadi");
        const outstanding = await supplierOutstanding(tx, input.supplierId);
        if (outstanding <= 0n) throw new PaymentError("Ta'minotchiga qarz yo'q — to'lov qabul qilinmadi");
        if (input.amount > outstanding) throw new PaymentError(`To'lov qarzdan katta (qarz: ${outstanding} so'm)`);
        const paymentId = deps.newId();
        await tx.run(
          `INSERT INTO supplier_payments (id, client_op_id, supplier_id, amount, method, note, created_at) VALUES (?, ?, ?, CAST(? AS INTEGER), ?, ?, ?)`,
          [paymentId, input.clientOpId, input.supplierId, input.amount.toString(), input.method, input.note?.trim() || null, deps.now()],
        );
        return { paymentId, duplicate: false };
      });
    },

    async voidSupplierPayment(input: { paymentId: string; reason: string }): Promise<void> {
      const reason = input.reason.trim();
      if (reason.length < 3) throw new PaymentError('Sababni yozing (kamida 3 ta belgi)');
      await db.transaction(async (tx) => {
        if (!(await tx.get<{ id: string }>('SELECT id FROM supplier_payments WHERE id = ?', [input.paymentId]))) throw new PaymentError("To'lov topilmadi");
        if (await tx.get<{ id: string }>('SELECT id FROM supplier_payment_voids WHERE payment_id = ?', [input.paymentId])) throw new PaymentError("Bu to'lov allaqachon bekor qilingan");
        await tx.run('INSERT INTO supplier_payment_voids (id, payment_id, reason, created_at) VALUES (?, ?, ?, ?)', [deps.newId(), input.paymentId, reason, deps.now()]);
      });
    },

    async listSupplierPayments(opts: { supplierId?: string; limit?: number } = {}): Promise<SupplierPayment[]> {
      const rows = await db.all<{ id: string; supplier_id: string; supplier_name: string; amount: string; method: PaymentMethod; note: string | null; created_at: string; reason: string | null; voided_at: string | null }>(
        `SELECT sp.id, sp.supplier_id, s.name AS supplier_name, CAST(sp.amount AS TEXT) AS amount, sp.method, sp.note, sp.created_at,
                v.reason, v.created_at AS voided_at
         FROM supplier_payments sp JOIN suppliers s ON s.id = sp.supplier_id LEFT JOIN supplier_payment_voids v ON v.payment_id = sp.id
         ${opts.supplierId ? 'WHERE sp.supplier_id = ?' : ''} ORDER BY sp.created_at DESC, sp.rowid DESC LIMIT ?`,
        opts.supplierId ? [opts.supplierId, opts.limit ?? 200] : [opts.limit ?? 200],
      );
      return rows.map((r) => ({
        id: r.id, supplierId: r.supplier_id, supplierName: r.supplier_name, amount: big(r.amount), method: r.method, note: r.note, createdAt: r.created_at,
        void: r.voided_at ? { reason: r.reason ?? '', createdAt: r.voided_at } : null,
      }));
    },

    // ------------------------------------------------------------------ ombor
    /** Qoldiq tuzatish (+-): sabab majburiy, idempotent */
    async adjustStock(input: { productId: string; qtyMilli: bigint; reason: string; clientOpId: string }): Promise<{ adjustmentId: string; duplicate: boolean }> {
      const reason = input.reason.trim();
      if (reason.length < 3) throw new SaleValidationError('Sababni yozing (kamida 3 ta belgi)');
      if (input.qtyMilli === 0n || input.qtyMilli > MAX_QTY_MILLI || input.qtyMilli < -MAX_QTY_MILLI) throw new SaleValidationError("Miqdor noto'g'ri");
      return db.transaction(async (tx) => {
        const same = await tx.get<{ id: string }>('SELECT id FROM stock_adjustments WHERE client_op_id = ?', [input.clientOpId]);
        if (same) return { adjustmentId: same.id, duplicate: true };
        if (!(await tx.get<{ id: string }>('SELECT id FROM products WHERE id = ?', [input.productId]))) throw new SaleValidationError('Tovar topilmadi');
        const id = deps.newId();
        await tx.run('INSERT INTO stock_adjustments (id, client_op_id, product_id, qty_milli, reason, created_at) VALUES (?, ?, ?, CAST(? AS INTEGER), ?, ?)', [
          id, input.clientOpId, input.productId, input.qtyMilli.toString(), reason, deps.now(),
        ]);
        return { adjustmentId: id, duplicate: false };
      });
    },

    stockOf(productId: string): Promise<bigint> {
      return stockOf(db, productId);
    },

    async listStock(opts: { search?: string; includeArchived?: boolean } = {}): Promise<StockRow[]> {
      const conds: string[] = [];
      const params: SqlParam[] = [];
      if (!opts.includeArchived) conds.push('p.is_active = 1');
      if (opts.search?.trim()) { conds.push('p.name LIKE ? COLLATE NOCASE'); params.push(`%${opts.search.trim()}%`); }
      const rows = await db.all<{ id: string; name: string; unit: string; q: string; cost: string | null; price: string; is_active: number }>(
        `SELECT p.id, p.name, p.unit, CAST(${STOCK_SQL('p.id')} AS TEXT) AS q, CAST(p.cost_price AS TEXT) AS cost, CAST(p.unit_price AS TEXT) AS price, p.is_active
         FROM products p ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY p.name COLLATE NOCASE`,
        params,
      );
      return rows.map((r) => ({ productId: r.id, name: r.name, unit: r.unit, qtyMilli: big(r.q), costPrice: r.cost === null ? null : big(r.cost), salePrice: big(r.price), isActive: r.is_active === 1 }));
    },

    // ------------------------------------------------------------------ oldi-berdi (core bilan; SQL qoidalari bilan bir xil)
    async supplierStatement(supplierId: string, from: string, to: string): Promise<Settlement> {
      const purchases = await db.all<{ doc_date: string; total: string; reversed: number }>(
        `SELECT p.doc_date, CAST(p.total AS TEXT) AS total, EXISTS (SELECT 1 FROM purchase_reversals r WHERE r.purchase_id = p.id) AS reversed
         FROM purchases p WHERE p.supplier_id = ?`,
        [supplierId],
      );
      const pays = await db.all<{ created_at: string; amount: string; voided: number }>(
        `SELECT sp.created_at, CAST(sp.amount AS TEXT) AS amount, EXISTS (SELECT 1 FROM supplier_payment_voids v WHERE v.payment_id = sp.id) AS voided
         FROM supplier_payments sp WHERE sp.supplier_id = ?`,
        [supplierId],
      );
      const entries: StatementEntry[] = [
        ...purchases.map((p) => ({ kind: 'goods' as const, date: p.doc_date, amount: big(p.total), cancelled: p.reversed === 1 })),
        ...pays.map((p) => ({ kind: 'payment' as const, date: tashkentDate(p.created_at), amount: big(p.amount), cancelled: p.voided === 1 })),
      ];
      return partnerStatement(entries, from, to);
    },

    async customerStatement(customerId: string, from: string, to: string): Promise<Settlement> {
      const sales = await db.all<{ created_at: string; total: string; reversed: number }>(
        `SELECT s.created_at, CAST(s.total AS TEXT) AS total, EXISTS (SELECT 1 FROM sale_reversals r WHERE r.sale_id = s.id) AS reversed FROM sales s WHERE s.customer_id = ?`,
        [customerId],
      );
      const pays = await db.all<{ created_at: string; amount: string; voided: number }>(
        `SELECT p.created_at, CAST(p.amount AS TEXT) AS amount, EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id) AS voided FROM payments p WHERE p.customer_id = ?`,
        [customerId],
      );
      const entries: StatementEntry[] = [
        ...sales.map((s) => ({ kind: 'goods' as const, date: tashkentDate(s.created_at), amount: big(s.total), cancelled: s.reversed === 1 })),
        ...pays.map((p) => ({ kind: 'payment' as const, date: tashkentDate(p.created_at), amount: big(p.amount), cancelled: p.voided === 1 })),
      ];
      return partnerStatement(entries, from, to);
    },
  };
}

export type Purchasing = ReturnType<typeof createPurchasing>;
