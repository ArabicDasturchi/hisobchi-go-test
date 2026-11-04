/**
 * Bulutdan telefonga QO'SHIMCHA import (pull) — web yoki boshqa qurilmada yaratilgan yozuvlar mobilda ko'rinishi uchun.
 *
 * Xavfsizlik qoidalari:
 * - Faqat qo'shadi. Lokal moliyaviy yozuv (savdo, qator, ledger, bekor qilish, to'lov) hech qachon
 *   o'chirilmaydi yoki ustidan yozilmaydi; bo'sh server javobi lokal ma'lumotga ta'sir qilmaydi.
 * - Mijoz/mahsulot (moliyaviy emas): lokalda yo'q bo'lsa qo'shiladi; bor bo'lsa va serverdagi updated_at
 *   yangiroq hamda lokal nusxa oxirgi sinxronlashdan keyin tahrirlanmagan bo'lsa — yangilanadi.
 * - Har bir savdo qo'shishdan oldin @hisobchi/core formulasi bilan qayta tekshiriladi; mos kelmasa
 *   import qilinmaydi (rejected), lokal SQLite CHECK'lari ikkinchi himoya.
 * - Import qilingan yozuv sync_log'ga yoziladi — qayta push qilinmaydi (dublikat yo'q).
 */
import { ALLOWED_UNITS, calculateLineTotal } from '@hisobchi/core';
import type { SqlConn, SqlDb } from '../data/db';
import { toCloudError, unwrap, type CloudClient, type CloudError } from './cloud';
import type { SyncEntity } from './sync';

export interface PullResult {
  imported: Record<SyncEntity, number>;
  updated: { customer: number; product: number };
  /** Web'da o'chirilgan mijoz / o'chirilgan yoki arxivlangan mahsulot — telefondan ham olib tashlandi */
  removed: { customer: number; product: number };
  /** Lokal qoidalarga mos kelmagani uchun import qilinmagan yozuvlar (sabab bilan) */
  rejected: { entity: SyncEntity; id: string; reason: string }[];
  error: CloudError | null;
}

const iso = (s: string) => new Date(s).toISOString();
const big = (v: string | number | null | undefined): bigint | null => {
  if (v === null || v === undefined || v === '') return null;
  const t = String(v);
  return /^-?\d+$/.test(t) ? BigInt(t) : null;
};

interface CCustomer { id: string; name: string; phone: string | null; notes: string | null; created_at: string; updated_at: string }
interface CProduct { id: string; name: string; unit: string; last_price: string | null; is_active: boolean; created_at: string; updated_at: string }
interface CDocument { id: string; client_op_id: string | null; customer_id: string | null; status: string; subtotal: string; created_at: string }
interface CLine { document_id: string; line_index: number; product_name: string; qty_milli: string; unit: string; unit_price: string; line_total: string; raw_text: string | null }
interface CReversal { id: string; document_id: string; client_op_id: string; amount: string; reason: string; created_at: string }
interface CPayment { id: string; client_op_id: string; customer_id: string; amount: string; method: string; note: string | null; created_at: string }
interface CVoid { id: string; payment_id: string; reason: string; created_at: string }

export async function pullFromCloud(db: SqlDb, cloud: CloudClient, shopId: string, deps: { now: () => string; newId: () => string }): Promise<PullResult> {
  const imported: PullResult['imported'] = { customer: 0, product: 0, sale: 0, reversal: 0, payment: 0, payment_void: 0 };
  const updated = { customer: 0, product: 0 };
  const removed = { customer: 0, product: 0 };
  const rejected: PullResult['rejected'] = [];
  const reject = (entity: SyncEntity, id: string, reason: string) => rejected.push({ entity, id, reason });

  try {
    const [customers, products, documents, lines, reversals, payments, voids] = await Promise.all([
      unwrap(cloud.selectAll<CCustomer>('customers', 'id,name,phone,notes,created_at,updated_at', shopId)),
      unwrap(cloud.selectAll<CProduct>('products', 'id,name,unit,last_price::text,is_active,created_at,updated_at', shopId)),
      unwrap(cloud.selectAll<CDocument>('documents', 'id,client_op_id,customer_id,status,subtotal::text,created_at', shopId)),
      unwrap(cloud.selectAll<CLine>('document_lines', 'document_id,line_index,product_name,qty_milli::text,unit,unit_price::text,line_total::text,raw_text', shopId)),
      unwrap(cloud.selectAll<CReversal>('document_reversals', 'id,document_id,client_op_id,amount::text,reason,created_at', shopId)),
      unwrap(cloud.selectAll<CPayment>('payments', 'id,client_op_id,customer_id,amount::text,method,note,created_at', shopId)),
      unwrap(cloud.selectAll<CVoid>('payment_voids', 'id,payment_id,reason,created_at', shopId)),
    ]);

    const logPulled = (tx: SqlConn, entity: SyncEntity, id: string) =>
      tx.run(
        `INSERT INTO sync_log2 (shop_id, entity, local_id, pushed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(shop_id, entity, local_id) DO UPDATE SET pushed_at = excluded.pushed_at`,
        [shopId, entity, id, deps.now()],
      );
    const exists = async (tx: SqlConn, table: string, id: string) =>
      (await tx.get<{ x: number }>(`SELECT 1 AS x FROM ${table} WHERE id = ?`, [id])) !== null;

    // 1. Mijozlar
    for (const c of customers ?? []) {
      await db.transaction(async (tx) => {
        const local = await tx.get<{ updated_at: string; pushed_at: string | null }>(
          `SELECT c.updated_at, l.pushed_at FROM customers c
           LEFT JOIN sync_log2 l ON l.shop_id = ? AND l.entity = 'customer' AND l.local_id = c.id WHERE c.id = ?`,
          [shopId, c.id],
        );
        if (!c.name?.trim()) return reject('customer', c.id, "ism bo'sh");
        if (!local) {
          await tx.run('INSERT INTO customers (id, name, phone, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
            c.id, c.name.trim(), c.phone, c.notes, iso(c.created_at), iso(c.updated_at),
          ]);
          imported.customer++;
        } else if (iso(c.updated_at) > local.updated_at && (local.pushed_at === null || local.updated_at <= local.pushed_at)) {
          await tx.run('UPDATE customers SET name = ?, phone = ?, note = ?, updated_at = ? WHERE id = ?', [
            c.name.trim(), c.phone, c.notes, iso(c.updated_at), c.id,
          ]);
          updated.customer++;
        } else return;
        await logPulled(tx, 'customer', c.id);
      });
    }

    // 2. Mahsulotlar (arxivlangan va narxsizlari telefonga olinmaydi — lokal model narx talab qiladi)
    for (const p of products ?? []) {
      const price = big(p.last_price);
      if (!p.is_active) continue;
      if (price === null || price < 0n) {
        reject('product', p.id, "narx ko'rsatilmagan");
        continue;
      }
      if (!(ALLOWED_UNITS as readonly string[]).includes(p.unit)) {
        reject('product', p.id, `noma'lum birlik: ${p.unit}`);
        continue;
      }
      await db.transaction(async (tx) => {
        const local = await tx.get<{ updated_at: string; pushed_at: string | null }>(
          `SELECT t.updated_at, l.pushed_at FROM products t
           LEFT JOIN sync_log2 l ON l.shop_id = ? AND l.entity = 'product' AND l.local_id = t.id WHERE t.id = ?`,
          [shopId, p.id],
        );
        const sameName = await tx.get<{ id: string }>('SELECT id FROM products WHERE name = ? COLLATE NOCASE AND id <> ?', [p.name.trim(), p.id]);
        if (sameName) return reject('product', p.id, `"${p.name}" nomli boshqa mahsulot telefonda bor`);
        if (!local) {
          await tx.run(
            'INSERT INTO products (id, name, unit, unit_price, created_at, updated_at) VALUES (?, ?, ?, CAST(? AS INTEGER), ?, ?)',
            [p.id, p.name.trim(), p.unit, price.toString(), iso(p.created_at), iso(p.updated_at)],
          );
          imported.product++;
        } else if (iso(p.updated_at) > local.updated_at && (local.pushed_at === null || local.updated_at <= local.pushed_at)) {
          await tx.run('UPDATE products SET name = ?, unit = ?, unit_price = CAST(? AS INTEGER), updated_at = ? WHERE id = ?', [
            p.name.trim(), p.unit, price.toString(), iso(p.updated_at), p.id,
          ]);
          updated.product++;
        } else return;
        await logPulled(tx, 'product', p.id);
      });
    }

    // 2b. Web'da o'chirilgan mijozlar va o'chirilgan/arxivlangan mahsulotlar — faqat xavfsiz holatda olib tashlanadi:
    //     avval shu do'konga sinxronlangan, sinxronlashdan keyin telefonda tahrirlanmagan, mijozda savdo/to'lov yo'q.
    //     Bulut jadvali butunlay bo'sh qaytsa — hech narsa o'chirilmaydi (bo'sh javob lokal ma'lumotni o'chirmaydi).
    const removeMissing = async (
      table: 'customers' | 'products',
      entity: 'customer' | 'product',
      keepIds: Set<string>,
      cloudRowCount: number,
    ) => {
      const synced = await db.all<{ id: string }>(
        `SELECT t.id FROM ${table} t
         JOIN sync_log2 l ON l.shop_id = ? AND l.entity = '${entity}' AND l.local_id = t.id
         WHERE t.updated_at <= l.pushed_at`,
        [shopId],
      );
      if (cloudRowCount === 0 && synced.length > 0) return;
      for (const { id } of synced) {
        if (keepIds.has(id)) continue;
        await db.transaction(async (tx) => {
          if (entity === 'customer') {
            const used = await tx.get<{ n: number }>(
              'SELECT (SELECT COUNT(*) FROM sales WHERE customer_id = ?) + (SELECT COUNT(*) FROM payments WHERE customer_id = ?) AS n',
              [id, id],
            );
            if ((used?.n ?? 0) > 0) return reject('customer', id, "bulutda o'chirilgan, lekin telefonda savdo/to'lov tarixi bor — saqlab qolindi");
          }
          await tx.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
          await tx.run('DELETE FROM sync_log2 WHERE shop_id = ? AND entity = ? AND local_id = ?', [shopId, entity, id]);
          removed[entity]++;
        });
      }
    };
    await removeMissing('customers', 'customer', new Set((customers ?? []).map((c) => c.id)), (customers ?? []).length);
    await removeMissing('products', 'product', new Set((products ?? []).filter((p) => p.is_active).map((p) => p.id)), (products ?? []).length);

    // 3. Savdolar — har biri core formulasi bilan qayta tekshiriladi
    const linesByDoc = new Map<string, CLine[]>();
    for (const l of lines ?? []) linesByDoc.set(l.document_id, [...(linesByDoc.get(l.document_id) ?? []), l]);
    for (const d of (documents ?? []).filter((x) => x.status === 'posted' || x.status === 'reversed')) {
      const docLines = (linesByDoc.get(d.id) ?? []).sort((a, b) => a.line_index - b.line_index);
      const subtotal = big(d.subtotal);
      if (docLines.length === 0 || subtotal === null) {
        reject('sale', d.id, "qatorlar yo'q");
        continue;
      }
      let total = 0n;
      let bad: string | null = null;
      for (const l of docLines) {
        const q = big(l.qty_milli);
        const p = big(l.unit_price);
        const lt = big(l.line_total);
        if (q === null || p === null || lt === null || q <= 0n || p < 0n) bad = "noto'g'ri qator qiymati";
        else if (calculateLineTotal(q, p) !== lt) bad = 'qator summasi formulaga mos emas';
        else if (!(ALLOWED_UNITS as readonly string[]).includes(l.unit)) bad = `noma'lum birlik: ${l.unit}`;
        else total += lt;
      }
      if (!bad && total !== subtotal) bad = `jami mos emas (server ${subtotal}, qayta hisob ${total})`;
      if (bad) {
        reject('sale', d.id, bad);
        continue;
      }
      await db.transaction(async (tx) => {
        if (await exists(tx, 'sales', d.id)) return;
        if (d.customer_id && !(await exists(tx, 'customers', d.customer_id))) return reject('sale', d.id, 'mijoz telefonda topilmadi');
        const opId = d.client_op_id ?? `cloud:${d.id}`;
        if (await tx.get<{ id: string }>('SELECT id FROM sales WHERE client_op_id = ?', [opId])) {
          return reject('sale', d.id, "shu amal identifikatori bilan boshqa savdo bor");
        }
        const at = iso(d.created_at);
        await tx.run(
          `INSERT INTO sales (id, client_op_id, customer_id, total, ts_total, sql_total, line_count, raw_input, created_at)
           VALUES (?, ?, ?, CAST(? AS INTEGER), CAST(? AS INTEGER), CAST(? AS INTEGER), ?, NULL, ?)`,
          [d.id, opId, d.customer_id, subtotal.toString(), subtotal.toString(), subtotal.toString(), docLines.length, at],
        );
        for (const [i, l] of docLines.entries()) {
          await tx.run(
            `INSERT INTO sale_lines (id, sale_id, line_index, product_name, qty_milli, unit, unit_price, line_total, raw_text)
             VALUES (?, ?, ?, ?, CAST(? AS INTEGER), ?, CAST(? AS INTEGER), CAST(? AS INTEGER), ?)`,
            [deps.newId(), d.id, i, l.product_name, l.qty_milli, l.unit, l.unit_price, l.line_total, l.raw_text],
          );
        }
        await tx.run(
          `INSERT INTO ledger_entries (id, sale_id, customer_id, entry_type, amount, created_at) VALUES (?, ?, ?, 'sale', CAST(? AS INTEGER), ?)`,
          [deps.newId(), d.id, d.customer_id, subtotal.toString(), at],
        );
        await logPulled(tx, 'sale', d.id);
        imported.sale++;
      });
    }

    // 4. Bekor qilishlar (lokal trigger summa va mijozni savdo bilan solishtiradi)
    for (const r of reversals ?? []) {
      await db.transaction(async (tx) => {
        if (await exists(tx, 'sale_reversals', r.id)) return;
        if (await tx.get<{ id: string }>('SELECT id FROM sale_reversals WHERE sale_id = ?', [r.document_id])) return;
        const sale = await tx.get<{ customer_id: string | null }>('SELECT customer_id FROM sales WHERE id = ?', [r.document_id]);
        if (!sale) return reject('reversal', r.id, 'savdo telefonda topilmadi');
        await tx.run(
          `INSERT INTO sale_reversals (id, sale_id, client_op_id, customer_id, amount, reason, created_at)
           VALUES (?, ?, ?, ?, CAST(? AS INTEGER), ?, ?)`,
          [r.id, r.document_id, r.client_op_id, sale.customer_id, r.amount, r.reason, iso(r.created_at)],
        );
        await logPulled(tx, 'reversal', r.id);
        imported.reversal++;
      });
    }

    // 5. To'lovlar va ularni bekor qilish (server allaqachon qarz qoidasini tekshirgan)
    for (const p of payments ?? []) {
      const amount = big(p.amount);
      if (amount === null || amount <= 0n) {
        reject('payment', p.id, "noto'g'ri summa");
        continue;
      }
      await db.transaction(async (tx) => {
        if (await exists(tx, 'payments', p.id)) return;
        if (!(await exists(tx, 'customers', p.customer_id))) return reject('payment', p.id, 'mijoz telefonda topilmadi');
        if (await tx.get<{ id: string }>('SELECT id FROM payments WHERE client_op_id = ?', [p.client_op_id])) {
          return reject('payment', p.id, "shu amal identifikatori bilan boshqa to'lov bor");
        }
        await tx.run(
          `INSERT INTO payments (id, client_op_id, customer_id, amount, method, note, created_at)
           VALUES (?, ?, ?, CAST(? AS INTEGER), ?, ?, ?)`,
          [p.id, p.client_op_id, p.customer_id, amount.toString(), p.method, p.note, iso(p.created_at)],
        );
        await logPulled(tx, 'payment', p.id);
        imported.payment++;
      });
    }
    for (const v of voids ?? []) {
      await db.transaction(async (tx) => {
        if (await exists(tx, 'payment_voids', v.id)) return;
        if (await tx.get<{ id: string }>('SELECT id FROM payment_voids WHERE payment_id = ?', [v.payment_id])) return;
        if (!(await exists(tx, 'payments', v.payment_id))) return reject('payment_void', v.id, "to'lov telefonda topilmadi");
        await tx.run('INSERT INTO payment_voids (id, payment_id, reason, created_at) VALUES (?, ?, ?, ?)', [
          v.id, v.payment_id, v.reason, iso(v.created_at),
        ]);
        await logPulled(tx, 'payment_void', v.id);
        imported.payment_void++;
      });
    }
    return { imported, updated, removed, rejected, error: null };
  } catch (e) {
    return { imported, updated, removed, rejected, error: toCloudError(e) };
  }
}
