const TZ = 'Asia/Tashkent';

/** "3 kun oldin", "hozir"; sana yo'q bo'lsa «Faollik yo'q» */
export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Faollik yo'q";
  const diff = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'hozir';
  if (min < 60) return `${min} daqiqa oldin`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} kun oldin`;
  if (days < 60) return `${Math.floor(days / 7)} hafta oldin`;
  if (days < 365) return `${Math.floor(days / 30)} oy oldin`;
  return `${Math.floor(days / 365)} yil oldin`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** dd.MM.yyyy (Toshkent vaqti) */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d).replaceAll('/', '.');
}

/** dd.MM.yyyy HH:mm */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${formatDate(iso)} ${timeFmt.format(d)}`;
}

/** "2026-11-09" → "09.11" (grafik o'qi uchun) */
export function shortDay(day: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${m[2]}.${m[1]}` : day;
}

/** Sonlar: 1 234 (qattiq bo'sh joy bilan). Pul emas, faqat dona */
export function formatCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
