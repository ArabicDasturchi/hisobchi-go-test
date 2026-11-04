/**
 * Kirim/Chiqim daftarlari: sana oralig'i filtri va ikki ko'rinish (sana bo'yicha, hamkor bo'yicha).
 * Sanalar Toshkent kuni (YYYY-MM-DD) — core `tashkentDate` bilan bir xil qoida (oldi-berdi ham shuni ishlatadi).
 */
import { tashkentDate } from '@hisobchi/core';

export type DatePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface DateRange {
  /** YYYY-MM-DD, kiritilgan; null = chegarasiz */
  from: string | null;
  /** YYYY-MM-DD, kiritilgan; null = chegarasiz */
  to: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Toshkent bugungi sanasidan `days` kun oldingi sana */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function presetRange(preset: Exclude<DatePreset, 'custom'>, nowIso: string): DateRange {
  const today = tashkentDate(nowIso);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'all':
      return { from: null, to: null };
  }
}

/** Foydalanuvchi kiritgan sana matni: bo'sh = chegarasiz; noto'g'ri bo'lsa xato */
export function parseDateInput(text: string): { ok: true; date: string | null } | { ok: false; message: string } {
  const t = text.trim().replace(/\./g, '-').replace(/\//g, '-');
  if (t === '') return { ok: true, date: null };
  // DD-MM-YYYY ham qabul qilinadi
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : t;
  if (!ISO_DATE.test(iso)) return { ok: false, message: `Sana formati noto'g'ri: "${text}" (kun-oy-yil yoki yil-oy-kun)` };
  const [y, m, d] = iso.split('-').map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) {
    return { ok: false, message: `Bunday sana yo'q: "${text}"` };
  }
  return { ok: true, date: iso };
}

export function validRange(r: DateRange): string | null {
  if (r.from && r.to && r.to < r.from) return "Tugash sanasi boshlanishidan oldin bo'lishi mumkin emas";
  return null;
}

export function inRange(date: string, r: DateRange): boolean {
  return (!r.from || date >= r.from) && (!r.to || date <= r.to);
}

export interface DayGroup<T> {
  date: string;
  items: T[];
}

/** Sana bo'yicha guruhlash (yangisi tepada); tartib guruh ichida saqlanadi */
export function groupByDate<T extends { date: string }>(items: readonly T[]): DayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([date, list]) => ({ date, items: list }));
}

/** "2026-10-30" -> "30.10.2026" */
export function displayDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}
