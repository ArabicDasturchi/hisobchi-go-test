/**
 * Eski menyu bandlarining URL'lari yangi joyga yo'naltiriladi (404 bermasin). `next.config.ts` shu ro'yxatni ishlatadi;
 * test shu yerdan o'qiydi. Yo'naltirish doimiy emas (permanent: false): menyu yana o'zgarsa brauzer keshlab qolmasin.
 * `/books/in` va `/books/out` — M5 (Ombor tablari) bilan qo'shiladi.
 */
export interface Redirect {
  source: string;
  destination: string;
  permanent: false;
}

const r = (source: string, destination: string): Redirect => ({ source, destination, permanent: false });

export const MENU_REDIRECTS: readonly Redirect[] = [
  r('/payments', '/customers'),
  r('/debts', '/customers?filter=debt'),
  r('/reports', '/dashboard/report'),
];
