/**
 * @module aged-debt
 * Eskirgan qarz ("30+ kunlik qarz"): to'lovlar eng eski tovarni birinchi yopadi (FIFO), shuning uchun
 * `days` kundan ko'proq oldin olingan tovar uchun hali to'lanmagan qism =
 *   max(0, joriy qoldiq − oxirgi `days` kundagi tovar).
 * Ochilish qoldig'i (boshlang'ich qarz) har doim eski hisoblanadi. Bekor qilingan yozuv hisobga kirmaydi.
 */
import type { LedgerEntry } from './ledger.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" dan `days` kun oldingi sana (UTC kalendar arifmetikasi, vaqt zonasi yo'q) */
export function isoMinusDays(date: string, days: number): string {
  if (!ISO_DATE.test(date)) throw new Error(`Sana noto'g'ri: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/**
 * `asOf` (Toshkent sanasi) holatiga ko'ra `days` kundan eski qarz. Sana `asOf − days` dan KEYIN bo'lgan tovar "yangi"
 * hisoblanadi (masalan asOf = 2026-11-10, days = 30 bo'lsa, 2026-10-11 va undan keyingi tovar yangi).
 */
export function agedDebt(entries: readonly LedgerEntry[], asOf: string, days = 30): bigint {
  const cutoff = isoMinusDays(asOf, days);
  let balance = 0n;
  let recentGoods = 0n;
  for (const e of entries) {
    if (e.cancelled) continue;
    if (e.amount < 0n) throw new Error(`Manfiy summa: ${e.amount}`);
    if (e.kind === 'payment') {
      balance -= e.amount;
    } else {
      balance += e.amount;
      if (e.kind === 'goods' && e.date > cutoff) recentGoods += e.amount;
    }
  }
  const aged = balance - recentGoods;
  return aged > 0n ? aged : 0n;
}
