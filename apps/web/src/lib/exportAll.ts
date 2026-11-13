/**
 * B5: savdogar o'z ma'lumotini to'liq yuklab oladi (CSV, Excel'da ochiladi) — chiqish erkinligi va qo'lda zaxira.
 * Hisob yo'q: summalar bazadagi qiymatlar (savdo jami = server `subtotal`), qarz esa mavjud `balanceOf` dan.
 * UI'siz, testlanadi. Fayl yaratish `toCsv` (formula in'yeksiyasidan himoyalangan).
 */
import type { BooksData } from './data/books';
import type { Customer, Payment, Product, SaleDoc } from './data/types';
import { toCsv } from './csv';

export interface ExportInput {
  sales: readonly SaleDoc[];
  payments: readonly Payment[];
  customers: readonly Customer[];
  products: readonly Product[];
  books: BooksData | null;
}

export interface ExportFile {
  name: string;
  rows: number;
  csv: string;
}

const date = (iso: string) => iso.slice(0, 19).replace('T', ' ');
const status = (s: string) => (s === 'reversed' ? 'Bekor qilingan' : 'Tasdiqlangan');

export function buildExports(input: ExportInput, stamp: string): ExportFile[] {
  const customerName = new Map(input.customers.map((c) => [c.id, c.name]));
  const supplierName = new Map((input.books?.suppliers ?? []).map((s) => [s.id, s.name]));
  const productName = new Map(input.products.map((p) => [p.id, p.name]));
  const files: ExportFile[] = [];
  const add = (name: string, header: string[], rows: (string | number | bigint | null)[][]) => files.push({ name: `${name}_${stamp}.csv`, rows: rows.length, csv: toCsv(header, rows) });

  add('savdolar', ['ID', 'Sana', 'Mijoz', 'Holat', "Summa (so'm)"],
    input.sales.map((s) => [s.id, date(s.created_at), s.customer_id ? (customerName.get(s.customer_id) ?? s.customer_id) : 'Mijozsiz', status(s.status), s.subtotal]));
  add('tolovlar', ['ID', 'Sana', 'Mijoz', 'Usul', 'Holat', 'Izoh', "Summa (so'm)"],
    input.payments.map((p) => [p.id, date(p.created_at), customerName.get(p.customer_id) ?? p.customer_id, p.method, p.void ? 'Bekor qilingan' : 'Faol', p.void ? p.void.reason : (p.note ?? ''), p.amount]));
  add('mijozlar', ['ID', 'Nomi', 'Telefon', 'Holat', "Qo'shilgan"],
    input.customers.filter((c) => c.kind !== 'one_time').map((c) => [c.id, c.name, c.phone ?? '', c.is_active ? 'Faol' : 'Arxivda', date(c.created_at)]));
  add('mahsulotlar', ['ID', 'Nomi', 'Birlik', "Sotuv narxi (so'm)", "Tan narx (so'm)", 'Holat'],
    input.products.map((p) => [p.id, p.name, p.unit, p.last_price, p.cost_price ?? null, p.is_active ? 'Faol' : 'Arxivda']));
  if (input.books) {
    const b = input.books;
    add('kirimlar', ['ID', 'Sana', "Ta'minotchi", 'Turi', 'Holat', "Summa (so'm)"],
      b.purchases.map((p) => [p.id, p.doc_date, supplierName.get(p.supplier_id) ?? p.supplier_id, p.kind === 'opening' ? "Boshlang'ich qarz" : p.kind === 'debt' ? 'Qarz yozuvi' : 'Kirim', status(p.status), p.subtotal]));
    add('kirim_qatorlari', ['Kirim ID', 'Tovar', 'Soni (×1000)', "Tan narx (so'm)", "Qator jami (so'm)"],
      b.lines.map((l) => [l.document_id, l.product_name ?? productName.get(l.product_id) ?? l.product_id, l.qty_milli, l.unit_cost, l.line_total]));
    add('taminotchi_tolovlari', ['ID', 'Sana', "Ta'minotchi", 'Usul', 'Holat', 'Izoh', "Summa (so'm)"],
      b.payments.map((p) => [p.id, date(p.created_at), supplierName.get(p.supplier_id) ?? p.supplier_id, p.method, p.voided ? 'Bekor qilingan' : 'Faol', p.note ?? '', p.amount]));
    add('taminotchilar', ['ID', 'Nomi', 'Telefon', 'Holat'], b.suppliers.map((s) => [s.id, s.name, s.phone ?? '', s.is_active ? 'Faol' : 'Arxivda']));
    add('ombor', ['Tovar ID', 'Nomi', 'Birlik', 'Qoldiq (×1000)'], b.stock.map((s) => [s.product_id, s.name, s.unit, s.qty_milli]));
  }
  return files;
}
