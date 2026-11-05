/**
 * Bosh sahifa modeli (UI'siz, testlanadi). Hisob faqat @hisobchi/core'da (`dayTotals`, `debtSummary`, `lowStock`);
 * bu fayl veb qatorlarini core kirishlariga o'giradi va kunlar bo'yicha qatorlar yig'adi.
 */
import {
  dayTotals,
  debtSummary,
  lowStock,
  tashkentDate,
  type DayPayment,
  type DaySale,
  type DaySaleLine,
  type DaySupplierPayment,
  type DayTotals,
  type DebtSummary,
  type LowStockItem,
} from '@hisobchi/core';
import type { BooksData } from './data/books';
import { supplierTotals } from './data/books';
import type { CustomerBalance } from './data/ledger';
import type { Customer, Payment, Product, SaleDoc, SaleLineCost } from './data/types';

const DAY_MS = 86_400_000;

export const toDaySales = (sales: readonly SaleDoc[]): DaySale[] =>
  sales.map((s) => ({ id: s.id, createdAt: s.created_at, posted: s.status === 'posted', total: s.subtotal, customerId: s.customer_id }));

export const toDayLines = (lines: readonly SaleLineCost[]): DaySaleLine[] =>
  lines.map((l) => ({ documentId: l.document_id, qtyMilli: l.qty_milli, unitPrice: l.unit_price, unitCost: l.unit_cost }));

export const toDayPayments = (payments: readonly Payment[]): DayPayment[] =>
  payments.map((p) => ({ createdAt: p.created_at, amount: p.amount, voided: p.void !== null }));

export const toDaySupplierPayments = (books: Pick<BooksData, 'payments'> | null): DaySupplierPayment[] =>
  (books?.payments ?? []).map((p) => ({ createdAt: p.created_at, amount: p.amount, method: p.method, voided: p.voided }));

/** `now` dan boshlab oxirgi `days` kun, Toshkent sanalari, eskidan yangiga */
export function lastDays(now: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => tashkentDate(new Date(now.getTime() - (days - 1 - i) * DAY_MS)));
}

export interface ChartPoint {
  key: string;
  /** "05.11" */
  label: string;
  sales: number;
  profit: number;
}

export interface DashboardInput {
  sales: readonly SaleDoc[];
  saleLines: readonly SaleLineCost[];
  payments: readonly Payment[];
  customers: readonly Customer[];
  balances: ReadonlyMap<string, CustomerBalance>;
  products: readonly Product[];
  stock: ReadonlyMap<string, bigint> | null;
  books: BooksData | null;
  now: Date;
}

export interface DashboardModel {
  today: DayTotals;
  debts: DebtSummary;
  lowStock: LowStockItem[];
  /** Tan narxi noma'lum faol tovarlar. `null` — ustun (006) yo'q, tekshirib bo'lmaydi */
  noCostProducts: Product[] | null;
}

export function buildDashboard(i: DashboardInput): DashboardModel {
  const date = tashkentDate(i.now);
  const today = dayTotals({
    sales: toDaySales(i.sales),
    lines: toDayLines(i.saleLines),
    payments: toDayPayments(i.payments),
    supplierPayments: toDaySupplierPayments(i.books),
    date,
  });

  const names = new Map(i.customers.map((c) => [c.id, c.name]));
  const customerDebts = [...i.balances.entries()].map(([id, b]) => ({ id, name: names.get(id) ?? "Noma'lum mijoz", debt: b.debt }));
  const supplierNames = new Map((i.books?.suppliers ?? []).map((s) => [s.id, s.name]));
  const supplierDebts = i.books ? [...supplierTotals(i.books).entries()].map(([id, t]) => ({ id, name: supplierNames.get(id) ?? 'Ta’minotchi', debt: t.outstanding })) : [];
  const debts = debtSummary(customerDebts, supplierDebts, 3);

  const byId = new Map(i.products.map((p) => [p.id, p]));
  const low = i.stock
    ? lowStock(
        [...i.stock.entries()].flatMap(([productId, qtyMilli]) => {
          const p = byId.get(productId);
          return p && p.is_active ? [{ productId, name: p.name, unit: p.unit, qtyMilli }] : [];
        }),
      )
    : [];

  const active = i.products.filter((p) => p.is_active);
  const noCostProducts = active.some((p) => p.cost_price !== undefined) ? active.filter((p) => p.cost_price === null || p.cost_price === undefined) : null;

  return { today, debts, lowStock: low, noCostProducts };
}

/** Grafik: kunlik savdo va foyda (core `dayTotals` har kun uchun). Number faqat ko'rsatish uchun */
export function chartSeries(i: Pick<DashboardInput, 'sales' | 'saleLines' | 'payments' | 'now'>, days: number): ChartPoint[] {
  const sales = toDaySales(i.sales);
  const lines = toDayLines(i.saleLines);
  const payments = toDayPayments(i.payments);
  return lastDays(i.now, days).map((date) => {
    const t = dayTotals({ sales, lines, payments, date });
    return { key: date, label: `${date.slice(8, 10)}.${date.slice(5, 7)}`, sales: Number(t.sales), profit: Number(t.profit) };
  });
}
