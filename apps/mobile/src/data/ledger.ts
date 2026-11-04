/**
 * Mijozlar va savdolar ledgeri (qurilmadagi SQLite).
 *
 * Savdo saqlash tartibi (bitta eksklyuziv tranzaksiya):
 *   1. client_op_id oldin ishlatilganmi — ha bo'lsa mavjud savdo qaytariladi.
 *   2. @hisobchi/core validateDocument — bloklovchi xato bo'lsa rad etiladi.
 *   3. TypeScript BigInt hisobi (calculateDocument).
 *   4. SQLite'da mustaqil hisob (verifyTotalsSql).
 *   5. Natijalar mos kelmasa — CalculationMismatchError, hech narsa saqlanmaydi.
 *   6. sales, sale_lines (CHECK formulasi bilan), ledger_entries yoziladi.
 *   7. Yozilgan qatorlar SQL'da qayta yig'iladi va yana solishtiriladi.
 */

import {
  ALLOWED_UNITS,
  MAX_UNIT_PRICE,
  calculateDocument,
  checkSalePayment,
  validateDocument,
  type AllowedUnit,
  type CustomerKind,
} from '@hisobchi/core';
import type { SqlConn, SqlDb, SqlParam } from './db';
import { deleteDraftForOp } from './drafts';

export interface SaleLineInput {
  productName: string;
  qtyMilli: bigint;
  unit: AllowedUnit;
  unitPrice: bigint;
  rawText: string | null;
  /** Katalogdagi tovar (ombor qoldig'i va foyda uchun); bo'lmasa qator qoldiqqa tegmaydi */
  productId?: string | null;
  /** Savdo paytidagi tan narx (snapshot, so'm). Foyda faqat kodda hisoblanadi. */
  unitCost?: bigint | null;
}

export interface PostSaleInput {
  clientOpId: string;
  customerId: string | null;
  rawInput: string | null;
  lines: SaleLineInput[];
  /** Savdo bilan birga olingan to'lov. Bir martalik mijoz uchun majburiy va jamiga teng. */
  paid?: { method: PaymentMethod; amount: bigint } | null;
}

export interface PostSaleResult {
  saleId: string;
  total: bigint;
  /** true — shu client_op_id bilan savdo avval saqlangan edi */
  duplicate: boolean;
}

export interface TotalsCheck {
  match: boolean;
  tsLineTotals: bigint[];
  sqlLineTotals: bigint[];
  tsTotal: bigint;
  sqlTotal: bigint;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWithBalance extends Customer {
  /** Mijozga savdo (bekor qilinganlarsiz) — qarz EMAS */
  balance: bigint;
  saleCount: number;
  /** Qabul qilingan to'lovlar (bekor qilinganlarsiz) */
  paid: bigint;
  /** Qarz = savdo − to'lov. Manfiy bo'lsa — ortiqcha to'lov (savdo keyin bekor qilinganda) */
  outstanding: bigint;
}

export type PaymentMethod = 'naqd' | 'karta' | 'otkazma';
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['naqd', 'karta', 'otkazma'];

export interface Payment {
  id: string;
  customerId: string;
  amount: bigint;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
  void: { reason: string; createdAt: string } | null;
}

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

export interface SaleSummary {
  id: string;
  customerId: string | null;
  customerName: string | null;
  total: bigint;
  lineCount: number;
  createdAt: string;
  /** Bekor qilingan bo'lsa — sabab va sana; aks holda null */
  reversal: { reason: string; createdAt: string } | null;
  /** Tarixdan yashirilgan (moliyaviy ta'siri yo'q) */
  hidden: boolean;
}

export type SaleSort = 'newest' | 'oldest' | 'amount_desc';
export type SaleStatusFilter = 'all' | 'active' | 'reversed';

export interface ListSalesOptions {
  customerId?: string;
  limit?: number;
  /** Mijoz nomi yoki mahsulot nomi bo'yicha */
  search?: string;
  /** ISO, shu vaqtdan (kiritilgan) */
  from?: string;
  /** ISO, shu vaqtgacha (kiritilmagan) */
  to?: string;
  sort?: SaleSort;
  status?: SaleStatusFilter;
  /** Yashirilganlarni ham qaytarish (standart: yo'q) */
  includeHidden?: boolean;
}

export interface DashboardStats {
  today: { total: bigint; count: number };
  last7Days: { total: bigint; count: number };
  /** Mijozlarga biriktirilgan savdolar (bekor qilinganlarsiz) — qarz EMAS: to'lov hisobi yo'q */
  customerSalesTotal: bigint;
  customerCount: number;
  reversedCount: number;
  /** Bekor qilinmagan savdolar soni (barcha vaqt) */
  activeCount: number;
  /** Barcha mijozlarning qarzi (faqat musbat qoldiqlar) */
  outstandingTotal: bigint;
  /** Bugun qabul qilingan to'lovlar (bekor qilinganlarsiz) */
  paymentsToday: { total: bigint; count: number };
}

export interface SaleLine {
  lineIndex: number;
  productName: string;
  qtyMilli: bigint;
  unit: string;
  unitPrice: bigint;
  lineTotal: bigint;
  rawText: string | null;
}

export interface SaleDetail extends SaleSummary {
  clientOpId: string;
  tsTotal: bigint;
  sqlTotal: bigint;
  rawInput: string | null;
  lines: SaleLine[];
}

export class CalculationMismatchError extends Error {
  constructor(public readonly check: TotalsCheck) {
    super(
      `Hisob-kitoblar mos kelmadi: TypeScript=${check.tsTotal}, SQL=${check.sqlTotal}. Savdo saqlanmadi.`,
    );
    this.name = 'CalculationMismatchError';
  }
}

export interface ReverseSaleResult {
  reversalId: string;
  duplicate: boolean;
}

export class AlreadyReversedError extends Error {
  constructor() {
    super('Bu savdo allaqachon bekor qilingan');
    this.name = 'AlreadyReversedError';
  }
}

export class SaleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleValidationError';
  }
}

export interface LedgerDeps {
  newId: () => string;
  now: () => string;
}

/**
 * Har bir qator summasini SQLite integer arifmetikasida hisoblaydi.
 * TypeScript kodidan foydalanmaydi — mustaqil tekshiruv yo'li.
 */
export async function sqlLineTotals(
  conn: SqlConn,
  lines: readonly { qtyMilli: bigint; unitPrice: bigint }[],
): Promise<{ lineTotals: bigint[]; total: bigint }> {
  if (lines.length === 0) return { lineTotals: [], total: 0n };
  const values = lines.map(() => '(?, CAST(? AS INTEGER), CAST(? AS INTEGER))').join(', ');
  const params: SqlParam[] = lines.flatMap((l, i) => [i, l.qtyMilli.toString(), l.unitPrice.toString()]);
  const rows = await conn.all<{ i: number; lt: string }>(
    `WITH v(i, q, p) AS (VALUES ${values})
     SELECT i, CAST((q * p + 500) / 1000 AS TEXT) AS lt FROM v ORDER BY i`,
    params,
  );
  const sum = await conn.get<{ total: string }>(
    `WITH v(i, q, p) AS (VALUES ${values})
     SELECT CAST(SUM((q * p + 500) / 1000) AS TEXT) AS total FROM v`,
    params,
  );
  return { lineTotals: rows.map((r) => BigInt(r.lt)), total: BigInt(sum?.total ?? '0') };
}

/** TypeScript (core) va SQLite natijalarini solishtiradi */
export async function verifyTotals(
  conn: SqlConn,
  lines: readonly { qtyMilli: bigint; unitPrice: bigint }[],
  tsOverride?: (lines: readonly { qtyMilli: bigint; unitPrice: bigint }[]) => bigint[],
): Promise<TotalsCheck> {
  const tsLineTotals = tsOverride
    ? tsOverride(lines)
    : calculateDocument(lines).lines.map((l) => l.lineTotal);
  const tsTotal = tsLineTotals.reduce((a, b) => a + b, 0n);
  const sql = await sqlLineTotals(conn, lines);
  const match =
    sql.total === tsTotal &&
    sql.lineTotals.length === tsLineTotals.length &&
    sql.lineTotals.every((v, i) => v === tsLineTotals[i]);
  return { match, tsLineTotals, sqlLineTotals: sql.lineTotals, tsTotal, sqlTotal: sql.total };
}

function assertPostable(lines: readonly SaleLineInput[]): void {
  const validation = validateDocument(lines.map((l) => ({ ...l, rawText: l.rawText ?? undefined })));
  if (!validation.isValid) {
    const first =
      validation.documentIssues[0] ??
      validation.lines.flatMap((l) => l.issues).find((i) => i.severity === 'error');
    throw new SaleValidationError(first?.message ?? "Hujjat noto'g'ri");
  }
  for (const line of lines) {
    if (!(ALLOWED_UNITS as readonly string[]).includes(line.unit)) {
      throw new SaleValidationError(`Noma'lum o'lchov birligi: "${line.unit}"`);
    }
  }
}

export function createLedger(db: SqlDb, deps: LedgerDeps) {
  return {
    /** Saqlashdan oldin ikki hisobni solishtirish (hech narsa yozilmaydi) */
    verifyTotals(lines: readonly { qtyMilli: bigint; unitPrice: bigint }[]) {
      return verifyTotals(db, lines);
    },

    async postSale(
      input: PostSaleInput,
      opts?: { tsOverride?: (lines: readonly { qtyMilli: bigint; unitPrice: bigint }[]) => bigint[] },
    ): Promise<PostSaleResult> {
      return db.transaction(async (tx) => {
        const existing = await tx.get<{ id: string; total: string }>(
          'SELECT id, CAST(total AS TEXT) AS total FROM sales WHERE client_op_id = ?',
          [input.clientOpId],
        );
        if (existing) {
          return { saleId: existing.id, total: BigInt(existing.total), duplicate: true };
        }

        assertPostable(input.lines);

        let kind: CustomerKind = 'regular';
        if (input.customerId) {
          const c = await tx.get<{ id: string; kind: CustomerKind; is_active: number }>('SELECT id, kind, is_active FROM customers WHERE id = ?', [input.customerId]);
          if (!c) throw new SaleValidationError('Tanlangan mijoz topilmadi');
          if (c.is_active !== 1) throw new SaleValidationError('Mijoz arxivlangan');
          kind = c.kind;
        }
        for (const l of input.lines) {
          if (l.productId) {
            if (!(await tx.get<{ id: string }>('SELECT id FROM products WHERE id = ?', [l.productId]))) {
              throw new SaleValidationError('Tovar katalogda topilmadi');
            }
          }
          if (l.unitCost != null && (l.unitCost < 0n || l.unitCost > MAX_UNIT_PRICE)) throw new SaleValidationError("Tan narx noto'g'ri");
        }

        const check = await verifyTotals(tx, input.lines, opts?.tsOverride);
        if (!check.match) throw new CalculationMismatchError(check);

        const paidAmount = input.paid?.amount ?? null;
        if (paidAmount !== null && paidAmount > 0n && !input.customerId) {
          throw new PaymentError("To'lov uchun mijoz tanlanishi kerak");
        }
        const rule = checkSalePayment({ kind, total: check.tsTotal, paid: paidAmount });
        if (!rule.ok) throw new PaymentError(rule.message);
        if (paidAmount !== null && paidAmount > 0n && !PAYMENT_METHODS.includes(input.paid!.method)) {
          throw new PaymentError("Noma'lum to'lov usuli");
        }

        const saleId = deps.newId();
        const createdAt = deps.now();
        const total = check.tsTotal.toString();
        await tx.run(
          `INSERT INTO sales (id, client_op_id, customer_id, total, ts_total, sql_total, line_count, raw_input, created_at)
           VALUES (?, ?, ?, CAST(? AS INTEGER), CAST(? AS INTEGER), CAST(? AS INTEGER), ?, ?, ?)`,
          [
            saleId,
            input.clientOpId,
            input.customerId,
            total,
            check.tsTotal.toString(),
            check.sqlTotal.toString(),
            input.lines.length,
            input.rawInput,
            createdAt,
          ],
        );

        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i];
          await tx.run(
            `INSERT INTO sale_lines (id, sale_id, line_index, product_name, qty_milli, unit, unit_price, line_total, raw_text, product_id, unit_cost)
             VALUES (?, ?, ?, ?, CAST(? AS INTEGER), ?, CAST(? AS INTEGER), CAST(? AS INTEGER), ?, ?, CAST(? AS INTEGER))`,
            [
              deps.newId(),
              saleId,
              i,
              l.productName.trim(),
              l.qtyMilli.toString(),
              l.unit,
              l.unitPrice.toString(),
              check.tsLineTotals[i].toString(),
              l.rawText,
              l.productId ?? null,
              l.unitCost == null ? null : l.unitCost.toString(),
            ],
          );
        }

        // Yozilgan ma'lumotdan SQL'da qayta yig'ish — yakuniy tekshiruv
        const stored = await tx.get<{ stored: string; recomputed: string }>(
          `SELECT CAST(SUM(line_total) AS TEXT) AS stored,
                  CAST(SUM((qty_milli * unit_price + 500) / 1000) AS TEXT) AS recomputed
           FROM sale_lines WHERE sale_id = ?`,
          [saleId],
        );
        if (!stored || BigInt(stored.stored) !== check.tsTotal || BigInt(stored.recomputed) !== check.tsTotal) {
          throw new CalculationMismatchError({ ...check, sqlTotal: BigInt(stored?.recomputed ?? '0') });
        }

        await tx.run(
          `INSERT INTO ledger_entries (id, sale_id, customer_id, entry_type, amount, created_at)
           VALUES (?, ?, ?, 'sale', CAST(? AS INTEGER), ?)`,
          [deps.newId(), saleId, input.customerId, total, createdAt],
        );

        if (paidAmount !== null && paidAmount > 0n) {
          await tx.run(
            `INSERT INTO payments (id, client_op_id, customer_id, amount, method, note, created_at)
             VALUES (?, ?, ?, CAST(? AS INTEGER), ?, 'savdo bilan', ?)`,
            [deps.newId(), `sale-pay:${input.clientOpId}`, input.customerId, paidAmount.toString(), input.paid!.method, createdAt],
          );
        }

        // Shu savdoning qoralamasi — o'sha tranzaksiyada o'chiriladi
        await deleteDraftForOp(tx, input.clientOpId);

        return { saleId, total: check.tsTotal, duplicate: false };
      });
    },

    /** Bir martalik mijoz: har qurilmada bitta tizim mijozi, nom so'ralmaydi, qarzga olmaydi */
    async ensureWalkinCustomer(): Promise<string> {
      return db.transaction(async (tx) => {
        const found = await tx.get<{ id: string }>("SELECT id FROM customers WHERE kind = 'one_time'");
        if (found) return found.id;
        const id = deps.newId();
        const now = deps.now();
        await tx.run(
          "INSERT INTO customers (id, name, created_at, updated_at, kind, source) VALUES (?, 'Bir martalik mijoz', ?, ?, 'one_time', 'system')",
          [id, now, now],
        );
        return id;
      });
    },

    async createCustomer(input: { name: string; phone?: string; note?: string }): Promise<string> {
      const name = input.name.trim();
      if (!name) throw new SaleValidationError('Mijoz ismi kiritilmagan');
      const id = deps.newId();
      const now = deps.now();
      await db.run(
        'INSERT INTO customers (id, name, phone, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, input.phone?.trim() || null, input.note?.trim() || null, now, now],
      );
      return id;
    },

    /**
     * Mijozni o'chirish — faqat moliyaviy tarixi yo'q va bulutga yuborilmagan bo'lsa.
     * Savdo/to'lovi bor mijozni o'chirish audit izini buzadi; bulutga yuborilganini o'chirish
     * (bir tomonlama sinxronlashda) serverda yetim yozuv qoldiradi.
     */
    async deleteCustomer(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        const c = await tx.get<{ id: string }>('SELECT id FROM customers WHERE id = ?', [id]);
        if (!c) throw new SaleValidationError('Mijoz topilmadi');
        const usage = await tx.get<{ sales: number; payments: number; pushed: number }>(
          `SELECT (SELECT COUNT(*) FROM sales WHERE customer_id = ?) AS sales,
                  (SELECT COUNT(*) FROM payments WHERE customer_id = ?) AS payments,
                  (SELECT COUNT(*) FROM sync_log2 WHERE entity = 'customer' AND local_id = ?) AS pushed`,
          [id, id, id],
        );
        if ((usage?.sales ?? 0) > 0 || (usage?.payments ?? 0) > 0) {
          throw new SaleValidationError("Savdo yoki to'lov tarixi bor mijozni o'chirib bo'lmaydi");
        }
        if ((usage?.pushed ?? 0) > 0) {
          throw new SaleValidationError("Bu mijoz bulutga yuborilgan — o'chirib bo'lmaydi (tahrirlash mumkin)");
        }
        await tx.run('DELETE FROM customers WHERE id = ?', [id]);
      });
    },

    async updateCustomer(id: string, input: { name: string; phone?: string; note?: string }): Promise<void> {
      const name = input.name.trim();
      if (!name) throw new SaleValidationError('Mijoz ismi kiritilmagan');
      await db.run('UPDATE customers SET name = ?, phone = ?, note = ?, updated_at = ? WHERE id = ?', [
        name,
        input.phone?.trim() || null,
        input.note?.trim() || null,
        deps.now(),
        id,
      ]);
    },

    async getCustomer(id: string): Promise<CustomerWithBalance | null> {
      const rows = await listCustomersQuery(db, 'WHERE c.id = ?', [id]);
      return rows[0] ?? null;
    },

    listCustomers(search = ''): Promise<CustomerWithBalance[]> {
      const q = search.trim();
      return q
        ? listCustomersQuery(db, "WHERE c.kind = 'regular' AND c.is_active = 1 AND (c.name LIKE ? COLLATE NOCASE OR c.phone LIKE ?)", [`%${q}%`, `%${q}%`])
        : listCustomersQuery(db, "WHERE c.kind = 'regular' AND c.is_active = 1", []);
    },

    async listSales(opts: ListSalesOptions = {}): Promise<SaleSummary[]> {
      const conds: string[] = [];
      const params: SqlParam[] = [];
      if (opts.customerId) {
        conds.push('s.customer_id = ?');
        params.push(opts.customerId);
      }
      if (!opts.includeHidden) conds.push(`${HIDDEN_EXPR} = 0`);
      if (opts.status === 'active') conds.push('r.id IS NULL');
      if (opts.status === 'reversed') conds.push('r.id IS NOT NULL');
      if (opts.from) {
        conds.push('s.created_at >= ?');
        params.push(opts.from);
      }
      if (opts.to) {
        conds.push('s.created_at < ?');
        params.push(opts.to);
      }
      const q = opts.search?.trim();
      if (q) {
        conds.push(
          `(c.name LIKE ? COLLATE NOCASE OR EXISTS (SELECT 1 FROM sale_lines sl WHERE sl.sale_id = s.id AND sl.product_name LIKE ? COLLATE NOCASE))`,
        );
        params.push(`%${q}%`, `%${q}%`);
      }
      const order =
        opts.sort === 'oldest'
          ? 's.created_at ASC, s.rowid ASC'
          : opts.sort === 'amount_desc'
            ? 's.total DESC, s.created_at DESC'
            : 's.created_at DESC, s.rowid DESC';
      const rows = await db.all<SaleRow>(
        `${SALE_SELECT} ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ?`,
        [...params, opts.limit ?? 200],
      );
      return rows.map(toSummary);
    },

    /**
     * Tarixdan yashirish / qayta ko'rsatish. Moliyaviy yozuvlarga tegmaydi.
     * Idempotent: holat allaqachon shunday bo'lsa, yangi hodisa yozilmaydi.
     */
    async setSaleHidden(saleId: string, hidden: boolean): Promise<{ changed: boolean }> {
      return db.transaction(async (tx) => {
        const row = await tx.get<{ hidden: number }>(`SELECT ${HIDDEN_EXPR} AS hidden FROM sales s WHERE s.id = ?`, [saleId]);
        if (!row) throw new SaleValidationError('Savdo topilmadi');
        if (Boolean(row.hidden) === hidden) return { changed: false };
        await tx.run('INSERT INTO sale_visibility_events (id, sale_id, action, created_at) VALUES (?, ?, ?, ?)', [
          deps.newId(),
          saleId,
          hidden ? 'hide' : 'unhide',
          deps.now(),
        ]);
        return { changed: true };
      });
    },

    /** Bosh sahifa ko'rsatkichlari — barchasi bir xil qoidada: savdolar minus bekor qilinganlar */
    async dashboard(todayIso: string, weekAgoIso: string): Promise<DashboardStats> {
      const today = await this.totalSince(todayIso);
      const last7Days = await this.totalSince(weekAgoIso);
      const row = await db.get<{
        total: string;
        customers: number;
        reversed: number;
        active: number;
        outstanding: string;
        pay_total: string;
        pay_count: number;
      }>(
        `SELECT CAST(COALESCE((SELECT SUM(amount) FROM ledger_entries WHERE customer_id IS NOT NULL), 0)
                   - COALESCE((SELECT SUM(amount) FROM sale_reversals WHERE customer_id IS NOT NULL), 0) AS TEXT) AS total,
                (SELECT COUNT(*) FROM customers) AS customers,
                (SELECT COUNT(*) FROM sale_reversals) AS reversed,
                (SELECT COUNT(*) FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_reversals r WHERE r.sale_id = s.id)) AS active,
                CAST(COALESCE((SELECT SUM(MAX(${OUTSTANDING_SQL('c.id')}, 0)) FROM customers c), 0) AS TEXT) AS outstanding,
                CAST(COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.created_at >= ?
                   AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id)), 0) AS TEXT) AS pay_total,
                (SELECT COUNT(*) FROM payments p WHERE p.created_at >= ?
                   AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id)) AS pay_count`,
        [todayIso, todayIso],
      );
      return {
        today,
        last7Days,
        customerSalesTotal: BigInt(row?.total ?? '0'),
        customerCount: row?.customers ?? 0,
        reversedCount: row?.reversed ?? 0,
        activeCount: row?.active ?? 0,
        outstandingTotal: BigInt(row?.outstanding ?? '0'),
        paymentsToday: { total: BigInt(row?.pay_total ?? '0'), count: row?.pay_count ?? 0 },
      };
    },

    /**
     * Mijozdan to'lov qabul qilish. Idempotent (client_op_id). Qoida: to'lov joriy qarzdan
     * oshmasligi kerak (oldindan to'lov / avans hozircha qo'llab-quvvatlanmaydi).
     */
    async recordPayment(input: {
      customerId: string;
      amount: bigint;
      method: PaymentMethod;
      note?: string;
      clientOpId: string;
    }): Promise<{ paymentId: string; duplicate: boolean }> {
      if (input.amount <= 0n) throw new PaymentError("To'lov summasi musbat bo'lishi kerak");
      if (!PAYMENT_METHODS.includes(input.method)) throw new PaymentError("Noma'lum to'lov usuli");
      return db.transaction(async (tx) => {
        const same = await tx.get<{ id: string; customer_id: string; amount: string }>(
          'SELECT id, customer_id, CAST(amount AS TEXT) AS amount FROM payments WHERE client_op_id = ?',
          [input.clientOpId],
        );
        if (same) {
          if (same.customer_id !== input.customerId || BigInt(same.amount) !== input.amount) {
            throw new PaymentError("Amal identifikatori boshqa to'lovga tegishli");
          }
          return { paymentId: same.id, duplicate: true };
        }
        const row = await tx.get<{ outstanding: string }>(
          `SELECT CAST(${OUTSTANDING_SQL('c.id')} AS TEXT) AS outstanding FROM customers c WHERE c.id = ?`,
          [input.customerId],
        );
        if (!row) throw new PaymentError('Mijoz topilmadi');
        const outstanding = BigInt(row.outstanding);
        if (outstanding <= 0n) throw new PaymentError("Mijozning qarzi yo'q — to'lov qabul qilinmadi");
        if (input.amount > outstanding) {
          throw new PaymentError(`To'lov qarzdan katta (qarz: ${outstanding} so'm)`);
        }
        const paymentId = deps.newId();
        await tx.run(
          `INSERT INTO payments (id, client_op_id, customer_id, amount, method, note, created_at)
           VALUES (?, ?, ?, CAST(? AS INTEGER), ?, ?, ?)`,
          [paymentId, input.clientOpId, input.customerId, input.amount.toString(), input.method, input.note?.trim() || null, deps.now()],
        );
        return { paymentId, duplicate: false };
      });
    },

    /** Xato kiritilgan to'lovni bekor qilish (asl yozuv saqlanadi; faqat bir marta) */
    async voidPayment(input: { paymentId: string; reason: string }): Promise<void> {
      const reason = input.reason.trim();
      if (reason.length < 3) throw new PaymentError('Sababni yozing (kamida 3 ta belgi)');
      await db.transaction(async (tx) => {
        const p = await tx.get<{ id: string; client_op_id: string; kind: CustomerKind }>(
          'SELECT p.id, p.client_op_id, c.kind FROM payments p JOIN customers c ON c.id = p.customer_id WHERE p.id = ?',
          [input.paymentId],
        );
        if (!p) throw new PaymentError("To'lov topilmadi");
        if (p.kind === 'one_time') throw new PaymentError("Bir martalik mijoz to'lovini alohida bekor qilib bo'lmaydi: savdoni bekor qiling");
        const v = await tx.get<{ id: string }>('SELECT id FROM payment_voids WHERE payment_id = ?', [input.paymentId]);
        if (v) throw new PaymentError("Bu to'lov allaqachon bekor qilingan");
        await tx.run('INSERT INTO payment_voids (id, payment_id, reason, created_at) VALUES (?, ?, ?, ?)', [
          deps.newId(),
          input.paymentId,
          reason,
          deps.now(),
        ]);
      });
    },

    async listPayments(opts: { customerId?: string; from?: string; limit?: number } = {}): Promise<Payment[]> {
      const conds: string[] = [];
      const params: SqlParam[] = [];
      if (opts.customerId) {
        conds.push('p.customer_id = ?');
        params.push(opts.customerId);
      }
      if (opts.from) {
        conds.push('p.created_at >= ?');
        params.push(opts.from);
      }
      const rows = await db.all<{
        id: string;
        customer_id: string;
        amount: string;
        method: PaymentMethod;
        note: string | null;
        created_at: string;
        void_reason: string | null;
        voided_at: string | null;
      }>(
        `SELECT p.id, p.customer_id, CAST(p.amount AS TEXT) AS amount, p.method, p.note, p.created_at,
                v.reason AS void_reason, v.created_at AS voided_at
         FROM payments p LEFT JOIN payment_voids v ON v.payment_id = p.id
         ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
         ORDER BY p.created_at DESC, p.rowid DESC LIMIT ?`,
        [...params, opts.limit ?? 500],
      );
      return rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        amount: BigInt(r.amount),
        method: r.method,
        note: r.note,
        createdAt: r.created_at,
        void: r.voided_at ? { reason: r.void_reason ?? '', createdAt: r.voided_at } : null,
      }));
    },

    async getSale(id: string): Promise<SaleDetail | null> {
      const row = await db.get<SaleRow & { client_op_id: string; ts_total: string; sql_total: string; raw_input: string | null }>(
        `${SALE_SELECT.replace(
          'SELECT ',
          'SELECT s.client_op_id, CAST(s.ts_total AS TEXT) AS ts_total, CAST(s.sql_total AS TEXT) AS sql_total, s.raw_input, ',
        )} WHERE s.id = ?`,
        [id],
      );
      if (!row) return null;
      const lines = await db.all<{
        line_index: number;
        product_name: string;
        qty_milli: string;
        unit: string;
        unit_price: string;
        line_total: string;
        raw_text: string | null;
      }>(
        `SELECT line_index, product_name, CAST(qty_milli AS TEXT) AS qty_milli, unit,
                CAST(unit_price AS TEXT) AS unit_price, CAST(line_total AS TEXT) AS line_total, raw_text
         FROM sale_lines WHERE sale_id = ? ORDER BY line_index`,
        [id],
      );
      return {
        ...toSummary(row),
        clientOpId: row.client_op_id,
        tsTotal: BigInt(row.ts_total),
        sqlTotal: BigInt(row.sql_total),
        rawInput: row.raw_input,
        lines: lines.map((l) => ({
          lineIndex: l.line_index,
          productName: l.product_name,
          qtyMilli: BigInt(l.qty_milli),
          unit: l.unit,
          unitPrice: BigInt(l.unit_price),
          lineTotal: BigInt(l.line_total),
          rawText: l.raw_text,
        })),
      };
    },

    /**
     * Davr savdosi: shu sanadan (ISO) keyin QILINGAN va bekor qilinmagan savdolar yig'indisi va soni.
     * Hisobotlar (salesByDay) bilan bir xil qoida — savdo sanasi bo'yicha.
     */
    async totalSince(isoFrom: string): Promise<{ total: bigint; count: number }> {
      const row = await db.get<{ total: string; n: number }>(
        `SELECT CAST(COALESCE(SUM(s.total), 0) AS TEXT) AS total, COUNT(*) AS n
         FROM sales s WHERE s.created_at >= ?
           AND NOT EXISTS (SELECT 1 FROM sale_reversals r WHERE r.sale_id = s.id)`,
        [isoFrom],
      );
      return { total: BigInt(row?.total ?? '0'), count: row?.n ?? 0 };
    },

    /**
     * Savdoni bekor qilish (reversal). Asl savdo va ledger yozuvi o'zgarmaydi —
     * sale_reversals'ga qarama-qarshi yozuv qo'shiladi. Idempotent (client_op_id);
     * bir savdoni ikki marta bekor qilib bo'lmaydi (UNIQUE sale_id).
     */
    async reverseSale(input: { saleId: string; reason: string; clientOpId: string }): Promise<ReverseSaleResult> {
      const reason = input.reason.trim();
      if (reason.length < 3) throw new SaleValidationError("Bekor qilish sababini yozing (kamida 3 ta belgi)");
      return db.transaction(async (tx) => {
        const sameOp = await tx.get<{ id: string; sale_id: string }>(
          'SELECT id, sale_id FROM sale_reversals WHERE client_op_id = ?',
          [input.clientOpId],
        );
        if (sameOp) {
          if (sameOp.sale_id !== input.saleId) throw new SaleValidationError('Amal identifikatori boshqa savdoga tegishli');
          return { reversalId: sameOp.id, duplicate: true };
        }
        const sale = await tx.get<{ total: string; customer_id: string | null; client_op_id: string }>(
          'SELECT CAST(total AS TEXT) AS total, customer_id, client_op_id FROM sales WHERE id = ?',
          [input.saleId],
        );
        if (!sale) throw new SaleValidationError('Savdo topilmadi');
        const already = await tx.get<{ id: string }>('SELECT id FROM sale_reversals WHERE sale_id = ?', [input.saleId]);
        if (already) throw new AlreadyReversedError();
        const reversalId = deps.newId();
        await tx.run(
          `INSERT INTO sale_reversals (id, sale_id, client_op_id, customer_id, amount, reason, created_at)
           VALUES (?, ?, ?, ?, CAST(? AS INTEGER), ?, ?)`,
          [reversalId, input.saleId, input.clientOpId, sale.customer_id, sale.total, reason, deps.now()],
        );
        // Bir martalik mijozning savdo bilan olingan puli qaytariladi (uning hisobi yo'q): to'lov bekor qilinadi
        const walkin = sale.customer_id
          ? await tx.get<{ id: string }>("SELECT id FROM customers WHERE id = ? AND kind = 'one_time'", [sale.customer_id])
          : undefined;
        if (walkin) {
          const pay = await tx.get<{ id: string }>(
            'SELECT p.id FROM payments p WHERE p.client_op_id = ? AND NOT EXISTS (SELECT 1 FROM payment_voids v WHERE v.payment_id = p.id)',
            [`sale-pay:${sale.client_op_id}`],
          );
          if (pay) {
            await tx.run('INSERT INTO payment_voids (id, payment_id, reason, created_at) VALUES (?, ?, ?, ?)', [deps.newId(), pay.id, `savdo bekor qilindi: ${reason}`, deps.now()]);
          }
        }
        return { reversalId, duplicate: false };
      });
    },
  };
}

export type Ledger = ReturnType<typeof createLedger>;

interface SaleRow {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  total: string;
  line_count: number;
  created_at: string;
  reversal_reason: string | null;
  reversed_at: string | null;
  hidden: number;
}

/** Joriy yashirish holati — oxirgi ko'rinish hodisasi 'hide' bo'lsa 1 */
const HIDDEN_EXPR = `COALESCE((SELECT v.action = 'hide' FROM sale_visibility_events v
  WHERE v.sale_id = s.id ORDER BY v.rowid DESC LIMIT 1), 0)`;

const SALE_SELECT = `SELECT s.id, s.customer_id, c.name AS customer_name, CAST(s.total AS TEXT) AS total,
  s.line_count, s.created_at, r.reason AS reversal_reason, r.created_at AS reversed_at,
  ${HIDDEN_EXPR} AS hidden
  FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
  LEFT JOIN sale_reversals r ON r.sale_id = s.id`;

function toSummary(r: SaleRow): SaleSummary {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    total: BigInt(r.total),
    lineCount: r.line_count,
    createdAt: r.created_at,
    reversal: r.reversed_at ? { reason: r.reversal_reason ?? '', createdAt: r.reversed_at } : null,
    hidden: Boolean(r.hidden),
  };
}

/** Mijozga savdo (bekor qilinganlarsiz) — bitta qoida, hamma joyda shu ishlatiladi */
const SALES_NET_SQL = (cid: string) => `(COALESCE((SELECT SUM(e.amount) FROM ledger_entries e WHERE e.customer_id = ${cid}), 0)
  - COALESCE((SELECT SUM(rv.amount) FROM sale_reversals rv WHERE rv.customer_id = ${cid}), 0))`;
/** Mijozdan qabul qilingan to'lovlar (bekor qilinganlarsiz) */
const PAID_NET_SQL = (cid: string) => `COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = ${cid}
  AND NOT EXISTS (SELECT 1 FROM payment_voids pv WHERE pv.payment_id = p.id)), 0)`;
/** Qarz = savdo − to'lov */
const OUTSTANDING_SQL = (cid: string) => `(${SALES_NET_SQL(cid)} - ${PAID_NET_SQL(cid)})`;

async function listCustomersQuery(db: SqlConn, where: string, params: SqlParam[]): Promise<CustomerWithBalance[]> {
  const rows = await db.all<{
    id: string;
    name: string;
    phone: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
    balance: string | null;
    sale_count: number;
    paid: string;
    outstanding: string;
  }>(
    `SELECT c.id, c.name, c.phone, c.note, c.created_at, c.updated_at,
            CAST(${SALES_NET_SQL('c.id')} AS TEXT) AS balance,
            CAST(${PAID_NET_SQL('c.id')} AS TEXT) AS paid,
            CAST(${OUTSTANDING_SQL('c.id')} AS TEXT) AS outstanding,
            (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id
               AND NOT EXISTS (SELECT 1 FROM sale_reversals rv WHERE rv.sale_id = s.id)) AS sale_count
     FROM customers c ${where}
     ORDER BY c.name COLLATE NOCASE`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    balance: BigInt(r.balance ?? '0'),
    saleCount: r.sale_count,
    paid: BigInt(r.paid ?? '0'),
    outstanding: BigInt(r.outstanding ?? '0'),
  }));
}
