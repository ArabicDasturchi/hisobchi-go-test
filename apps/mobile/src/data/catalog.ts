/**
 * Mahsulot katalogi va do'kon sozlamalari (qurilmadagi SQLite, sxema v5).
 *
 * Savdo qatorlari mahsulot nomi va narxining NUSXASINI saqlaydi (sale_lines), shuning uchun
 * katalogdagi narxni o'zgartirish yoki mahsulotni o'chirish saqlangan savdolarga ta'sir qilmaydi.
 */
import { ALLOWED_UNITS, MAX_UNIT_PRICE, type AllowedUnit } from '@hisobchi/core';
import type { SqlDb } from './db';
import { SaleValidationError } from './ledger';

export interface Product {
  id: string;
  name: string;
  unit: AllowedUnit;
  unitPrice: bigint;
  /** Tan narx = oxirgi kirim narxi (faqat kirim orqali o'zgaradi); kirim bo'lmasa null */
  costPrice: bigint | null;
  isActive: boolean;
  /** 'app' | 'agent' — qaysi yo'l bilan qo'shilgan */
  source: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  unit: AllowedUnit;
  unitPrice: bigint;
}

export const SETTING_KEYS = ['shop_name', 'shop_phone', 'shop_address'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

function validateProduct(input: ProductInput): string {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new SaleValidationError('Mahsulot nomi kiritilmagan');
  if (!(ALLOWED_UNITS as readonly string[]).includes(input.unit)) {
    throw new SaleValidationError(`Noma'lum o'lchov birligi: "${input.unit}"`);
  }
  if (input.unitPrice < 0n) throw new SaleValidationError('Narx manfiy bo\'lishi mumkin emas');
  if (input.unitPrice > MAX_UNIT_PRICE) throw new SaleValidationError('Narx ruxsat etilgan chegaradan oshgan');
  return name;
}

export function createCatalog(db: SqlDb, deps: { newId: () => string; now: () => string }) {
  return {
    async listProducts(search = '', opts: { includeArchived?: boolean } = {}): Promise<Product[]> {
      const q = search.trim();
      const conds: string[] = [];
      if (!opts.includeArchived) conds.push('is_active = 1');
      if (q) conds.push('name LIKE ? COLLATE NOCASE');
      const rows = await db.all<{
        id: string; name: string; unit: AllowedUnit; unit_price: string; cost: string | null; is_active: number; source: string; updated_at: string;
      }>(
        `SELECT id, name, unit, CAST(unit_price AS TEXT) AS unit_price, CAST(cost_price AS TEXT) AS cost, is_active, source, updated_at FROM products
         ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY name COLLATE NOCASE`,
        q ? [`%${q}%`] : [],
      );
      return rows.map((r) => ({
        id: r.id, name: r.name, unit: r.unit, unitPrice: BigInt(r.unit_price), costPrice: r.cost === null ? null : BigInt(r.cost),
        isActive: r.is_active === 1, source: r.source, updatedAt: r.updated_at,
      }));
    },

    /** Arxivlash: tarix (kirim/savdo) saqlanadi, tovar ro'yxat va tezkor savdoda ko'rinmaydi */
    async setProductActive(id: string, active: boolean): Promise<void> {
      await db.run('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, deps.now(), id]);
    },

    /** Yangi mahsulot yoki mavjudini tahrirlash (id berilsa). Nom takrorlanmasligi kerak. */
    async saveProduct(input: ProductInput, id?: string): Promise<string> {
      const name = validateProduct(input);
      return db.transaction(async (tx) => {
        const clash = await tx.get<{ id: string }>('SELECT id FROM products WHERE name = ? COLLATE NOCASE', [name]);
        if (clash && clash.id !== id) throw new SaleValidationError(`"${name}" nomli mahsulot allaqachon bor`);
        const now = deps.now();
        if (id) {
          const exists = await tx.get<{ id: string }>('SELECT id FROM products WHERE id = ?', [id]);
          if (!exists) throw new SaleValidationError('Mahsulot topilmadi');
          await tx.run('UPDATE products SET name = ?, unit = ?, unit_price = CAST(? AS INTEGER), updated_at = ? WHERE id = ?', [
            name,
            input.unit,
            input.unitPrice.toString(),
            now,
            id,
          ]);
          return id;
        }
        const newId = deps.newId();
        await tx.run(
          'INSERT INTO products (id, name, unit, unit_price, created_at, updated_at) VALUES (?, ?, ?, CAST(? AS INTEGER), ?, ?)',
          [newId, name, input.unit, input.unitPrice.toString(), now, now],
        );
        return newId;
      });
    },

    /** Katalogdan o'chirish — saqlangan savdolar o'zgarmaydi (ularda nusxa bor) */
    async deleteProduct(id: string): Promise<void> {
      const used = await db.get<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM purchase_lines WHERE product_id = ?) + (SELECT COUNT(*) FROM sale_lines WHERE product_id = ?)
                + (SELECT COUNT(*) FROM stock_adjustments WHERE product_id = ?) AS n`,
        [id, id, id],
      );
      if ((used?.n ?? 0) > 0) throw new SaleValidationError("Tovarda kirim/savdo tarixi bor: o'chirib bo'lmaydi, arxivlang");
      await db.run('DELETE FROM products WHERE id = ?', [id]);
    },

    async getSettings(): Promise<Record<SettingKey, string>> {
      const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
      const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ''])) as Record<SettingKey, string>;
      for (const r of rows) if ((SETTING_KEYS as readonly string[]).includes(r.key)) out[r.key as SettingKey] = r.value;
      return out;
    },

    async saveSettings(values: Partial<Record<SettingKey, string>>): Promise<void> {
      await db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(values)) {
          if (!(SETTING_KEYS as readonly string[]).includes(key)) continue;
          await tx.run(
            `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [key, (value ?? '').trim(), deps.now()],
          );
        }
      });
    },
  };
}

export type Catalog = ReturnType<typeof createCatalog>;
