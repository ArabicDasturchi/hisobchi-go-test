/**
 * @module dashboard
 * Bosh sahifa agregatlari: kunlik savdo/foyda/kassa, qarz xulosasi, tugayotgan tovarlar.
 * Hammasi sof funksiyalar, faqat BigInt (pul va miqdor). Kun chegarasi Toshkent vaqti (`tashkentDate`).
 *
 * Qoidalar:
 *  - Faqat tasdiqlangan (posted) savdolar hisobga kiradi; bekor qilingan savdo, bekor qilingan to'lov kirmaydi.
 *  - Foyda faqat tan narxi ma'lum qatorlardan; noma'lumlari sanaladi (`unknownCostLines`), taxmin qilinmaydi.
 *  - Kassa (naqd) = mijozsiz savdolar + mijozdan NAQD olingan to'lovlar − ta'minotchiga NAQD berilgan to'lovlar.
 *    Karta va o'tkazma kassaga kirmaydi va kassadan ayrilmaydi: ular usul bo'yicha alohida yig'iladi (W6).
 *    Mijozsiz savdo to'liq to'langan: to'lov yozuvi yaratilmaydi, shuning uchun alohida qo'shiladi (ikki marta sanalmaydi).
 *    Mijozsiz savdo naqd deb olinadi: bunday savdoda usul saqlanmaydi (eski web savdolari, to'lov yozuvi yo'q).
 */
import { calculateLineTotal } from './calculation.js';
import { saleProfit } from './profit.js';
/** Standart "tugayotgan" chegarasi: 5 birlik (1 birlik = 1000) */
export const DEFAULT_LOW_STOCK_MILLI = 5_000n;
import { tashkentDate } from './statement.js';

export interface DaySale {
  id: string;
  /** ISO vaqt belgisi */
  createdAt: string;
  /** Faqat posted. Bekor qilingan savdo: false */
  posted: boolean;
  total: bigint;
  /** null = mijozsiz (naqd) savdo */
  customerId: string | null;
}

export interface DaySaleLine {
  documentId: string;
  qtyMilli: bigint;
  unitPrice: bigint;
  /** Savdo paytidagi tan narx snapshot'i; null = noma'lum */
  unitCost: bigint | null;
}

/** To'lov usullari (bazada CHECK: 'naqd' | 'karta' | 'otkazma') */
export type DayPaymentMethod = 'naqd' | 'karta' | 'otkazma';

/** Usul bo'yicha yig'indilar */
export type MethodTotals = Record<DayPaymentMethod, bigint>;

export interface DayPayment {
  createdAt: string;
  amount: bigint;
  /**
   * 'naqd' | 'karta' | 'otkazma'. Majburiy: yagona iste'molchi (web `toDayPayments`) usulni har doim beradi.
   * Usulsiz to'lov kassaga yozilib qolmasin: kassaga faqat aniq 'naqd' kiradi.
   */
  method: string;
  voided: boolean;
}

export interface DaySupplierPayment {
  createdAt: string;
  amount: bigint;
  /** 'naqd' | 'karta' | 'otkazma' */
  method: string;
  voided: boolean;
}

const zeroMethods = (): MethodTotals => ({ naqd: 0n, karta: 0n, otkazma: 0n });

/**
 * Faol (bekor qilinmagan) to'lovlarni usul bo'yicha yig'adi.
 * Noma'lum usul (bazadagi CHECK tufayli bo'lmasligi kerak) hech bir guruhga, xususan kassaga kirmaydi:
 * `total` da esa bor, shuning uchun farq ko'rinadi (yashirilmaydi).
 */
export function sumPaymentsByMethod(payments: readonly Pick<DayPayment, 'amount' | 'method' | 'voided'>[]): MethodTotals & { total: bigint } {
  const r = { ...zeroMethods(), total: 0n };
  for (const p of payments) {
    if (p.voided) continue;
    r.total += p.amount;
    if (p.method === 'naqd' || p.method === 'karta' || p.method === 'otkazma') r[p.method] += p.amount;
  }
  return r;
}

export interface DayTotalsInput {
  sales: readonly DaySale[];
  lines: readonly DaySaleLine[];
  payments: readonly DayPayment[];
  supplierPayments?: readonly DaySupplierPayment[];
  /** "YYYY-MM-DD" (Toshkent) */
  date: string;
}

export interface DayTotals {
  /** Kunlik savdo summasi (posted) */
  sales: bigint;
  saleCount: number;
  /** Tan narxi ma'lum qatorlar foydasi */
  profit: bigint;
  /** Foydaga kirmagan qatorlar (tan narxi noma'lum) */
  unknownCostLines: number;
  /** Qatorlari yuklanmagani uchun foydasi hisoblanmagan savdolar soni */
  salesWithoutLines: number;
  /** Kassa (faqat naqd): mijozsiz savdo + mijozdan naqd to'lovlar − ta'minotchiga naqd chiqim */
  cash: bigint;
  /** Mijozsiz savdolar (naqd deb olinadi) */
  cashSales: bigint;
  /** Mijozlardan qabul qilingan to'lovlar jami, hamma usullar (naqd + karta + o'tkazma) */
  paymentsIn: bigint;
  /** Mijozlardan qabul qilingan to'lovlar usul bo'yicha */
  paymentsInByMethod: MethodTotals;
  /** Ta'minotchiga berilgan NAQD to'lovlar (kassadan chiqim) */
  cashOut: bigint;
  /** Ta'minotchiga berilgan to'lovlar jami, hamma usullar */
  paymentsOut: bigint;
  /** Ta'minotchiga berilgan to'lovlar usul bo'yicha */
  paymentsOutByMethod: MethodTotals;
}

export function dayTotals(input: DayTotalsInput): DayTotals {
  const { date } = input;
  const sales = input.sales.filter((s) => s.posted && tashkentDate(s.createdAt) === date);
  const ids = new Set(sales.map((s) => s.id));

  let salesSum = 0n;
  let cashSales = 0n;
  for (const s of sales) {
    salesSum += s.total;
    if (s.customerId === null) cashSales += s.total;
  }

  const lines = input.lines.filter((l) => ids.has(l.documentId));
  const withLines = new Set(lines.map((l) => l.documentId));
  const sp = saleProfit(lines.map((l) => ({ qtyMilli: l.qtyMilli, unitPrice: l.unitPrice, unitCost: l.unitCost })));

  const onDay = <T extends { createdAt: string }>(xs: readonly T[]) => xs.filter((p) => tashkentDate(p.createdAt) === date);
  const { total: paymentsIn, ...paymentsInByMethod } = sumPaymentsByMethod(onDay(input.payments));
  const { total: paymentsOut, ...paymentsOutByMethod } = sumPaymentsByMethod(onDay(input.supplierPayments ?? []));
  const cashOut = paymentsOutByMethod.naqd;

  return {
    sales: salesSum,
    saleCount: sales.length,
    profit: sp.profit,
    unknownCostLines: sp.unknownCostLines.length,
    salesWithoutLines: sales.filter((s) => !withLines.has(s.id)).length,
    cash: cashSales + paymentsInByMethod.naqd - cashOut,
    cashSales,
    paymentsIn,
    paymentsInByMethod,
    cashOut,
    paymentsOut,
    paymentsOutByMethod,
  };
}

// ---------------------------------------------------------------------------
// Qarzlar
// ---------------------------------------------------------------------------

export interface DebtEntry {
  id: string;
  name: string;
  /** Musbat = qarz. Nol va manfiy (ortiqcha to'langan) qarz hisobiga kirmaydi */
  debt: bigint;
}

export interface DebtSummary {
  /** Menga qarzdorlar (mijozlar) jami */
  owedToMe: bigint;
  debtorCount: number;
  /** Eng katta qarzdorlar (kamayish tartibida) */
  topDebtors: DebtEntry[];
  /** Mening qarzim (ta'minotchilarga) jami */
  iOwe: bigint;
  supplierCount: number;
}

export function debtSummary(customers: readonly DebtEntry[], suppliers: readonly DebtEntry[], top = 3): DebtSummary {
  const owing = customers.filter((c) => c.debt > 0n).sort((a, b) => (a.debt === b.debt ? (a.id < b.id ? -1 : 1) : a.debt > b.debt ? -1 : 1));
  const iOweList = suppliers.filter((s) => s.debt > 0n);
  return {
    owedToMe: owing.reduce((s, c) => s + c.debt, 0n),
    debtorCount: owing.length,
    topDebtors: owing.slice(0, Math.max(0, top)),
    iOwe: iOweList.reduce((s, c) => s + c.debt, 0n),
    supplierCount: iOweList.length,
  };
}

// ---------------------------------------------------------------------------
// Tugayotgan tovarlar
// ---------------------------------------------------------------------------

export interface StockItemInput {
  productId: string;
  name: string;
  unit: string;
  qtyMilli: bigint;
}

export type LowStockLevel = 'negative' | 'zero' | 'low';

export interface LowStockItem extends StockItemInput {
  level: LowStockLevel;
}

/**
 * Qoldig'i `thresholdMilli` (standart 5 birlik) yoki kam tovarlar, eng kami birinchi.
 * Faqat ombor harakati bor (qoldig'i kuzatiladigan) tovarlar berilishi kerak: kuzatilmagan tovar "tugagan" emas.
 */
export function lowStock(items: readonly StockItemInput[], thresholdMilli: bigint = DEFAULT_LOW_STOCK_MILLI): LowStockItem[] {
  return items
    .filter((i) => i.qtyMilli <= thresholdMilli)
    .map((i): LowStockItem => ({ ...i, level: i.qtyMilli < 0n ? 'negative' : i.qtyMilli === 0n ? 'zero' : 'low' }))
    .sort((a, b) => (a.qtyMilli === b.qtyMilli ? (a.productId < b.productId ? -1 : 1) : a.qtyMilli < b.qtyMilli ? -1 : 1));
}

/** Qator summasi (bosh sahifa ro'yxatlari uchun): core formulasi, alohida export qulayligi uchun */
export function saleLineTotal(l: Pick<DaySaleLine, 'qtyMilli' | 'unitPrice'>): bigint {
  return calculateLineTotal(l.qtyMilli, l.unitPrice);
}
