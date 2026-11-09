import type { AdminShopRow, ShopsSort, Stage } from './types';

export interface ShopsParams {
  sort: ShopsSort;
  /** `?faol=7` → faqat oxirgi 7 kunda faol do'konlar; boshqa qiymat e'tiborga olinmaydi */
  activeDays: 7 | null;
}

/** URL parametrlaridan holat (noto'g'ri qiymat → standart) */
export function parseShopsParams(get: (key: string) => string | null): ShopsParams {
  const sort = get('sort') === 'new' ? 'new' : 'activity';
  return { sort, activeDays: get('faol') === '7' ? 7 : null };
}

/**
 * Faol do'konlar filtri (klientda: `admin_shops` da bunday parametr yo'q, uni o'zgartirmaymiz).
 * Ta'rif SQL bilan bir xil: oxirgi faollik oxirgi N kunda (docs/ADMIN.md).
 */
export function filterActive(rows: AdminShopRow[], days: number, now: Date = new Date()): AdminShopRow[] {
  const limit = now.getTime() - days * 86_400_000;
  return rows.filter((r) => r.last_activity_at !== null && new Date(r.last_activity_at).getTime() >= limit);
}

/** Do'konga yordam uchun qisqa tavsiya (bosqich va faolsizlikka qarab). Faqat matn, hisob emas. */
export function recommendation(stage: Stage, stale: boolean): string {
  const base: Record<Stage, string> = {
    1: "Do'kon ochgan, lekin tovar qo'shmagan. Egasiga qo'ng'iroq qiling: birinchi tovarlarni birga qo'shishni taklif qiling.",
    2: "Tovar bor, ta'minotchi yo'q. Ta'minotchi qo'shish va birinchi kirimni yozishni ko'rsating.",
    3: "Ta'minotchi bor, kirim yozilmagan. Birinchi kirimni (tovar qabul qilish) birga yozing.",
    4: "Kirim bor, savdo yo'q. Birinchi savdoni (ovoz yoki matn bilan) birga qilib ko'rsating.",
    5: "Savdo boshlangan, lekin muntazam emas. Kundalik foydalanishga o'tkazing: har kuni 5+ savdo.",
    6: "Faol do'kon. Fikr so'rang va nimani yaxshilash mumkinligini bilib oling.",
  };
  return stale ? `Faolsiz (7+ kun). ${base[stage]}` : base[stage];
}
