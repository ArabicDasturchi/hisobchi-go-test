/**
 * @module ledger
 * Daftar varag'i (mijoz yoki ta'minotchi): ketma-ket qoldiq. Qog'oz daftar ustunlari:
 *   Sana | Eski | Tovar | Jami | Berildi | Ostatka
 * Har qatorning Eski'si oldingi qatorning Ostatka'siga zanjirday ulanadi.
 *
 * Qoidalar:
 *   - qator = kun (qog'oz daftardagidek): shu kundagi tovar va to'lovlar bitta qatorda;
 *   - bekor qilingan yozuv (teskari yozuv bilan) HECH QACHON hisobga kirmaydi, lekin qatorda "bekor qilingan"
 *     belgisi bilan ko'rinadi (o'chirilmaydi). Faqat bekor qilinganlardan iborat kun qatori jamiga tegmaydi;
 *   - ochilish qoldig'i (boshlang'ich qarz) har doim birinchi, alohida qator; u Tovar (kirim/savdo jami) hisobiga
 *     QO'SHILMAYDI, faqat Eski/Ostatka zanjiriga kiradi;
 *   - oxirgi Ostatka mustaqil ikkinchi yo'l (PostgreSQL `partner_statement`) bilan solishtiriladi: `assertLedgerMatches`.
 */
import { assertTotalsMatch } from './cross-check.js';
import { settle } from './purchase.js';

export type LedgerEntryKind = 'opening' | 'goods' | 'payment';

export interface LedgerEntry {
  /** Yozuv identifikatori (hujjat yoki to'lov id) */
  id: string;
  kind: LedgerEntryKind;
  /** Toshkent sanasi, YYYY-MM-DD */
  date: string;
  /** Kun ichidagi tartib uchun vaqt belgisi (ISO); bo'sh bo'lsa id bo'yicha */
  at?: string;
  amount: bigint;
  /** Bekor qilingan (teskari yozuv bor) */
  cancelled: boolean;
}

export interface LedgerRow<E extends LedgerEntry = LedgerEntry> {
  /** Qator kaliti: ochilish uchun `opening:<id>`, kun uchun sana */
  key: string;
  kind: 'opening' | 'day';
  date: string;
  /** Eski = oldingi qatorning Ostatka'si */
  old: bigint;
  /** Tovar (savdo/kirim). Ochilish qatorida har doim 0 */
  goods: bigint;
  /** Ochilish qoldig'i summasi (faqat ochilish qatorida) */
  opening: bigint;
  /** Jami = Eski + Ochilish + Tovar */
  total: bigint;
  /** Berildi (to'lovlar) */
  paid: bigint;
  /** Ostatka = Jami − Berildi */
  balance: bigint;
  /** Qatordagi barcha yozuvlar bekor qilingan */
  allCancelled: boolean;
  /** Qatordagi yozuvlar (bekor qilinganlari ham), tartiblangan */
  entries: E[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validate(e: LedgerEntry): void {
  if (!ISO_DATE.test(e.date)) throw new Error(`Sana noto'g'ri: ${e.date}`);
  if (e.amount < 0n) throw new Error(`Manfiy summa: ${e.amount}`);
}

const cmp = (a: LedgerEntry, b: LedgerEntry): number => {
  const ka = a.at ?? '';
  const kb = b.at ?? '';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

export function ledgerRows<E extends LedgerEntry>(entries: readonly E[]): LedgerRow<E>[] {
  for (const e of entries) validate(e);
  const rows: LedgerRow<E>[] = [];
  let balance = 0n;

  // 1. Ochilish qoldiqlari — doim boshida (sanasidan qat'i nazar), alohida qator
  const openings = entries.filter((e) => e.kind === 'opening').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : cmp(a, b)));
  for (const o of openings) {
    const opening = o.cancelled ? 0n : o.amount;
    const s = settle(balance, 0n, 0n);
    rows.push({
      key: `opening:${o.id}`,
      kind: 'opening',
      date: o.date,
      old: s.opening,
      goods: 0n,
      opening,
      total: s.total + opening,
      paid: 0n,
      balance: s.total + opening,
      allCancelled: o.cancelled,
      entries: [o],
    });
    balance = balance + opening;
  }

  // 2. Kunlar bo'yicha
  const byDate = new Map<string, E[]>();
  for (const e of entries) {
    if (e.kind === 'opening') continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  for (const date of [...byDate.keys()].sort()) {
    const list = byDate.get(date)!.sort(cmp);
    let goods = 0n;
    let paid = 0n;
    for (const e of list) {
      if (e.cancelled) continue;
      if (e.kind === 'goods') goods += e.amount;
      else paid += e.amount;
    }
    const s = settle(balance, goods, paid);
    rows.push({
      key: date,
      kind: 'day',
      date,
      old: s.opening,
      goods: s.goods,
      opening: 0n,
      total: s.total,
      paid: s.paid,
      balance: s.balance,
      allCancelled: list.every((e) => e.cancelled),
      entries: list,
    });
    balance = s.balance;
  }
  return rows;
}

/** Varaqning joriy qoldig'i (oxirgi qatorning Ostatka'si; yozuv yo'q bo'lsa 0) */
export function ledgerBalance(rows: readonly LedgerRow[]): bigint {
  return rows.length === 0 ? 0n : rows[rows.length - 1]!.balance;
}

/**
 * Zanjir butunligi: har qatorning Eski'si oldingi Ostatka'ga teng, Jami = Eski + ochilish + Tovar, Ostatka = Jami − Berildi.
 * Buzilsa — xato (jimgina tuzatilmaydi).
 */
export function assertLedgerChain(rows: readonly LedgerRow[]): void {
  let prev = 0n;
  for (const r of rows) {
    assertTotalsMatch(`eski:${r.key}`, r.old, prev);
    assertTotalsMatch(`jami:${r.key}`, r.total, r.old + r.opening + r.goods);
    assertTotalsMatch(`ostatka:${r.key}`, r.balance, r.total - r.paid);
    prev = r.balance;
  }
}

/** Varaq qoldig'ini mustaqil ikkinchi yo'l (SQL `partner_statement`) bilan solishtiradi; mos kelmasa `TotalsMismatchError` */
export function assertLedgerMatches(rows: readonly LedgerRow[], independentBalance: bigint, label = 'daftar'): bigint {
  assertLedgerChain(rows);
  return assertTotalsMatch(`${label}:ostatka`, ledgerBalance(rows), independentBalance);
}
