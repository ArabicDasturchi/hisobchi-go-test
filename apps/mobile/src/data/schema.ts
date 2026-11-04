/**
 * Qurilmadagi SQLite sxemasi.
 *
 * - sales, sale_lines, ledger_entries — append-only: UPDATE/DELETE trigger bilan taqiqlangan.
 * - sale_lines.line_total CHECK orqali SQL formulasi bilan tekshiriladi:
 *   (qty_milli * unit_price + 500) / 1000 — TypeScript hisobidan mustaqil.
 * - sales.client_op_id UNIQUE — takroriy saqlashning oldini oladi.
 */

import type { SqlConn, SqlDb } from './db';

/** Tartibli migratsiyalar (indeks + 1 = user_version). Testlar eski versiyani yaratish uchun o'qiydi. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS customers (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone       TEXT,
    note        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS sales (
    id            TEXT PRIMARY KEY NOT NULL,
    client_op_id  TEXT NOT NULL UNIQUE,
    customer_id   TEXT REFERENCES customers(id),
    total         INTEGER NOT NULL CHECK (total >= 0),
    ts_total      INTEGER NOT NULL,
    sql_total     INTEGER NOT NULL,
    line_count    INTEGER NOT NULL CHECK (line_count > 0),
    raw_input     TEXT,
    created_at    TEXT NOT NULL,
    CHECK (total = ts_total AND total = sql_total)
  );
  CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
  CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);

  CREATE TABLE IF NOT EXISTS sale_lines (
    id            TEXT PRIMARY KEY NOT NULL,
    sale_id       TEXT NOT NULL REFERENCES sales(id),
    line_index    INTEGER NOT NULL CHECK (line_index >= 0),
    product_name  TEXT NOT NULL CHECK (length(trim(product_name)) > 0),
    qty_milli     INTEGER NOT NULL CHECK (qty_milli > 0),
    unit          TEXT NOT NULL,
    unit_price    INTEGER NOT NULL CHECK (unit_price >= 0),
    line_total    INTEGER NOT NULL CHECK (line_total = (qty_milli * unit_price + 500) / 1000),
    raw_text      TEXT,
    UNIQUE (sale_id, line_index)
  );

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id           TEXT PRIMARY KEY NOT NULL,
    sale_id      TEXT NOT NULL REFERENCES sales(id),
    customer_id  TEXT REFERENCES customers(id),
    entry_type   TEXT NOT NULL CHECK (entry_type IN ('sale')),
    amount       INTEGER NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger_entries(customer_id);

  CREATE TRIGGER IF NOT EXISTS sales_no_update BEFORE UPDATE ON sales
    BEGIN SELECT RAISE(ABORT, 'append-only: sales'); END;
  CREATE TRIGGER IF NOT EXISTS sales_no_delete BEFORE DELETE ON sales
    BEGIN SELECT RAISE(ABORT, 'append-only: sales'); END;
  CREATE TRIGGER IF NOT EXISTS sale_lines_no_update BEFORE UPDATE ON sale_lines
    BEGIN SELECT RAISE(ABORT, 'append-only: sale_lines'); END;
  CREATE TRIGGER IF NOT EXISTS sale_lines_no_delete BEFORE DELETE ON sale_lines
    BEGIN SELECT RAISE(ABORT, 'append-only: sale_lines'); END;
  CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'append-only: ledger_entries'); END;
  CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'append-only: ledger_entries'); END;
  `,
  // v2 — tugallanmagan qoralama. Ledger'dan butunlay alohida, o'zgaruvchan (append-only emas).
  `
  CREATE TABLE IF NOT EXISTS drafts (
    id            TEXT PRIMARY KEY NOT NULL,
    client_op_id  TEXT NOT NULL,
    payload       TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  `,
  // v3 — savdoni bekor qilish (reversal). ledger_entries CHECK'ini o'zgartirish jadvalni qayta
  // qurishni talab qiladi (DROP) — shuning uchun alohida append-only jadval.
  // Bitta savdo faqat bir marta bekor qilinadi; summa va mijoz savdoga teng bo'lishi shart.
  `
  CREATE TABLE IF NOT EXISTS sale_reversals (
    id            TEXT PRIMARY KEY NOT NULL,
    sale_id       TEXT NOT NULL UNIQUE REFERENCES sales(id),
    client_op_id  TEXT NOT NULL UNIQUE,
    customer_id   TEXT REFERENCES customers(id),
    amount        INTEGER NOT NULL CHECK (amount >= 0),
    reason        TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reversals_customer ON sale_reversals(customer_id);

  CREATE TRIGGER IF NOT EXISTS reversal_matches_sale BEFORE INSERT ON sale_reversals
    WHEN NEW.amount IS NOT (SELECT total FROM sales WHERE id = NEW.sale_id)
      OR NEW.customer_id IS NOT (SELECT customer_id FROM sales WHERE id = NEW.sale_id)
    BEGIN SELECT RAISE(ABORT, 'reversal: summa yoki mijoz savdoga mos emas'); END;
  CREATE TRIGGER IF NOT EXISTS reversals_no_update BEFORE UPDATE ON sale_reversals
    BEGIN SELECT RAISE(ABORT, 'append-only: sale_reversals'); END;
  CREATE TRIGGER IF NOT EXISTS reversals_no_delete BEFORE DELETE ON sale_reversals
    BEGIN SELECT RAISE(ABORT, 'append-only: sale_reversals'); END;
  `,
  // v4 — savdoni tarixdan yashirish. Moliyaviy ta'siri YO'Q (faqat ro'yxatda ko'rinish).
  // Append-only hodisalar: yashirish/qayta ko'rsatish audit izi bilan; joriy holat — oxirgi hodisa.
  // Ilova bitta foydalanuvchili (auth yo'q) — shuning uchun foydalanuvchi ustuni yo'q.
  `
  CREATE TABLE IF NOT EXISTS sale_visibility_events (
    id          TEXT PRIMARY KEY NOT NULL,
    sale_id     TEXT NOT NULL REFERENCES sales(id),
    action      TEXT NOT NULL CHECK (action IN ('hide', 'unhide')),
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_visibility_sale ON sale_visibility_events(sale_id);
  CREATE TRIGGER IF NOT EXISTS visibility_no_update BEFORE UPDATE ON sale_visibility_events
    BEGIN SELECT RAISE(ABORT, 'append-only: sale_visibility_events'); END;
  CREATE TRIGGER IF NOT EXISTS visibility_no_delete BEFORE DELETE ON sale_visibility_events
    BEGIN SELECT RAISE(ABORT, 'append-only: sale_visibility_events'); END;
  `,
  // v5 — mahsulot katalogi, to'lovlar (qarz hisobi) va do'kon sozlamalari.
  // Savdo qatorlari mahsulot nomi/narxining NUSXASINI saqlaydi — katalog o'zgarsa tarix o'zgarmaydi.
  // To'lovlar append-only; xato to'lov alohida "void" yozuvi bilan bekor qilinadi (bir marta).
  `
  CREATE TABLE IF NOT EXISTS products (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    unit        TEXT NOT NULL,
    unit_price  INTEGER NOT NULL CHECK (unit_price >= 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS payments (
    id            TEXT PRIMARY KEY NOT NULL,
    client_op_id  TEXT NOT NULL UNIQUE,
    customer_id   TEXT NOT NULL REFERENCES customers(id),
    amount        INTEGER NOT NULL CHECK (amount > 0),
    method        TEXT NOT NULL CHECK (method IN ('naqd', 'karta', 'otkazma')),
    note          TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

  CREATE TABLE IF NOT EXISTS payment_voids (
    id          TEXT PRIMARY KEY NOT NULL,
    payment_id  TEXT NOT NULL UNIQUE REFERENCES payments(id),
    reason      TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
    created_at  TEXT NOT NULL
  );

  CREATE TRIGGER IF NOT EXISTS payments_no_update BEFORE UPDATE ON payments
    BEGIN SELECT RAISE(ABORT, 'append-only: payments'); END;
  CREATE TRIGGER IF NOT EXISTS payments_no_delete BEFORE DELETE ON payments
    BEGIN SELECT RAISE(ABORT, 'append-only: payments'); END;
  CREATE TRIGGER IF NOT EXISTS payment_voids_no_update BEFORE UPDATE ON payment_voids
    BEGIN SELECT RAISE(ABORT, 'append-only: payment_voids'); END;
  CREATE TRIGGER IF NOT EXISTS payment_voids_no_delete BEFORE DELETE ON payment_voids
    BEGIN SELECT RAISE(ABORT, 'append-only: payment_voids'); END;

  CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY NOT NULL,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  `,
  // v6 — bulutga bir tomonlama zaxira (push) jurnali. Qaysi lokal yozuv qaysi bulut do'koniga
  // muvaffaqiyatli yuborilganini qayd etadi; lokal ma'lumot hech qachon bulutdan qayta yozilmaydi.
  `
  CREATE TABLE IF NOT EXISTS sync_log (
    shop_id    TEXT NOT NULL,
    entity     TEXT NOT NULL CHECK (entity IN ('customer', 'product', 'sale', 'reversal', 'payment', 'payment_void')),
    local_id   TEXT NOT NULL,
    pushed_at  TEXT NOT NULL,
    PRIMARY KEY (shop_id, entity, local_id)
  );
  `,
  // v7 — Vazifa 3 (S2): ta'minotchilar, kirim, ta'minotchi to'lovi, ombor tuzatishi.
  // Ombor qoldig'i alohida saqlanmaydi: kirim - savdo (bekor qilinmagan) + tuzatish, qatorlardan hisoblanadi.
  // Hamma moliyaviy jadval append-only; kirim jami CHECK bilan SQL formulasi (TS hisobidan mustaqil) tekshiriladi.
  // sync_log2: sync_log ning CHECK'i yangi entity'larni qabul qilmaydi (SQLite'da CHECK o'zgartirib bo'lmaydi);
  // eski yozuvlar migrate() ichida ko'chiriladi (copySyncLog; INSERT OR IGNORE — qayta ishga tushirish xavfsiz).
  // Mavjud jadvallarga ustunlar (kind, is_active, source, cost_price, product_id, unit_cost) ensureColumns() orqali qo'shiladi.
  `
  CREATE TABLE IF NOT EXISTS suppliers (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone       TEXT,
    note        TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS purchases (
    id            TEXT PRIMARY KEY NOT NULL,
    client_op_id  TEXT NOT NULL UNIQUE,
    supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
    doc_date      TEXT NOT NULL,
    total         INTEGER NOT NULL CHECK (total >= 0),
    ts_total      INTEGER NOT NULL,
    sql_total     INTEGER NOT NULL,
    line_count    INTEGER NOT NULL CHECK (line_count > 0),
    created_at    TEXT NOT NULL,
    CHECK (total = ts_total AND total = sql_total)
  );
  CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id, doc_date);

  CREATE TABLE IF NOT EXISTS purchase_lines (
    id            TEXT PRIMARY KEY NOT NULL,
    purchase_id   TEXT NOT NULL REFERENCES purchases(id),
    line_index    INTEGER NOT NULL CHECK (line_index >= 0),
    product_id    TEXT NOT NULL REFERENCES products(id),
    product_name  TEXT NOT NULL CHECK (length(trim(product_name)) > 0),
    qty_milli     INTEGER NOT NULL CHECK (qty_milli > 0),
    unit          TEXT NOT NULL,
    unit_cost     INTEGER NOT NULL CHECK (unit_cost >= 0),
    line_total    INTEGER NOT NULL CHECK (line_total = (qty_milli * unit_cost + 500) / 1000),
    UNIQUE (purchase_id, line_index)
  );
  CREATE INDEX IF NOT EXISTS idx_purchase_lines_product ON purchase_lines(product_id);

  CREATE TABLE IF NOT EXISTS purchase_reversals (
    id            TEXT PRIMARY KEY NOT NULL,
    purchase_id   TEXT NOT NULL UNIQUE REFERENCES purchases(id),
    client_op_id  TEXT NOT NULL UNIQUE,
    supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
    amount        INTEGER NOT NULL CHECK (amount >= 0),
    reason        TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
    created_at    TEXT NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS purchase_reversal_matches BEFORE INSERT ON purchase_reversals
    WHEN NEW.amount IS NOT (SELECT total FROM purchases WHERE id = NEW.purchase_id)
      OR NEW.supplier_id IS NOT (SELECT supplier_id FROM purchases WHERE id = NEW.purchase_id)
    BEGIN SELECT RAISE(ABORT, 'purchase_reversal: summa yoki ta''minotchi kirimga mos emas'); END;

  CREATE TABLE IF NOT EXISTS supplier_payments (
    id            TEXT PRIMARY KEY NOT NULL,
    client_op_id  TEXT NOT NULL UNIQUE,
    supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
    amount        INTEGER NOT NULL CHECK (amount > 0),
    method        TEXT NOT NULL CHECK (method IN ('naqd', 'karta', 'otkazma')),
    note          TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);

  CREATE TABLE IF NOT EXISTS supplier_payment_voids (
    id          TEXT PRIMARY KEY NOT NULL,
    payment_id  TEXT NOT NULL UNIQUE REFERENCES supplier_payments(id),
    reason      TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock_adjustments (
    id            TEXT PRIMARY KEY NOT NULL,
    client_op_id  TEXT NOT NULL UNIQUE,
    product_id    TEXT NOT NULL REFERENCES products(id),
    qty_milli     INTEGER NOT NULL CHECK (qty_milli <> 0),
    reason        TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(product_id);

  CREATE TRIGGER IF NOT EXISTS purchases_no_update BEFORE UPDATE ON purchases BEGIN SELECT RAISE(ABORT, 'append-only: purchases'); END;
  CREATE TRIGGER IF NOT EXISTS purchases_no_delete BEFORE DELETE ON purchases BEGIN SELECT RAISE(ABORT, 'append-only: purchases'); END;
  CREATE TRIGGER IF NOT EXISTS purchase_lines_no_update BEFORE UPDATE ON purchase_lines BEGIN SELECT RAISE(ABORT, 'append-only: purchase_lines'); END;
  CREATE TRIGGER IF NOT EXISTS purchase_lines_no_delete BEFORE DELETE ON purchase_lines BEGIN SELECT RAISE(ABORT, 'append-only: purchase_lines'); END;
  CREATE TRIGGER IF NOT EXISTS purchase_reversals_no_update BEFORE UPDATE ON purchase_reversals BEGIN SELECT RAISE(ABORT, 'append-only: purchase_reversals'); END;
  CREATE TRIGGER IF NOT EXISTS purchase_reversals_no_delete BEFORE DELETE ON purchase_reversals BEGIN SELECT RAISE(ABORT, 'append-only: purchase_reversals'); END;
  CREATE TRIGGER IF NOT EXISTS supplier_payments_no_update BEFORE UPDATE ON supplier_payments BEGIN SELECT RAISE(ABORT, 'append-only: supplier_payments'); END;
  CREATE TRIGGER IF NOT EXISTS supplier_payments_no_delete BEFORE DELETE ON supplier_payments BEGIN SELECT RAISE(ABORT, 'append-only: supplier_payments'); END;
  CREATE TRIGGER IF NOT EXISTS supplier_payment_voids_no_update BEFORE UPDATE ON supplier_payment_voids BEGIN SELECT RAISE(ABORT, 'append-only: supplier_payment_voids'); END;
  CREATE TRIGGER IF NOT EXISTS supplier_payment_voids_no_delete BEFORE DELETE ON supplier_payment_voids BEGIN SELECT RAISE(ABORT, 'append-only: supplier_payment_voids'); END;
  CREATE TRIGGER IF NOT EXISTS stock_adjustments_no_update BEFORE UPDATE ON stock_adjustments BEGIN SELECT RAISE(ABORT, 'append-only: stock_adjustments'); END;
  CREATE TRIGGER IF NOT EXISTS stock_adjustments_no_delete BEFORE DELETE ON stock_adjustments BEGIN SELECT RAISE(ABORT, 'append-only: stock_adjustments'); END;

  CREATE TABLE IF NOT EXISTS sync_log2 (
    shop_id    TEXT NOT NULL,
    entity     TEXT NOT NULL,
    local_id   TEXT NOT NULL,
    pushed_at  TEXT NOT NULL,
    PRIMARY KEY (shop_id, entity, local_id)
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** ledger.ts so'rovlari foydalanadigan jadvallar va ustunlar */
export const REQUIRED_SCHEMA: Record<string, readonly string[]> = {
  customers: ['id', 'name', 'phone', 'note', 'kind', 'is_active', 'source', 'created_at', 'updated_at'],
  sales: ['id', 'client_op_id', 'customer_id', 'total', 'ts_total', 'sql_total', 'line_count', 'raw_input', 'created_at'],
  sale_lines: ['id', 'sale_id', 'line_index', 'product_name', 'qty_milli', 'unit', 'unit_price', 'line_total', 'raw_text', 'product_id', 'unit_cost'],
  ledger_entries: ['id', 'sale_id', 'customer_id', 'entry_type', 'amount', 'created_at'],
  drafts: ['id', 'client_op_id', 'payload', 'updated_at'],
  sale_reversals: ['id', 'sale_id', 'client_op_id', 'customer_id', 'amount', 'reason', 'created_at'],
  sale_visibility_events: ['id', 'sale_id', 'action', 'created_at'],
  products: ['id', 'name', 'unit', 'unit_price', 'cost_price', 'is_active', 'source', 'created_at', 'updated_at'],
  payments: ['id', 'client_op_id', 'customer_id', 'amount', 'method', 'note', 'created_at'],
  payment_voids: ['id', 'payment_id', 'reason', 'created_at'],
  settings: ['key', 'value', 'updated_at'],
  sync_log: ['shop_id', 'entity', 'local_id', 'pushed_at'],
  sync_log2: ['shop_id', 'entity', 'local_id', 'pushed_at'],
  suppliers: ['id', 'name', 'phone', 'note', 'is_active', 'created_at', 'updated_at'],
  purchases: ['id', 'client_op_id', 'supplier_id', 'doc_date', 'total', 'ts_total', 'sql_total', 'line_count', 'created_at'],
  purchase_lines: ['id', 'purchase_id', 'line_index', 'product_id', 'product_name', 'qty_milli', 'unit', 'unit_cost', 'line_total'],
  purchase_reversals: ['id', 'purchase_id', 'client_op_id', 'supplier_id', 'amount', 'reason', 'created_at'],
  supplier_payments: ['id', 'client_op_id', 'supplier_id', 'amount', 'method', 'note', 'created_at'],
  supplier_payment_voids: ['id', 'payment_id', 'reason', 'created_at'],
  stock_adjustments: ['id', 'client_op_id', 'product_id', 'qty_milli', 'reason', 'created_at'],
};

/**
 * Mavjud jadvallarga keyin qo'shilgan ustunlar. SQLite'da `ADD COLUMN IF NOT EXISTS` yo'q, shuning uchun
 * PRAGMA table_info bilan tekshirib qo'shiladi (qayta ishga tushirish xavfsiz, ma'lumot saqlanadi).
 * Eski qatorlar default qiymat oladi: mijoz 'regular'/faol, mahsulot faol, savdo qatori tan narxi NULL (noma'lum).
 */
export const ADDED_COLUMNS: readonly { table: string; column: string; ddl: string }[] = [
  { table: 'customers', column: 'kind', ddl: "TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'one_time'))" },
  { table: 'customers', column: 'is_active', ddl: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'customers', column: 'source', ddl: "TEXT NOT NULL DEFAULT 'app'" },
  { table: 'products', column: 'cost_price', ddl: 'INTEGER CHECK (cost_price IS NULL OR cost_price >= 0)' },
  { table: 'products', column: 'is_active', ddl: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'products', column: 'source', ddl: "TEXT NOT NULL DEFAULT 'app'" },
  { table: 'sale_lines', column: 'product_id', ddl: 'TEXT' },
  { table: 'sale_lines', column: 'unit_cost', ddl: 'INTEGER CHECK (unit_cost IS NULL OR unit_cost >= 0)' },
];

/** sync_log -> sync_log2 (eski yozuvlar yo'qolmasin; ikkala jadval bor bo'lsagina) */
async function copySyncLog(db: SqlConn): Promise<void> {
  const t = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sync_log', 'sync_log2')");
  if (t.length === 2) {
    await db.exec('INSERT OR IGNORE INTO sync_log2 (shop_id, entity, local_id, pushed_at) SELECT shop_id, entity, local_id, pushed_at FROM sync_log;');
  }
}

async function ensureColumns(db: SqlConn): Promise<void> {
  await copySyncLog(db);
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const info = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
    if (info.length === 0) continue; // jadval hali yo'q: migratsiyadan keyin qayta uriniladi
    if (!info.some((c) => c.name === column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
  }
}

export const REQUIRED_TRIGGERS = [
  'sales_no_update',
  'sales_no_delete',
  'sale_lines_no_update',
  'sale_lines_no_delete',
  'ledger_no_update',
  'ledger_no_delete',
  'reversal_matches_sale',
  'reversals_no_update',
  'reversals_no_delete',
  'visibility_no_update',
  'visibility_no_delete',
  'payments_no_update',
  'payments_no_delete',
  'payment_voids_no_update',
  'payment_voids_no_delete',
  'purchases_no_update',
  'purchases_no_delete',
  'purchase_lines_no_update',
  'purchase_lines_no_delete',
  'purchase_reversal_matches',
  'purchase_reversals_no_update',
  'purchase_reversals_no_delete',
  'supplier_payments_no_update',
  'supplier_payments_no_delete',
  'supplier_payment_voids_no_update',
  'supplier_payment_voids_no_delete',
  'stock_adjustments_no_update',
  'stock_adjustments_no_delete',
] as const;

export interface SchemaReport {
  userVersion: number;
  tables: string[];
  problems: string[];
}

export class SchemaError extends Error {
  constructor(public readonly report: SchemaReport) {
    super(`Ma'lumotlar bazasi sxemasi noto'g'ri: ${report.problems.join('; ')}`);
    this.name = 'SchemaError';
  }
}

/** Bazadagi haqiqiy sxemani kod kutayotgan sxema bilan solishtiradi (hech narsa o'zgartirmaydi) */
export async function inspectSchema(db: SqlConn): Promise<SchemaReport> {
  const version = await db.get<{ user_version: number }>('PRAGMA user_version');
  const objects = await db.all<{ type: string; name: string }>(
    "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);
  const triggers = new Set(objects.filter((o) => o.type === 'trigger').map((o) => o.name));
  const problems: string[] = [];

  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    if (!tables.includes(table)) {
      problems.push(`jadval yo'q: ${table}`);
      continue;
    }
    const info = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
    const actual = new Set(info.map((c) => c.name));
    const missing = columns.filter((c) => !actual.has(c));
    if (missing.length) problems.push(`${table}: ustun yo'q — ${missing.join(', ')}`);
  }
  for (const t of REQUIRED_TRIGGERS) {
    if (!triggers.has(t)) problems.push(`trigger yo'q: ${t}`);
  }
  return { userVersion: version?.user_version ?? 0, tables, problems };
}

async function applyMigrations(db: SqlDb, from: number): Promise<void> {
  for (let v = from; v < MIGRATIONS.length; v++) {
    await db.transaction((tx) => tx.exec(`${MIGRATIONS[v]} PRAGMA user_version = ${v + 1};`));
  }
}

/**
 * Migratsiyalarni qo'llaydi va natijani tekshiradi.
 * - Hech qachon DROP yoki reset qilmaydi; barcha buyruqlar IF NOT EXISTS.
 * - Qayta chaqirish xavfsiz.
 * - user_version bor, lekin jadval/trigger yetishmasa — migratsiyalar
 *   (IF NOT EXISTS bilan) qayta qo'llanadi, mavjud ma'lumot saqlanadi.
 * - Shundan keyin ham sxema mos kelmasa — SchemaError (masalan, eski ustunlar).
 */
export async function migrate(db: SqlDb): Promise<SchemaReport> {
  // Ulanish darajasidagi sozlama; tranzaksiyadan tashqarida bajarilishi shart
  await db.exec('PRAGMA foreign_keys = ON;');
  await ensureColumns(db);
  const before = await inspectSchema(db);
  // Mavjud, lekin ustunlari mos kelmaydigan jadval — avtomatik tuzatilmaydi (ma'lumot xavfsizligi)
  const incompatible = before.problems.filter((p) => p.includes("ustun yo'q"));
  if (incompatible.length > 0) throw new SchemaError({ ...before, problems: incompatible });
  await applyMigrations(db, Math.min(before.userVersion, MIGRATIONS.length));
  await ensureColumns(db);

  let report = await inspectSchema(db);
  if (report.problems.length > 0) {
    await applyMigrations(db, 0);
    await ensureColumns(db);
    report = await inspectSchema(db);
  }
  if (report.problems.length > 0) throw new SchemaError(report);
  return report;
}
