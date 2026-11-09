import type { FunnelKey, Stage, StepKey } from './types';

/**
 * Bosqich ta'rifi SQL'da (`_admin_stage_of`, 011 migratsiya) — yagona manba. Bu nusxa FAQAT demo ma'lumot
 * uchun va testda SQL bilan bir xil jadvalga tekshiriladi. Haqiqiy rejimda bosqich RPC'dan keladi.
 */
export function stageOf(f: { products: number; suppliers: number; purchases: number; sales: number; sales7d: number }): Stage {
  if (f.sales > 0 && f.sales7d >= 5) return 6;
  if (f.sales > 0) return 5;
  if (f.purchases > 0) return 4;
  if (f.suppliers > 0) return 3;
  if (f.products > 0) return 2;
  return 1;
}

export const STAGE_LABELS: Record<Stage, string> = {
  1: "Do'kon yaratdi",
  2: "Tovar qo'shdi",
  3: "Ta'minotchi qo'shdi",
  4: 'Kirim yozdi',
  5: 'Birinchi savdo',
  6: 'Faol',
};

/** Qisqa belgi (jadvalda) */
export const STAGE_SHORT: Record<Stage, string> = {
  1: "Do'kon",
  2: 'Tovar',
  3: "Ta'minotchi",
  4: 'Kirim',
  5: 'Savdo',
  6: 'Faol',
};

export const FUNNEL_LABELS: Record<FunnelKey, string> = {
  registered: "Ro'yxatdan o'tdi",
  shop: "Do'kon yaratdi",
  product: "Tovar qo'shdi",
  supplier: "Ta'minotchi qo'shdi",
  purchase: 'Kirim yozdi',
  sale: 'Birinchi savdo',
  active: '7 kunda 5+ savdo',
};

export const STEP_LABELS: Record<StepKey, string> = {
  shop: "Do'kon yaratdi",
  product: 'Birinchi tovar',
  supplier: "Birinchi ta'minotchi",
  purchase: 'Birinchi kirim',
  sale: 'Birinchi savdo',
};
