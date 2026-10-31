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

export type SyncEntity = 'customer' | 'product' | 'sale' | 'reversal' | 'payment' | 'payment_void';

export interface PushResult {
  pushed: Record<SyncEntity, number>;
  skipped: number;
  /** Xato bo'lsa — qaysi bosqichda to'xtagani; qolganlari keyingi safar yuboriladi */
  error: CloudError | null;
}

type Event =
  | { kind: 'sale'; id: string; at: string }
  | { kind: 'reversal'; id: string; at: string }
  | { kind: 'payment'; id: string; at: string }
  | { kind: 'payment_void'; id: string; at: string };

const RANK: Record<Event['kind'], number> = { sale: 0, reversal: 1, payment: 2, payment_void: 3 };

export async function pendingCount(db: SqlDb, shopId: string): Promise<number> {
  const row = await db.get<{ n: number }>(
    `SELECT
       (SELECT COUNT(*) FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sync_log l WHERE l.shop_id = ? AND l.entity = 'sale' AND l.local_id = s.id))
     + (SELECT COUNT(*) FROM sale_reversals r WHERE NOT EXISTS (SELECT 1 FROM sync_log l WHERE l.shop_id = ? AND l.entity = 'reversal' AND l.local_id = r.id))
     + (SELECT COUNT(*) FROM payments p WHERE NOT EXISTS (SELECT 1 FROM sync_log l WHERE l.shop_id = ? AND l.entity = 'payment' AND l.local_id = p.id))
     + (SELECT COUNT(*) FROM payment_voids v WHERE NOT EXISTS (SELECT 1 FROM sync_log l WHERE l.shop_id = ? AND l.entity = 'payment_void' AND l.local_id = v.id)) AS n`,
    [shopId, shopId, shopId, shopId],
  );
  return row?.n ?? 0;
}

export async function pushToCloud(
  db: SqlDb,
  cloud: CloudClient,
  shopId: string,
  deps: { now: () => string; onProgress?: (done: number, total: number) => void },
): Promise<PushResult> {
  const pushed: PushResult['pushed'] = { customer: 0, product: 0, sale: 0, reversal: 0, payment: 0, payment_void: 0 };
  let skipped = 0;
  const logged = async (entity: SyncEntity, id: string) =>
    (await db.get<{ x: number }>('SELECT 1 AS x FROM sync_log WHERE shop_id = ? AND entity = ? AND local_id = ?', [shopId, entity, id])) !== null;
  const markPushed = (entity: SyncEntity, id: string) =>
    db.run('INSERT OR IGNORE INTO sync_log (shop_id, entity, local_id, pushed_at) VALUES (?, ?, ?, ?)', [shopId, entity, id, deps.now()]);

  try {
    // 1. Mijozlar va mahsulotlar — faqat yangi yoki oxirgi yuborishdan keyin telefonda tahrirlanganlari.
    //    (Har safar hammasini upsert qilish web'da o'chirilgan mijozni qayta "tiriltirar" edi.)
    const changedSql = (table: string, entity: SyncEntity) =>
      `SELECT t.* FROM ${table} t
       LEFT JOIN sync_log l ON l.shop_id = ? AND l.entity = '${entity}' AND l.local_id = t.id
       WHERE l.local_id IS NULL OR t.updated_at > l.pushed_at
       ORDER BY t.created_at`;
    const markSynced = (entity: SyncEntity, id: string) =>
      db.run(
        `INSERT INTO sync_log (shop_id, entity, local_id, pushed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(shop_id, entity, local_id) DO UPDATE SET pushed_at = excluded.pushed_at`,
        [shopId, entity, id, deps.now()],
      );
    const customers = await db.all<{ id: string; name: string; phone: string | null; note: string | null }>(
      changedSql('customers', 'customer'),
      [shopId],
    );
    if (customers.length > 0) {
      await unwrap(cloud.upsert('customers', customers.map((c) => ({ id: c.id, shop_id: shopId, name: c.name, phone: c.phone, notes: c.note }))));
      for (const c of customers) await markSynced('customer', c.id);
      pushed.customer = customers.length;
    }
    const products = await db.all<{ id: string; name: string; unit: string; unit_price: number }>(changedSql('products', 'product'), [
      shopId,
    ]);
    if (products.length > 0) {
      const prices = await db.all<{ id: string; p: string }>(
        `SELECT id, CAST(unit_price AS TEXT) AS p FROM products WHERE id IN (${products.map(() => '?').join(',')})`,
        products.map((x) => x.id),
      );
      const priceOf = new Map(prices.map((x) => [x.id, x.p]));
      await unwrap(
        cloud.upsert('products', products.map((x) => ({ id: x.id, shop_id: shopId, name: x.name, unit: x.unit, last_price: priceOf.get(x.id) }))),
      );
      for (const x of products) await markSynced('product', x.id);
      pushed.product = products.length;
    }

    // 2. Moliyaviy hodisalar — vaqt tartibida
    const events: Event[] = [
      ...(await db.all<{ id: string; at: string }>('SELECT id, created_at AS at FROM sales')).map((r) => ({ kind: 'sale' as const, ...r })),
      ...(await db.all<{ id: string; at: string }>('SELECT id, created_at AS at FROM sale_reversals')).map((r) => ({ kind: 'reversal' as const, ...r })),
      ...(await db.all<{ id: string; at: string }>('SELECT id, created_at AS at FROM payments')).map((r) => ({ kind: 'payment' as const, ...r })),
      ...(await db.all<{ id: string; at: string }>('SELECT id, created_at AS at FROM payment_voids')).map((r) => ({ kind: 'payment_void' as const, ...r })),
    ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : RANK[a.kind] - RANK[b.kind]));

    let done = 0;
    for (const ev of events) {
      deps.onProgress?.(done, events.length);
      if (await logged(ev.kind, ev.id)) {
        skipped++;
        done++;
        continue;
      }
      await pushEvent(db, cloud, shopId, ev);
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

async function pushEvent(db: SqlDb, cloud: CloudClient, shopId: string, ev: Event): Promise<void> {
  if (ev.kind === 'sale') {
    const sale = await db.get<{ id: string; client_op_id: string; customer_id: string | null; raw_input: string | null; total: string; created_at: string }>(
      'SELECT id, client_op_id, customer_id, raw_input, CAST(total AS TEXT) AS total, created_at FROM sales WHERE id = ?',
      [ev.id],
    );
    if (!sale) return;
    const lines = await db.all<{ product_name: string; qty_milli: string; unit: string; unit_price: string; raw_text: string | null }>(
      `SELECT product_name, CAST(qty_milli AS TEXT) AS qty_milli, unit, CAST(unit_price AS TEXT) AS unit_price, raw_text
       FROM sale_lines WHERE sale_id = ? ORDER BY line_index`,
      [ev.id],
    );
    await unwrap(
      cloud.rpc('post_sale', {
        p_shop_id: shopId,
        p_sale_id: sale.id,
        p_client_op_id: sale.client_op_id,
        p_customer_id: sale.customer_id,
        p_raw_input: sale.raw_input,
        // Pul va miqdor — string (BigInt JSON number'ga sig'masligi mumkin); server o'zi qayta hisoblaydi
        p_lines: lines,
        p_client_total: sale.total,
        p_created_at: sale.created_at,
      }),
    );
    return;
  }
  if (ev.kind === 'reversal') {
    const r = await db.get<{ sale_id: string; client_op_id: string; reason: string }>(
      'SELECT sale_id, client_op_id, reason FROM sale_reversals WHERE id = ?',
      [ev.id],
    );
    if (!r) return;
    await unwrap(cloud.rpc('reverse_sale', { p_shop_id: shopId, p_document_id: r.sale_id, p_client_op_id: r.client_op_id, p_reason: r.reason }));
    return;
  }
  if (ev.kind === 'payment') {
    const p = await db.get<{ id: string; client_op_id: string; customer_id: string; amount: string; method: string; note: string | null; created_at: string }>(
      'SELECT id, client_op_id, customer_id, CAST(amount AS TEXT) AS amount, method, note, created_at FROM payments WHERE id = ?',
      [ev.id],
    );
    if (!p) return;
    await unwrap(
      cloud.rpc('record_payment', {
        p_shop_id: shopId,
        p_payment_id: p.id,
        p_client_op_id: p.client_op_id,
        p_customer_id: p.customer_id,
        p_amount: p.amount,
        p_method: p.method,
        p_note: p.note,
        p_created_at: p.created_at,
      }),
    );
    return;
  }
  const v = await db.get<{ payment_id: string; reason: string }>('SELECT payment_id, reason FROM payment_voids WHERE id = ?', [ev.id]);
  if (!v) return;
  await unwrap(cloud.rpc('void_payment', { p_shop_id: shopId, p_payment_id: v.payment_id, p_reason: v.reason }));
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
  return (await db.get<{ x: number }>('SELECT 1 AS x FROM sync_log WHERE shop_id = ? AND entity = ? AND local_id = ?', [shopId, entity, localId])) !== null;
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
