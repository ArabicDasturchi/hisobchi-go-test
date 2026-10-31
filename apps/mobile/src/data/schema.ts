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
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** ledger.ts so'rovlari foydalanadigan jadvallar va ustunlar */
export const REQUIRED_SCHEMA: Record<string, readonly string[]> = {
  customers: ['id', 'name', 'phone', 'note', 'created_at', 'updated_at'],
  sales: ['id', 'client_op_id', 'customer_id', 'total', 'ts_total', 'sql_total', 'line_count', 'raw_input', 'created_at'],
  sale_lines: ['id', 'sale_id', 'line_index', 'product_name', 'qty_milli', 'unit', 'unit_price', 'line_total', 'raw_text'],
  ledger_entries: ['id', 'sale_id', 'customer_id', 'entry_type', 'amount', 'created_at'],
  drafts: ['id', 'client_op_id', 'payload', 'updated_at'],
  sale_reversals: ['id', 'sale_id', 'client_op_id', 'customer_id', 'amount', 'reason', 'created_at'],
  sale_visibility_events: ['id', 'sale_id', 'action', 'created_at'],
  products: ['id', 'name', 'unit', 'unit_price', 'created_at', 'updated_at'],
  payments: ['id', 'client_op_id', 'customer_id', 'amount', 'method', 'note', 'created_at'],
  payment_voids: ['id', 'payment_id', 'reason', 'created_at'],
  settings: ['key', 'value', 'updated_at'],
  sync_log: ['shop_id', 'entity', 'local_id', 'pushed_at'],
};

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
  const before = await inspectSchema(db);
  // Mavjud, lekin ustunlari mos kelmaydigan jadval — avtomatik tuzatilmaydi (ma'lumot xavfsizligi)
  const incompatible = before.problems.filter((p) => p.includes("ustun yo'q"));
  if (incompatible.length > 0) throw new SchemaError({ ...before, problems: incompatible });
  await applyMigrations(db, Math.min(before.userVersion, MIGRATIONS.length));

  let report = await inspectSchema(db);
  if (report.problems.length > 0) {
    await applyMigrations(db, 0);
    report = await inspectSchema(db);
  }
  if (report.problems.length > 0) throw new SchemaError(report);
  return report;
}
