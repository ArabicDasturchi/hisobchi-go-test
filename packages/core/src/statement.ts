/**
 * @module statement
 * Hamkor (mijoz yoki ta'minotchi) oldi-berdisi: Eski, Tovar, Jami, Berildi, Ostatka.
 * PostgreSQL `partner_statement` bilan bir xil qoida (ikki mustaqil yo'l):
 *   - sana Toshkent sanasi (UTC+5, yozgi vaqt yo'q), ikkala chegara ham kiradi;
 *   - bekor qilingan hujjat va to'lov HECH QACHON hisobga olinmaydi (cancelled);
 *   - Eski = davr boshidan oldingi barcha yozuvlar bo'yicha qoldiq.
 */
import { settle, type Settlement } from './purchase.js';

export interface StatementEntry {
  /** goods = savdo (mijoz) yoki kirim (ta'minotchi); payment = to'lov */
  kind: 'goods' | 'payment';
  /** Toshkent sanasi, YYYY-MM-DD */
  date: string;
  amount: bigint;
  /** Bekor qilingan (savdo/kirim reversal, to'lov void) */
  cancelled: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TASHKENT_OFFSET_MS = 5 * 3600_000;

/** Vaqt belgisi (ISO, UTC yoki ofsetli) -> Toshkent sanasi "YYYY-MM-DD" */
export function tashkentDate(timestamp: string | Date): string {
  const ms = (typeof timestamp === 'string' ? new Date(timestamp) : timestamp).getTime();
  if (Number.isNaN(ms)) throw new Error(`Noto'g'ri vaqt: ${String(timestamp)}`);
  return new Date(ms + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

export function partnerStatement(entries: readonly StatementEntry[], from: string, to: string): Settlement {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from) throw new Error(`Davr noto'g'ri: ${from} - ${to}`);
  let openGoods = 0n;
  let openPaid = 0n;
  let goods = 0n;
  let paid = 0n;
  for (const e of entries) {
    if (e.cancelled) continue;
    if (!ISO_DATE.test(e.date)) throw new Error(`Sana noto'g'ri: ${e.date}`);
    if (e.amount < 0n) throw new Error(`Manfiy summa: ${e.amount}`);
    if (e.date < from) {
      if (e.kind === 'goods') openGoods += e.amount;
      else openPaid += e.amount;
    } else if (e.date <= to) {
      if (e.kind === 'goods') goods += e.amount;
      else paid += e.amount;
    }
  }
  return settle(openGoods - openPaid, goods, paid);
}

/** Hamkorning joriy qoldig'i (butun davr): mijozda qarz, ta'minotchida biz unga qarz */
export function partnerBalance(entries: readonly StatementEntry[]): bigint {
  let b = 0n;
  for (const e of entries) {
    if (e.cancelled) continue;
    b += e.kind === 'goods' ? e.amount : -e.amount;
  }
  return b;
}
