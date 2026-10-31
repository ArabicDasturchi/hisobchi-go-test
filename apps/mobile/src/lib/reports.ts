/**
 * Hisobotlar uchun sof funksiyalar (BigInt, float'siz). Kunlar qurilma vaqt zonasida guruhlanadi.
 */
import type { SaleSummary } from '../data/ledger';

export interface DayTotal {
  /** YYYY-MM-DD (mahalliy) */
  day: string;
  activeTotal: bigint;
  activeCount: number;
  reversedTotal: bigint;
  reversedCount: number;
}

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Oxirgi `days` kun (bugun bilan) — har kun uchun faol va bekor qilingan savdolar */
export function salesByDay(sales: readonly SaleSummary[], days: number, now = new Date()): DayTotal[] {
  const result: DayTotal[] = [];
  const index = new Map<string, DayTotal>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDayKey(d.toISOString());
    const row = { day: key, activeTotal: 0n, activeCount: 0, reversedTotal: 0n, reversedCount: 0 };
    result.push(row);
    index.set(key, row);
  }
  for (const s of sales) {
    const row = index.get(localDayKey(s.createdAt));
    if (!row) continue;
    if (s.reversal) {
      row.reversedTotal += s.total;
      row.reversedCount += 1;
    } else {
      row.activeTotal += s.total;
      row.activeCount += 1;
    }
  }
  return result;
}
