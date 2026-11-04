/**
 * Bulutga BIR TOMONLAMA zaxira (push). Lokal SQLite asosiy manba bo'lib qoladi.
 *
 * - Bulutdan hech narsa o'qib lokal bazaga yozilmaydi (bo'sh javob lokal ma'lumotni o'chira olmaydi).
 * - Mijoz va mahsulot (moliyaviy emas) har safar id bo'yicha upsert qilinadi.
 * - Moliyaviy hodisalar (savdo, bekor qilish, to'lov, to'lovni bekor qilish) vaqt tartibida yuboriladi —
 *   server qarz tekshiruvi telefondagi tartib bilan bir xil natija berishi uchun.
 * - Har bir hodisa serverda client_op_id / id bo'yicha idempotent; muvaffaqiyatli yuborilgani
 *   sync_log'ga yoziladi va keyingi safar o'tkazib yuboriladi. Xatoda to'xtaydi — qolgani keyingi safar.
 */
import type { SqlDb } from '../data/db';
import { CloudError, toCloudError, unwrap, type CloudClient } from './cloud';

export type SyncEntity =
  | 'customer'
  | 'product'
  | 'supplier'
  | 'sale'
  | 'reversal'
  | 'payment'
  | 'payment_void'
  | 'purchase'
  | 'purchase_reversal'
  | 'supplier_payment'
  | 'supplier_payment_void'
  | 'stock_adjustment';

export interface PushResult {
  pushed: Record<SyncEntity, number>;
  skipped: number;
  /** Xato bo'lsa — qaysi bosqichda to'xtagani; qolganlari keyingi safar yuboriladi */
  error: CloudError | null;
}

type EventKind = Exclude<SyncEntity, 'customer' | 'product' | 'supplier'>;
type Event = { kind: EventKind; id: string; at: string };

/** Bir vaqtdagi hodisalar tartibi: hujjat → uning bekori → to'lov → to'lov bekori */
const RANK: Record<EventKind, number> = {
  sale: 0, reversal: 1, payment: 2, payment_void: 3,
  purchase: 4, purchase_reversal: 5, supplier_payment: 6, supplier_payment_void: 7, stock_adjustment: 8,
};

/**
 * Savdo/kirim bilan birga yozilgan to'lov (client_op_id 'sale-pay:' / 'purchase-pay:') serverda post_sale /
 * post_purchase ichida o'zi yaratiladi — alohida yuborilmaydi. Bir martalik savdo bekor qilinganda server
 * to'lovni o'zi bekor qiladi (reverse_sale), shuning uchun mahalliy avto-bekor ham alohida yuborilmaydi.
 */
const EMBEDDED_PAYMENT = "(p.client_op_id LIKE 'sale-pay:%')";
const AUTO_WALKIN_VOID = `EXISTS (SELECT 1 FROM payments p JOIN customers c ON c.id = p.customer_id
  WHERE p.id = v.payment_id AND p.client_op_id LIKE 'sale-pay:%' AND c.kind = 'one_time')`;

/** Yuborilishi kerak bo'lgan hodisalar (SQL shartlari pendingCount va pushToCloud uchun bir xil) */
const EVENT_SOURCES: { kind: EventKind; sql: string }[] = [
  { kind: 'sale', sql: 'SELECT s.id AS id, s.created_at AS at FROM sales s' },
  { kind: 'reversal', sql: 'SELECT r.id AS id, r.created_at AS at FROM sale_reversals r' },
  { kind: 'payment', sql: `SELECT p.id AS id, p.created_at AS at FROM payments p WHERE NOT ${EMBEDDED_PAYMENT}` },
  { kind: 'payment_void', sql: `SELECT v.id AS id, v.created_at AS at FROM payment_voids v WHERE NOT ${AUTO_WALKIN_VOID}` },
  { kind: 'purchase', sql: 'SELECT p.id AS id, p.created_at AS at FROM purchases p' },
  { kind: 'purchase_reversal', sql: 'SELECT r.id AS id, r.created_at AS at FROM purchase_reversals r' },
  { kind: 'supplier_payment', sql: "SELECT p.id AS id, p.created_at AS at FROM supplier_payments p WHERE p.client_op_id NOT LIKE 'purchase-pay:%'" },
  { kind: 'supplier_payment_void', sql: 'SELECT v.id AS id, v.created_at AS at FROM supplier_payment_voids v' },
  { kind: 'stock_adjustment', sql: 'SELECT a.id AS id, a.created_at AS at FROM stock_adjustments a' },
];

export async function pendingCount(db: SqlDb, shopId: string): Promise<number> {
  const parts = EVENT_SOURCES.map(
    (e) => `(SELECT COUNT(*) FROM (${e.sql}) x WHERE NOT EXISTS (SELECT 1 FROM sync_log2 l WHERE l.shop_id = ? AND l.entity = '${e.kind}' AND l.local_id = x.id))`,
  );
  const row = await db.get<{ n: number }>(`SELECT ${parts.join(' + ')} AS n`, EVENT_SOURCES.map(() => shopId));
  return row?.n ?? 0;
}

export const ALL_ENTITIES: SyncEntity[] = [
  'customer', 'product', 'supplier', 'sale', 'reversal', 'payment', 'payment_void',
  'purchase', 'purchase_reversal', 'supplier_payment', 'supplier_payment_void', 'stock_adjustment',
];

export async function pushToCloud(
  db: SqlDb,
  cloud: CloudClient,
  shopId: string,
  deps: { now: () => string; onProgress?: (done: number, total: number) => void },
): Promise<PushResult> {
  const pushed = Object.fromEntries(ALL_ENTITIES.map((e) => [e, 0])) as PushResult['pushed'];
  let skipped = 0;
  const logged = async (entity: SyncEntity, id: string) =>
    (await db.get<{ x: number }>('SELECT 1 AS x FROM sync_log2 WHERE shop_id = ? AND entity = ? AND local_id = ?', [shopId, entity, id])) !== null;
  const markPushed = (entity: SyncEntity, id: string) =>
    db.run('INSERT OR IGNORE INTO sync_log2 (shop_id, entity, local_id, pushed_at) VALUES (?, ?, ?, ?)', [shopId, entity, id, deps.now()]);

  try {
    // 1. Mijozlar va mahsulotlar — faqat yangi yoki oxirgi yuborishdan keyin telefonda tahrirlanganlari.
    //    (Har safar hammasini upsert qilish web'da o'chirilgan mijozni qayta "tiriltirar" edi.)
    const changedSql = (table: string, entity: SyncEntity) =>
      `SELECT t.* FROM ${table} t
       LEFT JOIN sync_log2 l ON l.shop_id = ? AND l.entity = '${entity}' AND l.local_id = t.id
       WHERE (l.local_id IS NULL OR t.updated_at > l.pushed_at)${table === 'customers' ? " AND t.kind = 'regular'" : ''}
       ORDER BY t.created_at`;
    const markSynced = (entity: SyncEntity, id: string) =>
      db.run(
        `INSERT INTO sync_log2 (shop_id, entity, local_id, pushed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(shop_id, entity, local_id) DO UPDATE SET pushed_at = excluded.pushed_at`,
        [shopId, entity, id, deps.now()],
      );
    const customers = await db.all<{ id: string; name: string; phone: string | null; note: string | null; is_active: number }>(
      changedSql('customers', 'customer'),
      [shopId],
    );
    if (customers.length > 0) {
      await unwrap(cloud.upsert('customers', customers.map((c) => ({ id: c.id, shop_id: shopId, name: c.name, phone: c.phone, notes: c.note, is_active: c.is_active === 1 }))));
      for (const c of customers) await markSynced('customer', c.id);
      pushed.customer = customers.length;
    }
    const products = await db.all<{ id: string; name: string; unit: string; unit_price: number; is_active: number }>(changedSql('products', 'product'), [
      shopId,
    ]);
    if (products.length > 0) {
      const prices = await db.all<{ id: string; p: string }>(
        `SELECT id, CAST(unit_price AS TEXT) AS p FROM products WHERE id IN (${products.map(() => '?').join(',')})`,
        products.map((x) => x.id),
      );
      const priceOf = new Map(prices.map((x) => [x.id, x.p]));
      await unwrap(
        cloud.upsert('products', products.map((x) => ({ id: x.id, shop_id: shopId, name: x.name, unit: x.unit, last_price: priceOf.get(x.id), is_active: x.is_active === 1 }))),
      );
      for (const x of products) await markSynced('product', x.id);
      pushed.product = products.length;
    }

    const suppliers = await db.all<{ id: string; name: string; phone: string | null; note: string | null; is_active: number }>(
      changedSql('suppliers', 'supplier'),
      [shopId],
    );
    if (suppliers.length > 0) {
      await unwrap(cloud.upsert('suppliers', suppliers.map((x) => ({ id: x.id, shop_id: shopId, name: x.name, phone: x.phone, notes: x.note, is_active: x.is_active === 1 }))));
      for (const x of suppliers) await markSynced('supplier', x.id);
      pushed.supplier = suppliers.length;
    }

    // 2. Moliyaviy hodisalar — vaqt tartibida
    const events: Event[] = [];
    for (const src of EVENT_SOURCES) {
      for (const r of await db.all<{ id: string; at: string }>(src.sql)) events.push({ kind: src.kind, ...r });
    }
    events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : RANK[a.kind] - RANK[b.kind]));
    const walkin = { id: null as string | null };

    let done = 0;
    for (const ev of events) {
      deps.onProgress?.(done, events.length);
      if (await logged(ev.kind, ev.id)) {
        skipped++;
        done++;
        continue;
      }
      await pushEvent(db, cloud, shopId, ev, walkin);
      await markPushed(ev.kind, ev.id);
      pushed[ev.kind]++;
      done++;
    }
    deps.onProgress?.(done, events.length);
    return { pushed, skipped, error: null };
  } catch (e) {
    return { pushed, skipped, error: toCloudError(e) };
  }
}

/** Server tomondagi (post_sale/post_purchase ichida yaratilgan) to'lov id'si — client_op_id bo'yicha */
async function serverPaymentId(cloud: CloudClient, shopId: string, table: 'payments' | 'supplier_payments', clientOpId: string): Promise<string> {
  const rows = await unwrap(cloud.selectAll<{ id: string }>(table, 'id', shopId, { column: 'client_op_id', value: clientOpId }));
  const id = rows?.[0]?.id;
  if (!id) throw new CloudError('conflict', "Serverda to'lov topilmadi — avval savdo/kirim yuborilishi kerak.");
  return id;
}

async function pushEvent(db: SqlDb, cloud: CloudClient, shopId: string, ev: Event, walkin: { id: string | null }): Promise<void> {
  switch (ev.kind) {
    case 'sale': {
      const sale = await db.get<{ id: string; client_op_id: string; customer_id: string | null; raw_input: string | null; total: string; created_at: string; kind: string | null }>(
        `SELECT s.id, s.client_op_id, s.customer_id, s.raw_input, CAST(s.total AS TEXT) AS total, s.created_at, c.kind AS kind
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
        [ev.id],
      );
      if (!sale) return;
      const lines = await db.all<{ product_name: string; qty_milli: string; unit: string; unit_price: string; raw_text: string | null; product_id: string | null; unit_cost: string | null }>(
        `SELECT product_name, CAST(qty_milli AS TEXT) AS qty_milli, unit, CAST(unit_price AS TEXT) AS unit_price, raw_text,
                product_id, CAST(unit_cost AS TEXT) AS unit_cost
         FROM sale_lines WHERE sale_id = ? ORDER BY line_index`,
        [ev.id],
      );
      const pay = await db.get<{ amount: string; method: string }>(
        "SELECT CAST(amount AS TEXT) AS amount, method FROM payments WHERE client_op_id = ?",
        [`sale-pay:${sale.client_op_id}`],
      );
      let customerId = sale.customer_id;
      if (sale.kind === 'one_time') {
        // Bir martalik mijoz serverda har do'konda bitta (o'z id'si bilan) — lokal id yuborilmaydi
        if (!walkin.id) walkin.id = (await unwrap<string>(cloud.rpc<string>('ensure_walkin_customer', { p_shop_id: shopId }))) ?? null;
        if (!walkin.id) throw new CloudError('unknown', "Bir martalik mijoz serverda yaratilmadi");
        customerId = walkin.id;
      }
      await unwrap(
        cloud.rpc('post_sale', {
          p_shop_id: shopId,
          p_sale_id: sale.id,
          p_client_op_id: sale.client_op_id,
          p_customer_id: customerId,
          p_raw_input: sale.raw_input,
          // Pul va miqdor — string (BigInt JSON number'ga sig'masligi mumkin); server o'zi qayta hisoblaydi
          p_lines: lines,
          p_client_total: sale.total,
          p_created_at: sale.created_at,
          p_payment_method: pay?.method ?? null,
          p_paid: pay?.amount ?? null,
        }),
      );
      return;
    }
    case 'reversal': {
      const r = await db.get<{ sale_id: string; client_op_id: string; reason: string }>('SELECT sale_id, client_op_id, reason FROM sale_reversals WHERE id = ?', [ev.id]);
      if (!r) return;
      await unwrap(cloud.rpc('reverse_sale', { p_shop_id: shopId, p_document_id: r.sale_id, p_client_op_id: r.client_op_id, p_reason: r.reason }));
      return;
    }
    case 'payment': {
      const p = await db.get<{ id: string; client_op_id: string; customer_id: string; amount: string; method: string; note: string | null; created_at: string }>(
        'SELECT id, client_op_id, customer_id, CAST(amount AS TEXT) AS amount, method, note, created_at FROM payments WHERE id = ?',
        [ev.id],
      );
      if (!p) return;
      await unwrap(
        cloud.rpc('record_payment', {
          p_shop_id: shopId, p_payment_id: p.id, p_client_op_id: p.client_op_id, p_customer_id: p.customer_id,
          p_amount: p.amount, p_method: p.method, p_note: p.note, p_created_at: p.created_at,
        }),
      );
      return;
    }
    case 'payment_void': {
      const v = await db.get<{ payment_id: string; reason: string; op: string }>(
        'SELECT v.payment_id, v.reason, p.client_op_id AS op FROM payment_voids v JOIN payments p ON p.id = v.payment_id WHERE v.id = ?',
        [ev.id],
      );
      if (!v) return;
      // Savdo bilan birga yozilgan to'lovning serverdagi id'si boshqa: client_op_id bo'yicha topiladi
      const paymentId = v.op.startsWith('sale-pay:') ? await serverPaymentId(cloud, shopId, 'payments', v.op) : v.payment_id;
      await unwrap(cloud.rpc('void_payment', { p_shop_id: shopId, p_payment_id: paymentId, p_reason: v.reason }));
      return;
    }
    case 'purchase': {
      const p = await db.get<{ id: string; client_op_id: string; supplier_id: string; doc_date: string; total: string; created_at: string }>(
        'SELECT id, client_op_id, supplier_id, doc_date, CAST(total AS TEXT) AS total, created_at FROM purchases WHERE id = ?',
        [ev.id],
      );
      if (!p) return;
      const lines = await db.all<{ product_id: string; product_name: string; qty_milli: string; unit: string; unit_cost: string }>(
        `SELECT product_id, product_name, CAST(qty_milli AS TEXT) AS qty_milli, unit, CAST(unit_cost AS TEXT) AS unit_cost
         FROM purchase_lines WHERE purchase_id = ? ORDER BY line_index`,
        [ev.id],
      );
      const pay = await db.get<{ amount: string; method: string }>('SELECT CAST(amount AS TEXT) AS amount, method FROM supplier_payments WHERE client_op_id = ?', [`purchase-pay:${p.client_op_id}`]);
      await unwrap(
        cloud.rpc('post_purchase', {
          p_shop_id: shopId, p_purchase_id: p.id, p_client_op_id: p.client_op_id, p_supplier_id: p.supplier_id, p_doc_date: p.doc_date,
          p_lines: lines, p_client_total: p.total, p_created_at: p.created_at,
          p_payment_method: pay?.method ?? null, p_paid: pay?.amount ?? null,
        }),
      );
      return;
    }
    case 'purchase_reversal': {
      const r = await db.get<{ purchase_id: string; client_op_id: string; reason: string }>('SELECT purchase_id, client_op_id, reason FROM purchase_reversals WHERE id = ?', [ev.id]);
      if (!r) return;
      await unwrap(cloud.rpc('reverse_purchase', { p_shop_id: shopId, p_document_id: r.purchase_id, p_client_op_id: r.client_op_id, p_reason: r.reason }));
      return;
    }
    case 'supplier_payment': {
      const p = await db.get<{ id: string; client_op_id: string; supplier_id: string; amount: string; method: string; note: string | null; created_at: string }>(
        'SELECT id, client_op_id, supplier_id, CAST(amount AS TEXT) AS amount, method, note, created_at FROM supplier_payments WHERE id = ?',
        [ev.id],
      );
      if (!p) return;
      await unwrap(
        cloud.rpc('record_supplier_payment', {
          p_shop_id: shopId, p_payment_id: p.id, p_client_op_id: p.client_op_id, p_supplier_id: p.supplier_id,
          p_amount: p.amount, p_method: p.method, p_note: p.note, p_created_at: p.created_at,
        }),
      );
      return;
    }
    case 'supplier_payment_void': {
      const v = await db.get<{ payment_id: string; reason: string; op: string }>(
        'SELECT v.payment_id, v.reason, p.client_op_id AS op FROM supplier_payment_voids v JOIN supplier_payments p ON p.id = v.payment_id WHERE v.id = ?',
        [ev.id],
      );
      if (!v) return;
      const paymentId = v.op.startsWith('purchase-pay:') ? await serverPaymentId(cloud, shopId, 'supplier_payments', v.op) : v.payment_id;
      await unwrap(cloud.rpc('void_supplier_payment', { p_shop_id: shopId, p_payment_id: paymentId, p_reason: v.reason }));
      return;
    }
    case 'stock_adjustment': {
      const a = await db.get<{ product_id: string; client_op_id: string; qty_milli: string; reason: string }>(
        'SELECT product_id, client_op_id, CAST(qty_milli AS TEXT) AS qty_milli, reason FROM stock_adjustments WHERE id = ?',
        [ev.id],
      );
      if (!a) return;
      await unwrap(cloud.rpc('adjust_stock', { p_shop_id: shopId, p_product_id: a.product_id, p_client_op_id: a.client_op_id, p_qty_milli: a.qty_milli, p_reason: a.reason }));
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Avtomatik sinxronlash yordamchilari
// ---------------------------------------------------------------------------

export interface SyncMeta {
  lastSyncAt: string | null;
  lastError: string | null;
}

const META_AT = 'sync_last_at';
const META_ERR = 'sync_last_error';

/** Oxirgi sinxronlash natijasini lokal saqlash (settings jadvali — kalit/qiymat) */
export async function saveSyncMeta(db: SqlDb, meta: SyncMeta, now: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [key, value] of [
      [META_AT, meta.lastSyncAt ?? ''],
      [META_ERR, meta.lastError ?? ''],
    ] as const) {
      await tx.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
  });
}

export async function loadSyncMeta(db: SqlDb): Promise<SyncMeta> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings WHERE key IN (?, ?)', [META_AT, META_ERR]);
  const get = (k: string) => rows.find((r) => r.key === k)?.value || null;
  return { lastSyncAt: get(META_AT), lastError: get(META_ERR) };
}

/** Lokal yozuv shu do'kon uchun bulutga muvaffaqiyatli yuborilganmi (server tasdiqlagan) */
export async function isPushed(db: SqlDb, shopId: string, entity: SyncEntity, localId: string): Promise<boolean> {
  return (await db.get<{ x: number }>('SELECT 1 AS x FROM sync_log2 WHERE shop_id = ? AND entity = ? AND local_id = ?', [shopId, entity, localId])) !== null;
}

export const SYNC_BASE_DELAY_MS = 30_000;
export const SYNC_MAX_DELAY_MS = 5 * 60_000;

/**
 * Keyingi avtomatik urinishgacha kutish. Tarmoq xatosida eksponensial (30s → 5 daq).
 * Ruxsat/validatsiya xatolarida avtomatik qayta urinilmaydi (null) — foydalanuvchi harakati kerak,
 * aks holda server bir xil yozuvni cheksiz rad etib turadi.
 */
export function nextSyncDelay(prevDelay: number | null, error: CloudError | null): number | null {
  if (!error) return SYNC_BASE_DELAY_MS;
  if (error.kind === 'network' || error.kind === 'unknown') {
    return Math.min(SYNC_MAX_DELAY_MS, prevDelay ? prevDelay * 2 : SYNC_BASE_DELAY_MS);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lokal baza ↔ bulut do'koni bog'lanishi (bir telefonda boshqa hisobga kirilganda aralashmaslik uchun)
// ---------------------------------------------------------------------------

const BOUND_SHOP = 'cloud_shop_id';

/**
 * Lokal baza birinchi sinxronlangan do'konga bog'lanadi. Keyin boshqa do'kon (boshqa hisob) bilan
 * push ham, pull ham bloklanadi — aks holda bir foydalanuvchining lokal savdolari boshqasining
 * do'koniga yuborilib, bulut yozuvlari esa aralashib ketardi.
 */
export async function ensureShopBinding(db: SqlDb, shopId: string, now: string): Promise<{ ok: true } | { ok: false; error: CloudError }> {
  return db.transaction(async (tx) => {
    const row = await tx.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [BOUND_SHOP]);
    if (row?.value === shopId) return { ok: true as const };
    if (row?.value) {
      return {
        ok: false as const,
        error: new CloudError(
          'forbidden',
          "Bu telefondagi ma'lumotlar boshqa hisob (do'kon) bilan sinxronlangan. Aralashib ketmasligi uchun sinxronlash to'xtatildi — avvalgi hisobga kiring.",
        ),
      };
    }
    await tx.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [BOUND_SHOP, shopId, now],
    );
    return { ok: true as const };
  });
}
